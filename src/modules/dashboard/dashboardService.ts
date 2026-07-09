import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';
import { hasMinRole } from '../../utils/helpers';

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
