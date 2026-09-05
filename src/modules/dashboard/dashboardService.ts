import supabase from '@/supabaseClient';
import { hasMinRole, getDepartmentLabel } from '@/utils/helpers';
import { unwrap, unwrapCount } from '@/lib/sb';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

// ========== 类型 ==========

export interface DashboardStats {
  reviewTasks: number;
  overdueTasks: number;
  todayDeadline: number;
}

export interface ActivityItem {
  type: 'notice' | 'forum' | 'submission';
  title: string;
  description: string;
  time: string;
  link: string;
}

/** 首页待办条目（待审核 / 已逾期） */
export interface TodoTaskItem {
  id: string;
  title: string;
  kind: 'review' | 'overdue';
  deadline: string | null;
  assignee_name: string | null;
}

function tasksCountQuery(departmentFilter: string | null) {
  let q = supabase.from('tasks').select('id', { count: 'exact', head: true });
  if (departmentFilter) q = q.eq('assigned_department', departmentFilter);
  return q;
}

type TaskCountQuery = ReturnType<typeof tasksCountQuery>;

// ========== 统计卡片 ==========

/** 获取首页工作台 3 张统计卡片数据 */
export async function fetchDashboardStats(
  _userId: string,
  department: string,
  role: string,
): Promise<DashboardStats> {
  const now = new Date().toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // 部门过滤：president+ 看全部，其他人看本部门
  const isGlobalRole = hasMinRole(role, 'president');
  const canReview = hasMinRole(role, 'dept_head');

  const countTasks = (label: string, extra: (q: TaskCountQuery) => TaskCountQuery) =>
    unwrapCount(label, extra(tasksCountQuery(isGlobalRole ? null : department)));

  const [reviewTasks, overdueTasks, todayDeadline] = await Promise.all([
    canReview
      ? countTasks('reviewTasks', (q) => q.eq('status', 'review'))
      : Promise.resolve(0),
    countTasks('overdueTasks', (q) =>
      q.neq('status', 'completed').lt('deadline', now)),
    countTasks('todayDeadline', (q) =>
      q.neq('status', 'completed')
        .gte('deadline', todayStart.toISOString())
        .lte('deadline', todayEnd.toISOString())),
  ]);

  return { reviewTasks, overdueTasks, todayDeadline };
}

// ========== 首页待办聚合（v4 新增）==========

/**
 * 首页待办列表：dept_head+ 附带待审核任务，全员可见逾期任务。
 * 两段查询并行，各取最新 6 条，前端标注类型后合并。
 */
export async function fetchTodoTasks(
  department: string,
  role: string,
): Promise<TodoTaskItem[]> {
  const now = new Date().toISOString();
  const isGlobalRole = hasMinRole(role, 'president');
  const canReview = hasMinRole(role, 'dept_head');

  const baseSelect = 'id, title, deadline, assignee:users!assigned_to(name)';

  const overdueQuery = (() => {
    let q = supabase.from('tasks').select(baseSelect)
      .neq('status', 'completed')
      .lt('deadline', now)
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(6);
    if (!isGlobalRole) q = q.eq('assigned_department', department);
    return unwrap('todoOverdue', q);
  })();

  const reviewQuery = canReview
    ? (() => {
        let q = supabase.from('tasks').select(baseSelect)
          .eq('status', 'review')
          .order('updated_at', { ascending: false })
          .limit(6);
        if (!isGlobalRole) q = q.eq('assigned_department', department);
        return unwrap('todoReview', q);
      })()
    : Promise.resolve([]);

  const [overdueRows, reviewRows] = await Promise.all([overdueQuery, reviewQuery]);

  const mapRow = (
    row: (typeof overdueRows)[number],
    kind: TodoTaskItem['kind'],
  ): TodoTaskItem => ({
    id: row.id,
    title: row.title,
    kind,
    deadline: row.deadline,
    assignee_name: row.assignee?.name ?? null,
  });

  return [
    ...overdueRows.map((r) => mapRow(r, 'overdue')),
    ...reviewRows.map((r) => mapRow(r, 'review')),
  ].slice(0, 10);
}

// ========== 最近动态 ==========

