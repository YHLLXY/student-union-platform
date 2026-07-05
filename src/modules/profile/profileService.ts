import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';

const log = logger.for('profile/profileService');

export interface UserStats {
  completed: number;
  pending: number;
  overdue: number;
}

/** 获取用户任务统计 */
export async function fetchUserStats(userId: string): Promise<UserStats> {
  const { data: completed, error: err1 } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .eq('status', 'completed');

  if (err1) log.error('fetchUserStats completed 查询失败', err1);

  const { data: pending, error: err2 } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .in('status', ['pending', 'in_progress', 'review']);

  if (err2) log.error('fetchUserStats pending 查询失败', err2);

  // 逾期：状态不是completed且截止时间已过
  const { data: overdue, error: err3 } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .neq('status', 'completed')
    .lt('deadline', new Date().toISOString());

  if (err3) log.error('fetchUserStats overdue 查询失败', err3);

  return {
    completed: completed?.length ?? 0,
    pending: pending?.length ?? 0,
    overdue: overdue?.length ?? 0,
  };
}

/** 按月份获取用户任务（用于日历） */
export async function fetchUserTasksByMonth(userId: string, year: number, month: number) {
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, deadline')
    .eq('assigned_to', userId)
    .gte('deadline', start)
    .lte('deadline', end)
    .order('deadline', { ascending: true });

  if (error) { log.error('fetchUserTasksByMonth 查询失败', error); return []; }
  return data ?? [];
}

/** 修改密码 */
export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

// ========== 热力图数据 ==========
export interface HeatmapDay {
  date: string;
  count: number;
  level: number;
  tasks: { id: string; title: string }[];
}

/** 获取用户指定月份的任务提交热力图数据（基于实际提交日期） */
export async function fetchHeatmapData(userId: string, year: number, month: number): Promise<HeatmapDay[]> {
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data, error } = await supabase
    .from('task_submissions')
    .select('submitted_at, task:tasks!inner(id, title)')
    .eq('user_id', userId)
    .gte('submitted_at', start)
    .lte('submitted_at', end)
    .order('submitted_at', { ascending: true });

  if (error) {
    log.error('fetchHeatmapData 查询失败', error);
    return [];
  }

  // 按日期分组，收集任务信息（去重：同一天同一任务多次提交算一次）
  const dayMap: Record<string, { id: string; title: string }[]> = {};
  for (const s of data || []) {
    if (s.submitted_at) {
      const day = (s.submitted_at as string).slice(0, 10);
      if (!dayMap[day]) dayMap[day] = [];
      const task = s.task as unknown as { id: string; title: string } | { id: string; title: string }[] | null;
      if (task) {
        const taskObj = Array.isArray(task) ? task[0] : task;
        if (taskObj && !dayMap[day].some((t) => t.id === taskObj.id)) {
          dayMap[day].push({ id: taskObj.id, title: taskObj.title });
        }
      }
    }
  }

  const lastDay = new Date(year, month, 0).getDate();
  const days: HeatmapDay[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const tasks = dayMap[date] ?? [];
    const count = tasks.length;
    let level = 0;
    if (count >= 5) level = 4;
    else if (count >= 3) level = 3;
    else if (count >= 2) level = 2;
    else if (count >= 1) level = 1;
    days.push({ date, count, level, tasks });
  }
  return days;
}

// ========== 排行榜数据 ==========
export interface LeaderboardEntry {
  user_id: string;
  name: string;
  completed: number;
  rank: number;
}

/** 获取本部门成员本月完成数排名 */
export async function fetchLeaderboard(department: string): Promise<LeaderboardEntry[]> {
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: members } = await supabase
    .from('users')
    .select('id, name')
    .eq('department', department)
    .neq('role', 'removed');

  if (!members || members.length === 0) return [];

  const results: LeaderboardEntry[] = [];
  for (const m of members) {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', m.id)
      .eq('status', 'completed')
      .gte('deadline', start);

    results.push({ user_id: m.id, name: m.name, completed: count ?? 0, rank: 0 });
  }

  results.sort((a, b) => b.completed - a.completed);
  results.forEach((r, i) => { r.rank = i + 1; });

  return results;
}

// ========== 通讯录数据 ==========
export interface MemberInfo {
  id: string;
  name: string;
  student_id: string;
  department: string;
  role: string;
  avatar_url: string | null;
  in_progress: number;
  overdue: number;
}

