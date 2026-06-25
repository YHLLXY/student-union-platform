import supabase from '../../supabaseClient';
import type { UserProfile } from '../auth';

/** 获取成员列表 */
export async function fetchAllMembers(userRole: string, userDept: string): Promise<UserProfile[]> {
  let query = supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  // 部门负责人只看本部门；presidium+ / president / teacher 可看全部
  if (userRole === 'dept_head') {
    query = query.eq('department', userDept);
  }

  const { data, error } = await query;
  if (error) return [];
  return data as UserProfile[];
}

/** 修改成员角色 */
export async function updateMemberRole(memberId: string, newRole: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', memberId);

  return !error;
}

/** 移除成员 */
export async function removeMember(memberId: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ role: 'removed' })
    .eq('id', memberId);

  return !error;
}

/** 生成邀请码 */
export async function generateInviteCode(department: string, role: string): Promise<string | null> {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { error } = await supabase
    .from('invite_codes')
    .insert({ code, department, role });

  if (error) return null;
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

  return !error;
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
  if (error || !data) return [];

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

  return !error;
}

/** 管理员重置成员密码（默认 123456） */
export async function resetMemberPassword(authId: string): Promise<boolean> {
  const { error } = await supabase.rpc('reset_user_password', {
    user_id: authId,
    new_password: '123456',
  });

  return !error;
}
