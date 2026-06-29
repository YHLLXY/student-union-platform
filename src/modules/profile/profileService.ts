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
  const { data: completed } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .eq('status', 'completed');

  const { data: pending } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .in('status', ['pending', 'in_progress', 'review']);

  // 逾期：状态不是completed且截止时间已过
  const { data: overdue } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .neq('status', 'completed')
    .lt('deadline', new Date().toISOString());

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

  const { data } = await supabase
    .from('tasks')
    .select('id, title, status, deadline')
    .eq('assigned_to', userId)
    .gte('deadline', start)
    .lte('deadline', end)
    .order('deadline', { ascending: true });

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
}

/** 获取用户指定月份的任务完成热力图数据 */
export async function fetchHeatmapData(userId: string, year: number, month: number): Promise<HeatmapDay[]> {
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data, error } = await supabase
    .from('tasks')
    .select('deadline')
    .eq('assigned_to', userId)
    .eq('status', 'completed')
    .gte('deadline', start)
    .lte('deadline', end);

  if (error) {
    log.error('fetchHeatmapData 查询失败', error);
    return [];
  }

  const countMap: Record<string, number> = {};
  for (const t of data || []) {
    if (t.deadline) {
      const day = t.deadline.slice(0, 10);
      countMap[day] = (countMap[day] ?? 0) + 1;
    }
  }

  const days: HeatmapDay[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const count = countMap[date] ?? 0;
    let level = 0;
    if (count >= 5) level = 4;
    else if (count >= 3) level = 3;
    else if (count >= 2) level = 2;
    else if (count >= 1) level = 1;
    days.push({ date, count, level });
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