/** 获取所有成员（含任务计数），不包含已移除的用户 */
export async function fetchAllMembers(): Promise<MemberInfo[]> {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, student_id, department, role, avatar_url')
    .neq('role', 'removed')
    .order('department')
    .order('name');

  if (error) {
    log.error('fetchAllMembers 查询失败', error);
    return [];
  }

  if (!users || users.length === 0) return [];

  // 并行聚合每个成员的任务计数
  const members = await Promise.all(
    users.map(async (u: Record<string, unknown>) => {
      const { count: inProgress } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', u.id)
        .in('status', ['pending', 'in_progress', 'review']);

      const { count: overdue } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', u.id)
        .neq('status', 'completed')
        .lt('deadline', new Date().toISOString());

      return {
        id: u.id as string,
        name: u.name as string,
        student_id: u.student_id as string,
        department: u.department as string,
        role: u.role as string,
        avatar_url: u.avatar_url as string | null,
        in_progress: inProgress ?? 0,
        overdue: overdue ?? 0,
      };
    }),
  );

  return members;
}

// ========== 里程碑汇总 ==========
/** 获取当前用户的里程碑汇总（逾期数 + 近日截止数） */
export async function fetchMilestoneSummary(userId: string): Promise<{
  milestoneOverdue: number;
  milestoneUpcoming: number;
}> {
  const now = new Date().toISOString();
  const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  // 查询用户所有关联的、有里程碑的任务
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('assigned_to', userId)
    .eq('has_milestones', true);

  if (!tasks || tasks.length === 0) return { milestoneOverdue: 0, milestoneUpcoming: 0 };

  const taskIds = tasks.map((t: { id: string }) => t.id);

  const { count: overdue } = await supabase
    .from('task_milestones')
    .select('id', { count: 'exact', head: true })
    .in('task_id', taskIds)
    .eq('status', 'pending')
    .lt('deadline', now);

  const { count: upcoming } = await supabase
    .from('task_milestones')
    .select('id', { count: 'exact', head: true })
    .in('task_id', taskIds)
    .eq('status', 'pending')
    .gte('deadline', now)
    .lte('deadline', threeDays);

  return {
    milestoneOverdue: overdue ?? 0,
    milestoneUpcoming: upcoming ?? 0,
  };
}

// ========== 部门新人指南 ==========
export interface DeptGuide {
  id?: string;
  department: string;
  basic_info: {
    leader?: string;
    teacher?: string;
    office?: string;
    group_chat?: string;
  };
  templates: { title: string; url: string }[];
  faqs: { question: string; answer: string }[];
  updated_by?: string;
  updated_at?: string;
}

/** 获取某个部门的指南 */
export async function fetchDeptGuide(department: string): Promise<DeptGuide | null> {
  const { data, error } = await supabase
    .from('department_guides')
    .select('*')
    .eq('department', department)
    .maybeSingle();

  if (error || !data) return null;
  return data as DeptGuide;
}

/** 保存/更新部门指南（upsert by department） */
export async function updateDeptGuide(
  department: string,
  guide: {
    basic_info: DeptGuide['basic_info'];
    templates: DeptGuide['templates'];
    faqs: DeptGuide['faqs'];
  },
  userId: string,
): Promise<boolean> {
  // 先查是否存在
  const existing = await fetchDeptGuide(department);

  if (existing?.id) {
    const { error } = await supabase
      .from('department_guides')
      .update({
        ...guide,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) {
      log.error('updateDeptGuide 更新失败', error);
      return false;
    }
  } else {
    const { error } = await supabase
      .from('department_guides')
      .insert({
        department,
        ...guide,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });
    if (error) {
      log.error('updateDeptGuide 插入失败', error);
      return false;
    }
  }
  return true;
}

// ========== 任务汇总（用于统计卡片弹窗） ==========
export interface TaskBrief {
  id: string;
  title: string;
  priority: string;
  status: string;
  deadline: string | null;
  assigned_department: string;
}

/** 获取用户的所有任务（用于统计卡片 Modal，限制 100 条） */
export async function fetchAllUserTasks(userId: string): Promise<{
  completed: TaskBrief[];
  pending: TaskBrief[];
  overdue: TaskBrief[];
}> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, priority, status, deadline, assigned_department')
    .eq('assigned_to', userId)
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    log.error('fetchAllUserTasks 查询失败', error);
    return { completed: [], pending: [], overdue: [] };
  }

  const tasks = (data || []) as TaskBrief[];
  const now = new Date().toISOString();

  return {
    completed: tasks.filter((t) => t.status === 'completed'),
    pending: tasks.filter((t) => t.status !== 'completed' && (!t.deadline || t.deadline >= now)),
    overdue: tasks.filter((t) => t.status !== 'completed' && t.deadline && t.deadline < now),
  };
}