/** 获取最近动态（3 表各 LIMIT 5，前端合并排序） */
export async function fetchRecentActivity(
  userId: string,
  department: string,
): Promise<ActivityItem[]> {
  const [notices, forumPosts, submissions] = await Promise.all([
    unwrap('recentNotices', supabase
      .from('notices')
      .select('id, title, created_at')
      .eq('department', department)
      .order('created_at', { ascending: false })
      .limit(5)),
    unwrap('recentForumPosts', supabase
      .from('forum_posts')
      .select('id, title, created_at')
      .or(`department.eq.${department},collaborating_departments.cs.{${department}}`)
      .order('created_at', { ascending: false })
      .limit(5)),
    unwrap('recentSubmissions', supabase
      .from('task_submissions')
      .select('submitted_at, task:tasks!inner(id, title)')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(5)),
  ]);

  const items: ActivityItem[] = [];

  for (const n of notices) {
    items.push({
      type: 'notice',
      title: n.title,
      description: '发布了新公告',
      time: n.created_at,
      link: '/notices',
    });
  }

  for (const p of forumPosts) {
    items.push({
      type: 'forum',
      title: p.title,
      description: '新帖子',
      time: p.created_at,
      link: '/forum',
    });
  }

  for (const s of submissions) {
    const task = s.task as unknown as { title: string } | { title: string }[] | null;
    const taskTitle = Array.isArray(task) ? task[0]?.title : task?.title;
    items.push({
      type: 'submission',
      title: taskTitle ?? '未知任务',
      description: '你提交了任务成果',
      time: s.submitted_at,
      link: '/tasks',
    });
  }

  // 按时间倒序合并排序
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return items.slice(0, 10);
}

/** 获取待审核任务列表（统计卡片点击时查看） */
export async function fetchDashboardReviewTasks(
  department: string,
  role: string,
): Promise<{ id: string; title: string; deadline: string | null }[]> {
  let q = supabase
    .from('tasks')
    .select('id, title, deadline')
    .eq('status', 'review')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (!hasMinRole(role, 'president')) {
    q = q.eq('assigned_department', department);
  }

  return unwrap('dashboardReviewTasks', q);
}

// ========== 数据简报（Phase 6）==========

export interface WeeklyBrief {
  weekLabel: string;
  completedThisWeek: number;
  completedLastWeek: number;
  totalThisWeek: number;
  overdueThisWeek: number;
  topDepartment: { dept: string; label: string; count: number } | null;
}

export interface MonthlyReport {
  monthLabel: string;
  byDepartment: { dept: string; label: string; completed: number; total: number; overdue: number }[];
  byPerson: { userId: string; name: string; completed: number }[];
  totalCompleted: number;
  totalOverdue: number;
  totalTasks: number;
}

/** 本周简报 — 仅 dept_head+ 可见 */
export async function fetchWeeklyBrief(
  department: string,
  role: string,
): Promise<WeeklyBrief | null> {
  if (!hasMinRole(role, 'dept_head')) return null;

  const now = dayjs();
  const weekStart = now.startOf('isoWeek').toISOString();
  const weekEnd = now.endOf('isoWeek').toISOString();
  const lastWeekStart = now.subtract(1, 'week').startOf('isoWeek').toISOString();
  const lastWeekEnd = now.subtract(1, 'week').endOf('isoWeek').toISOString();

  const isGlobalRole = hasMinRole(role, 'president');

  const countTasks = (label: string, extra: (q: TaskCountQuery) => TaskCountQuery) =>
    unwrapCount(label, extra(tasksCountQuery(isGlobalRole ? null : department)));

  const [completedThisWeek, completedLastWeek, totalThisWeek, overdueThisWeek, topDeptRows] =
    await Promise.all([
      countTasks('briefCompletedThis', (q) =>
        q.eq('status', 'completed').gte('updated_at', weekStart).lte('updated_at', weekEnd)),
      countTasks('briefCompletedLast', (q) =>
        q.eq('status', 'completed').gte('updated_at', lastWeekStart).lte('updated_at', lastWeekEnd)),
      countTasks('briefTotalThis', (q) =>
        q.gte('created_at', weekStart).lte('created_at', weekEnd)),
      countTasks('briefOverdue', (q) =>
        q.neq('status', 'completed').lt('deadline', weekEnd)),
      (() => {
        let q = supabase.from('tasks').select('assigned_department')
          .eq('status', 'completed')
          .gte('updated_at', weekStart).lte('updated_at', weekEnd);
        if (!isGlobalRole) q = q.eq('assigned_department', department);
        return unwrap('briefTopDept', q);
      })(),
    ]);

  // 客户端 GROUP BY：计算本周最活跃部门
  const deptMap: Record<string, number> = {};
  for (const row of topDeptRows) {
    deptMap[row.assigned_department] = (deptMap[row.assigned_department] || 0) + 1;
  }
  let topDepartment: WeeklyBrief['topDepartment'] = null;
  let maxCount = 0;
  for (const [dept, count] of Object.entries(deptMap)) {
    if (count > maxCount) {
      maxCount = count;
      topDepartment = { dept, label: getDepartmentLabel(dept), count };
    }
  }

  return {
    weekLabel: `${now.startOf('isoWeek').format('M/D')} - ${now.endOf('isoWeek').format('M/D')}`,
    completedThisWeek,
    completedLastWeek,
    totalThisWeek,
    overdueThisWeek,
    topDepartment,
  };
}

