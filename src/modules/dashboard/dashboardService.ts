import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';
import { hasMinRole, getDepartmentLabel } from '../../utils/helpers';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

const log = logger.for('dashboard/dashboardService');

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

  const addDeptFilter = <T extends { eq: (col: string, val: string) => T }>(q: T) => {
    return isGlobalRole ? q : q.eq('assigned_department', department);
  };

  const queries: Promise<{ count: number } | null>[] = [
    // 待审核任务（仅 dept_head+ 可见）
    (async () => {
      if (!canReview) return { count: 0 };
      let q = supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'review');
      q = addDeptFilter(q);
      const { count, error } = await q;
      if (error) { log.error('reviewTasks 查询失败', error); return null; }
      return { count: count ?? 0 };
    })(),
    // 逾期任务（全员可见本部门）
    (async () => {
      let q = supabase.from('tasks').select('id', { count: 'exact', head: true })
        .neq('status', 'completed')
        .lt('deadline', now);
      q = addDeptFilter(q);
      const { count, error } = await q;
      if (error) { log.error('overdueTasks 查询失败', error); return null; }
      return { count: count ?? 0 };
    })(),
    // 今日截止（全员可见本部门）
    (async () => {
      let q = supabase.from('tasks').select('id', { count: 'exact', head: true })
        .neq('status', 'completed')
        .gte('deadline', todayStart.toISOString())
        .lte('deadline', todayEnd.toISOString());
      q = addDeptFilter(q);
      const { count, error } = await q;
      if (error) { log.error('todayDeadline 查询失败', error); return null; }
      return { count: count ?? 0 };
    })(),
  ];

  const results = await Promise.all(queries);

  return {
    reviewTasks: results[0]?.count ?? 0,
    overdueTasks: results[1]?.count ?? 0,
    todayDeadline: results[2]?.count ?? 0,
  };
}

// ========== 最近动态 ==========

/** 获取最近动态（3 表各 LIMIT 5，前端合并排序） */
export async function fetchRecentActivity(
  userId: string,
  department: string,
): Promise<ActivityItem[]> {
  const [noticesRes, forumRes, submissionsRes] = await Promise.all([
    // 最近公告
    supabase
      .from('notices')
      .select('id, title, created_at')
      .eq('department', department)
      .order('created_at', { ascending: false })
      .limit(5),
    // 最近论坛帖子
    supabase
      .from('forum_posts')
      .select('id, title, created_at')
      .or(`department.eq.${department},collaborating_departments.cs.{${department}}`)
      .order('created_at', { ascending: false })
      .limit(5),
    // 最近任务提交
    supabase
      .from('task_submissions')
      .select('submitted_at, task:tasks!inner(id, title)')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(5),
  ]);

  const items: ActivityItem[] = [];

  for (const n of noticesRes.data || []) {
    items.push({
      type: 'notice',
      title: n.title as string,
      description: '发布了新公告',
      time: n.created_at as string,
      link: '/notices',
    });
  }

  for (const p of forumRes.data || []) {
    items.push({
      type: 'forum',
      title: p.title as string,
      description: '新帖子',
      time: p.created_at as string,
      link: '/forum',
    });
  }

  for (const s of submissionsRes.data || []) {
    const task = s.task as unknown as { title: string } | { title: string }[] | null;
    const taskTitle = Array.isArray(task) ? task[0]?.title : task?.title;
    items.push({
      type: 'submission',
      title: taskTitle ?? '未知任务',
      description: '你提交了任务成果',
      time: s.submitted_at as string,
      link: '/tasks',
    });
  }

  // 按时间倒序合并排序
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return items.slice(0, 10);
}

