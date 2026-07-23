import supabase from '../../supabaseClient';
import type { UserProfile } from '../auth';
import { logger } from '../../diagnostics';
import { hasMinRole } from '../../utils/helpers';

const log = logger.for('admin/adminService');

/** 获取成员列表 */
export async function fetchAllMembers(userRole: string, userDept: string): Promise<UserProfile[]> {
  let query = supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  // 部门负责人只看本部门；presidium+ / president / teacher / developer 可看全部
  if (hasMinRole(userRole, 'dept_head') && !hasMinRole(userRole, 'presidium')) {
    query = query.eq('department', userDept);
  }

  const { data, error } = await query;
  if (error) { log.error('fetchAllMembers 查询失败', error); return []; }
  return data as UserProfile[];
}

/** 修改成员角色 */
export async function updateMemberRole(memberId: string, newRole: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', memberId);

  if (error) { log.error('updateMemberRole 更新失败', error); return false; }
  return true;
}

/** 移除成员 */
export async function removeMember(memberId: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ role: 'removed' })
    .eq('id', memberId);

  if (error) { log.error('removeMember 移除失败', error); return false; }
  return true;
}

/** 生成邀请码 */
export async function generateInviteCode(department: string, role: string): Promise<string | null> {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { error } = await supabase
    .from('invite_codes')
    .insert({ code, department, role });

  if (error) { log.error('generateInviteCode 生成失败', error); return null; }
  return code;
}

export interface InviteCode {
  id: string;
  code: string;
  department: string;
  role: string;
  is_used: boolean;
  used_by: string | null;
  used_by_name?: string;
  created_at: string;
}

/** 调动成员到其他部门 */
export async function transferMember(memberId: string, newDepartment: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ department: newDepartment })
    .eq('id', memberId);

  if (error) { log.error('transferMember 调动失败', error); return false; }
  return true;
}

/** 获取邀请码列表 */
export async function fetchInviteCodes(department?: string): Promise<InviteCode[]> {
  let query = supabase
    .from('invite_codes')
    .select('*, used_user:used_by(name)')
    .order('created_at', { ascending: false });

  if (department) {
    query = query.eq('department', department);
  }

  const { data, error } = await query;
  if (error || !data) { log.error('fetchInviteCodes 查询失败', error); return []; }

  return data.map((c: Record<string, unknown>) => ({
    ...c,
    used_by_name: (c.used_user as { name: string } | null)?.name ?? '-',
  })) as unknown as InviteCode[];
}

/** 删除邀请码（仅限未被使用的） */
export async function deleteInviteCode(codeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('invite_codes')
    .delete()
    .eq('id', codeId);

  if (error) { log.error('deleteInviteCode 删除失败', error); return false; }
  return true;
}

/** 停用邀请码 */
export async function deactivateInviteCode(codeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('invite_codes')
    .update({ is_used: true })
    .eq('id', codeId);

  if (error) { log.error('deactivateInviteCode 停用失败', error); return false; }
  return true;
}

/** 管理员重置成员密码（随机 8 位字符串） */
export async function resetMemberPassword(authId: string): Promise<string | false> {
  const newPassword = Math.random().toString(36).slice(-8);
  const { error } = await supabase.rpc('reset_user_password', {
    user_id: authId,
    new_password: newPassword,
  });

  if (error) { log.error('resetMemberPassword 重置失败', error); return false; }
  return newPassword;
}

// ========== 成员任务聚合 ==========
export interface MemberWorkSummary {
  user: UserProfile;
  pending: number;
  in_progress: number;
  review: number;
  completed: number;
  overdue: number;
  total: number;
}

/** 获取所有成员的任务状态分布 */
export async function fetchMemberWorkSummaries(userRole: string, userDept: string): Promise<MemberWorkSummary[]> {
  let memberQuery = supabase.from('users').select('*').neq('role', 'removed').order('created_at', { ascending: false });
  if (hasMinRole(userRole, 'dept_head') && !hasMinRole(userRole, 'presidium')) {
    memberQuery = memberQuery.eq('department', userDept);
  }
  const { data: members } = await memberQuery;
  if (!members || members.length === 0) return [];

  const memberIds = members.map(m => m.id);
  const now = new Date().toISOString();

  // 一次性拉取所有成员的任务，客户端聚合（替代 N×5 查询）
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('assigned_to, status, deadline')
    .in('assigned_to', memberIds);

  // 初始化计数器
  const map = new Map<string, { pending: number; in_progress: number; review: number; completed: number; overdue: number }>();
  for (const m of members) {
    map.set(m.id, { pending: 0, in_progress: 0, review: 0, completed: 0, overdue: 0 });
  }

  // 单次遍历聚合
  for (const t of allTasks || []) {
    const c = map.get(t.assigned_to);
    if (!c) continue;
    switch (t.status) {
      case 'pending': c.pending++; break;
      case 'in_progress': c.in_progress++; break;
      case 'review': c.review++; break;
      case 'completed': c.completed++; break;
    }
    if (t.status !== 'completed' && t.deadline && t.deadline < now) {
      c.overdue++;
    }
  }

  return members.map(m => {
    const c = map.get(m.id)!;
    return {
      user: m as UserProfile,
      pending: c.pending,
      in_progress: c.in_progress,
      review: c.review,
      completed: c.completed,
      overdue: c.overdue,
      total: c.pending + c.in_progress + c.review + c.completed,
    };
  });
}

// ========== 数据看板：使用分析 ==========

export interface AnalyticsSummary {
  totalEvents: number;
  activeUsers7d: number;
  recent7d: number;
  topModule: string;
  pageRanking: { module: string; count: number }[];
  eventStats: { event_type: string; count: number }[];
  recentErrors: { created_at: string; module: string; action: string; metadata: unknown }[];
}

/** 获取数据看板汇总（仅管理员调用） */
export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalRes,
    activeRes,
    recent7dRes,
    pageRankRes,
    eventStatsRes,
    errorRes,
  ] = await Promise.all([
    supabase.from('usage_events').select('id', { count: 'exact', head: true }),
    supabase.from('usage_events')
      .select('user_id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo)
      .not('user_id', 'is', null),
    supabase.from('usage_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    supabase.from('usage_events')
      .select('module, id')
      .eq('event_type', 'page_view')
      .gte('created_at', sevenDaysAgo),
    supabase.from('usage_events')
      .select('event_type, id')
      .gte('created_at', sevenDaysAgo),
    supabase.from('usage_events')
      .select('created_at, module, action, metadata')
      .eq('event_type', 'error')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  // 页面访问排名（客户端 GROUP BY）
  const moduleCount: Record<string, number> = {};
  for (const r of (pageRankRes.data || [])) {
    const m = (r as { module: string }).module || 'unknown';
    moduleCount[m] = (moduleCount[m] || 0) + 1;
  }
  const pageRanking = Object.entries(moduleCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([module, count]) => ({ module, count }));

  const topModule = pageRanking.length > 0 ? pageRanking[0].module : '暂无数据';

  // 事件类型统计
  const typeCount: Record<string, number> = {};
  for (const r of (eventStatsRes.data || [])) {
    const t = (r as { event_type: string }).event_type;
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  const eventStats = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .map(([event_type, count]) => ({ event_type, count }));

  return {
    totalEvents: totalRes.count ?? 0,
    activeUsers7d: activeRes.count ?? 0,
    recent7d: recent7dRes.count ?? 0,
    topModule,
    pageRanking,
    eventStats,
    recentErrors: (errorRes.data || []) as AnalyticsSummary['recentErrors'],
  };
}