/** 月报详细数据 — 仅 dept_head+ 可见 */
export async function fetchMonthlyReport(
  department: string,
  role: string,
): Promise<MonthlyReport | null> {
  if (!hasMinRole(role, 'dept_head')) return null;

  const now = dayjs();
  const monthStart = now.startOf('month').toISOString();
  const monthEnd = now.endOf('month').toISOString();
  const monthLabel = now.format('YYYY年M月');

  const isGlobalRole = hasMinRole(role, 'president');

  // 并行：3 个数据查询
  const [allTasks, completedTasks, users] = await Promise.all([
    (() => {
      let q = supabase.from('tasks')
        .select('id, assigned_department, assigned_to, status, deadline')
        .gte('created_at', monthStart).lte('created_at', monthEnd);
      if (!isGlobalRole) q = q.eq('assigned_department', department);
      return unwrap('reportAllTasks', q);
    })(),
    (() => {
      let q = supabase.from('tasks')
        .select('id, assigned_to')
        .eq('status', 'completed')
        .gte('updated_at', monthStart).lte('updated_at', monthEnd);
      if (!isGlobalRole) q = q.eq('assigned_department', department);
      return unwrap('reportCompleted', q);
    })(),
    unwrap('reportUsers', supabase.from('users').select('id, name').neq('role', 'removed')),
  ]);

  // 客户端 GROUP BY：按部门
  const deptStats: Record<string, { completed: number; total: number; overdue: number }> = {};
  for (const t of allTasks) {
    if (!deptStats[t.assigned_department]) deptStats[t.assigned_department] = { completed: 0, total: 0, overdue: 0 };
    const s = deptStats[t.assigned_department];
    s.total++;
    if (t.status === 'completed') s.completed++;
    if (t.status !== 'completed' && t.deadline && dayjs(t.deadline).isBefore(now)) s.overdue++;
  }
  // 按部门统计已完成 + 总数
  const byDepartment = Object.entries(deptStats).map(([dept, s]) => ({
    dept,
    label: getDepartmentLabel(dept),
    completed: s.completed,
    total: s.total,
    overdue: s.overdue,
  }));

  // 客户端 GROUP BY：按人（仅已完成任务）
  const personMap: Record<string, number> = {};
  for (const t of completedTasks) {
    if (t.assigned_to) {
      personMap[t.assigned_to] = (personMap[t.assigned_to] || 0) + 1;
    }
  }
  const userNameMap: Record<string, string> = {};
  for (const u of users) {
    userNameMap[u.id] = u.name;
  }
  const byPerson = Object.entries(personMap)
    .map(([userId, completed]) => ({
      userId,
      name: userNameMap[userId] ?? '未知',
      completed,
    }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 10);

  const totalCompleted = completedTasks.length;
  const totalOverdue = allTasks.filter(
    t => t.status !== 'completed' && t.deadline && dayjs(t.deadline).isBefore(now),
  ).length;
  const totalTasks = allTasks.length;

  return {
    monthLabel,
    byDepartment,
    byPerson,
    totalCompleted,
    totalOverdue,
    totalTasks,
  };
}
