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

/** 停用邀请码 */
export async function deactivateInviteCode(codeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('invite_codes')
    .update({ is_used: true })
    .eq('id', codeId);

  if (error) { log.error('deactivateInviteCode 停用失败', error); return false; }
  return true;
}

/** 管理员重置成员密码（默认 123456） */
export async function resetMemberPassword(authId: string): Promise<boolean> {
  const { error } = await supabase.rpc('reset_user_password', {
    user_id: authId,
    new_password: '123456',
  });

  if (error) { log.error('resetMemberPassword 重置失败', error); return false; }
  return true;
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
