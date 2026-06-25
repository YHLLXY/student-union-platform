import supabase from '../../supabaseClient';

export interface UserProfile {
  id: string;
  auth_id: string;
  name: string;
  student_id: string;
  department: string;
  role: string;
  created_at: string;
}

/** 检查邀请码是否有效，返回邀请码记录（含对应部门） */
export async function checkInviteCode(code: string) {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', code)
    .eq('is_used', false)
    .single();

  if (error || !data) return null;
  return data;
}

/** 检查学号是否已注册 */
export async function checkStudentId(studentId: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('student_id', studentId)
    .single();

  return !!data;
}

/** 注册：创建 Auth 用户 → 写入 users 表 → 标记邀请码已用 */
export async function signUp(
  name: string,
  studentId: string,
  inviteCode: string,
  password: string,
  department: string,
  role: string,
): Promise<{ user: UserProfile | null; error: string | null }> {
  const email = `${studentId}@stuunion.org`;

  // 1. 创建 Supabase Auth 用户
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { user: null, error: authError?.message ?? '注册失败，请重试' };
  }

  // 2. 写入 users 表（角色从邀请码获取，不再硬编码）
  const { data: userData, error: userError } = await supabase
    .from('users')
    .insert({
      auth_id: authData.user.id,
      name,
      student_id: studentId,
      department,
      role,
    })
    .select('*')
    .single();

  if (userError) {
    return { user: null, error: userError.message };
  }

  // 3. 标记邀请码已使用
  await supabase
    .from('invite_codes')
    .update({ is_used: true, used_by: userData.id })
    .eq('code', inviteCode);

  return { user: userData as UserProfile, error: null };
}

/** 教师注册：使用教师邀请码注册 */
export async function signUpTeacher(
  name: string,
  teacherId: string,
  inviteCode: string,
  password: string,
): Promise<{ user: UserProfile | null; error: string | null }> {
  const email = `${teacherId}@stuunion.org`;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { user: null, error: authError?.message ?? '注册失败，请重试' };
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .insert({
      auth_id: authData.user.id,
      name,
      student_id: teacherId,
      department: '', // 教师无部门
      role: 'teacher',
    })
    .select('*')
    .single();

  if (userError) {
    return { user: null, error: userError.message };
  }

  await supabase
    .from('invite_codes')
    .update({ is_used: true, used_by: userData.id })
    .eq('code', inviteCode);

  return { user: userData as UserProfile, error: null };
}

/** 检查教师邀请码是否有效（role=teacher 的邀请码） */
export async function checkTeacherCode(code: string) {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', code)
    .eq('is_used', false)
    .eq('role', 'teacher')
    .single();

  if (error || !data) return null;
  return data;
}

/** 登录 */
export async function signIn(
  studentId: string,
  password: string,
): Promise<{ user: UserProfile | null; error: string | null }> {
  const email = `${studentId}@stuunion.org`;

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { user: null, error: authError?.message ?? '登录失败' };
  }

  // 获取用户完整信息
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authData.user.id)
    .single();

  if (userError || !userData) {
    return { user: null, error: '用户信息不存在' };
  }

  return { user: userData as UserProfile, error: null };
}

/** 获取当前登录用户 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', session.user.id)
    .single();

  return data as UserProfile | null;
}

/** 退出登录 */
export async function signOut() {
  await supabase.auth.signOut();
}

/** 修改密码 */
export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error };
}

/** 监听认证状态变化 */
export function onAuthStateChange(callback: (user: UserProfile | null) => void) {
  return supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }

    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', session.user.id)
      .single();

    callback(data as UserProfile | null);
  });
}
