import supabase from '../../supabaseClient';

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