/** 获取最近提交的任务列表（统计卡片"进行中"点击时查看） */
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

  const { data, error } = await q;
  if (error) {
    log.error('fetchDashboardReviewTasks 失败', error);
    return [];
  }
  return (data || []) as { id: string; title: string; deadline: string | null }[];
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
  const addDeptFilter = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    isGlobalRole ? q : q.eq('assigned_department', department);

  const weekLabel = `${now.startOf('isoWeek').format('M/D')} - ${now.endOf('isoWeek').format('M/D')}`;

  // 并行：4 个 count + 1 个数据查询（用于 Top 部门统计）
  const [
    completedThisRes,
    completedLastRes,
    totalThisRes,
    overdueThisRes,
    topDeptRes,
  ] = await Promise.all([
    (async () => {
      let q = supabase.from('tasks').select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('updated_at', weekStart).lte('updated_at', weekEnd);
      q = addDeptFilter(q);
      const { count } = await q;
      return count ?? 0;
    })(),
    (async () => {
      let q = supabase.from('tasks').select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('updated_at', lastWeekStart).lte('updated_at', lastWeekEnd);
      q = addDeptFilter(q);
      const { count } = await q;
      return count ?? 0;
    })(),
    (async () => {
      let q = supabase.from('tasks').select('id', { count: 'exact', head: true })
        .gte('created_at', weekStart).lte('created_at', weekEnd);
      q = addDeptFilter(q);
      const { count } = await q;
      return count ?? 0;
    })(),
    (async () => {
      let q = supabase.from('tasks').select('id', { count: 'exact', head: true })
        .neq('status', 'completed')
        .lt('deadline', weekEnd);
      q = addDeptFilter(q);
      const { count } = await q;
      return count ?? 0;
    })(),
    (async () => {
      let q = supabase.from('tasks').select('assigned_department')
        .eq('status', 'completed')
        .gte('updated_at', weekStart).lte('updated_at', weekEnd);
      q = addDeptFilter(q);
      const { data } = await q;
      return data || [];
    })(),
  ]);

  // 客户端 GROUP BY：计算本周最活跃部门
  const deptMap: Record<string, number> = {};
  for (const row of topDeptRes) {
    const d = (row as { assigned_department: string }).assigned_department;
    deptMap[d] = (deptMap[d] || 0) + 1;
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
    weekLabel,
    completedThisWeek: completedThisRes,
    completedLastWeek: completedLastRes,
    totalThisWeek: totalThisRes,
    overdueThisWeek: overdueThisRes,
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
  const addDeptFilter = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    isGlobalRole ? q : q.eq('assigned_department', department);

  // 并行：3 个数据查询
  const [allTasksRes, completedRes, usersRes] = await Promise.all([
    // 本月全部任务
    (async () => {
      let q = supabase.from('tasks')
        .select('id, assigned_department, assigned_to, status, deadline')
        .gte('created_at', monthStart).lte('created_at', monthEnd);
      q = addDeptFilter(q);
      const { data } = await q;
      return (data || []) as { id: string; assigned_department: string; assigned_to: string | null; status: string; deadline: string | null }[];
    })(),
    // 本月完成任务（按执行人分组用于排行榜）
    (async () => {
      let q = supabase.from('tasks')
        .select('id, assigned_to')
        .eq('status', 'completed')
        .gte('updated_at', monthStart).lte('updated_at', monthEnd);
      q = addDeptFilter(q);
      const { data } = await q;
      return (data || []) as { id: string; assigned_to: string | null }[];
    })(),
    // 用户名列表（用于排行榜展示）
    supabase.from('users').select('id, name').neq('role', 'removed'),
  ]);

  // 客户端 GROUP BY：按部门
  const deptStats: Record<string, { completed: number; total: number; overdue: number }> = {};
  for (const t of allTasksRes) {
    const d = t.assigned_department;
    if (!deptStats[d]) deptStats[d] = { completed: 0, total: 0, overdue: 0 };
    deptStats[d].total++;
    if (t.status === 'completed') deptStats[d].completed++;
    if (t.status !== 'completed' && t.deadline && dayjs(t.deadline).isBefore(now)) deptStats[d].overdue++;
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
  for (const t of completedRes) {
    if (t.assigned_to) {
      personMap[t.assigned_to] = (personMap[t.assigned_to] || 0) + 1;
    }
  }
  const userNameMap: Record<string, string> = {};
  for (const u of (usersRes.data || [])) {
    const user = u as { id: string; name: string };
    userNameMap[user.id] = user.name;
  }
  const byPerson = Object.entries(personMap)
    .map(([userId, completed]) => ({
      userId,
      name: userNameMap[userId] ?? '未知',
      completed,
    }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 10);

  const totalCompleted = completedRes.length;
  const totalOverdue = allTasksRes.filter(
    t => t.status !== 'completed' && t.deadline && dayjs(t.deadline).isBefore(now),
  ).length;
  const totalTasks = allTasksRes.length;

  return {
    monthLabel,
    byDepartment,
    byPerson,
    totalCompleted,
    totalOverdue,
    totalTasks,
  };
}
