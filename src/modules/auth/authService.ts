import supabase from '@/supabaseClient';
import { logger } from '@/diagnostics';

const log = logger.for('auth/authService');

export interface UserProfile {
  id: string;
  auth_id: string;
  name: string;
  student_id: string;
  department: string;
  role: string;
  created_at: string;
  avatar_url: string | null;
  /**
   * 是否已看过新人引导（v4.5.0 新增）。注意：v4.4.0 之前写入的本地缓存里没有这个字段，
   * 因此读取处一律用 `=== false` 判断 —— undefined 绝不能触发引导，
   * 否则升级到 v4.5.0 的瞬间全体老用户都会被弹一次。
   */
  onboarded: boolean;
  contact_phone: string | null;
  contact_email: string | null;
}

/**
 * 密码强度校验
 *
 * 规则：
 *   1. 至少 8 个字符
 *   2. 必须包含至少一个字母（a-z / A-Z）
 *   3. 必须包含至少一个数字（0-9）
 *
 * 不做：大小写混合、特殊字符 —— 学生内网工具过度要求适得其反
 */
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (!password || password.length < 8) {
    return { valid: false, message: '密码至少需要 8 位' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: '密码必须包含字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: '密码必须包含数字' };
  }
  return { valid: true, message: '' };
}

/** 邀请码行（validate_invite_code 返回的 jsonb 与表结构同形） */
interface InviteCodeRecord {
  code: string;
  role: string;
  department: string;
  expires_at: string | null;
  used_count: number | null;
  max_uses: number | null;
  is_used: boolean | null;
  revoked_at: string | null;
}

/**
 * 按 code 精确取一条邀请码。
 * 首选 rpc（RLS 收紧后匿名不可直查表，见 supabase-security-fix-step1.sql）；
 * 函数尚未创建（PGRST202，第 1 步 SQL 未执行）时回退旧的直查写法，两种执行顺序都能工作。
 */
async function fetchInviteRow(code: string): Promise<InviteCodeRecord | null> {
  const { data, error } = await supabase.rpc('validate_invite_code', { code_input: code });
  if (!error) return (data ?? null) as InviteCodeRecord | null;
  if (error.code !== 'PGRST202') {
    log.error('validate_invite_code 调用失败', error);
    return null;
  }
  const { data: row, error: legacyError } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', code)
    .single();
  if (legacyError) {
    log.error('邀请码查询失败', legacyError);
    return null;
  }
  return (row ?? null) as InviteCodeRecord | null;
}

/** 邀请码业务规则复核（撤销 / 过期 / 用尽）——数据库只负责取数 */
function pickValidInvite(data: InviteCodeRecord, code: string): InviteCodeRecord | null {
  // 1. 已被撤销
  if (data.revoked_at) {
    console.warn('[auth] 邀请码已被撤销:', code);
    return null;
  }
  // 2. 已过期
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    console.warn('[auth] 邀请码已过期:', code, data.expires_at);
    return null;
  }
  // 3. 已用完
  const usedCount = data.used_count ?? (data.is_used ? 1 : 0);
  const maxUses = data.max_uses ?? 1;
  if (usedCount >= maxUses) {
    console.warn('[auth] 邀请码已用完:', code, usedCount, '/', maxUses);
    return null;
  }
  return data;
}

/** 检查邀请码是否有效（数据库取数 + 客户端规则复核） */
export async function checkInviteCode(code: string) {
  const row = await fetchInviteRow(code);
  return row ? pickValidInvite(row, code) : null;
}

/** 检查学号是否已注册（rpc 只返回布尔，不暴露用户数据） */
export async function checkStudentId(studentId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_student_registered', { student_id_input: studentId });
  if (!error) return data === true;
  if (error.code !== 'PGRST202') {
    log.error('check_student_registered 调用失败', error);
    return false;
  }
  const { data: row, error: legacyError } = await supabase
    .from('users')
    .select('id')
    .eq('student_id', studentId)
    .single();
  if (legacyError) { log.error('checkStudentId 查询失败', legacyError); return false; }
  return !!row;
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
  // 0. 密码强度校验（先于任何网络请求，快速失败）
  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid) {
    return { user: null, error: pwdCheck.message };
  }

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

  // 3. 标记邀请码使用（used_count + 1）
  const { data: currentCode } = await supabase
    .from('invite_codes')
    .select('used_count, max_uses')
    .eq('code', inviteCode)
    .single();

  const newCount = (currentCode?.used_count ?? 0) + 1;
  const maxUses = currentCode?.max_uses ?? 1;

  await supabase
    .from('invite_codes')
    .update({
      used_count: newCount,
      is_used: newCount >= maxUses,
      used_by: userData.id,
    })
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
  // 0. 密码强度校验
  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid) {
    return { user: null, error: pwdCheck.message };
  }

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

  // 3. 标记邀请码使用（used_count + 1）
  const { data: currentCode } = await supabase
    .from('invite_codes')
    .select('used_count, max_uses')
    .eq('code', inviteCode)
    .single();

  const newCount = (currentCode?.used_count ?? 0) + 1;
  const maxUses = currentCode?.max_uses ?? 1;

  await supabase
    .from('invite_codes')
    .update({
      used_count: newCount,
      is_used: newCount >= maxUses,
      used_by: userData.id,
    })
    .eq('code', inviteCode);

  return { user: userData as UserProfile, error: null };
}

/** 检查教师邀请码是否有效（role=teacher） */
export async function checkTeacherCode(code: string) {
  const row = await fetchInviteRow(code);
  if (!row || row.role !== 'teacher') return null;
  return pickValidInvite(row, code);
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

/** 读取本地会话（auth.getSession，纯本地存储读取，不发网络请求） */
export async function getLocalSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** 按 auth_id 拉取用户档案（一次 Supabase 网络往返） */
export async function fetchProfileByAuthId(authId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authId)
    .single();

  if (error) { log.error('fetchProfileByAuthId 查询失败', error); return null; }
  return data as UserProfile | null;
}

/** 获取当前登录用户 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const session = await getLocalSession();
  if (!session?.user) return null;
  return fetchProfileByAuthId(session.user.id);
}

// ---------- 档案本地缓存（启动快速路径用，见 docs/plans/2026-09-05-首屏性能优化实施计划） ----------

const PROFILE_CACHE_KEY = 'su_profile_cache_v1';

/** 读取缓存档案；authId 不匹配（换了账号）一律视为无缓存 */
export function readCachedProfile(authId: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { authId: string; profile: UserProfile };
    return parsed.authId === authId ? parsed.profile : null;
  } catch {
    return null;
  }
}

export function writeCachedProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ authId: profile.auth_id, profile }));
  } catch {
    // 存储不可用（隐私模式等）静默降级
  }
}

export function removeCachedProfile(): void {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // 同上
  }
}

/** 退出登录 */
export async function signOut() {
  await supabase.auth.signOut();
}

/** 修改密码（已登录用户） */
export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error };
}

/** 验证用户身份：姓名 + 学号是否匹配已注册用户（rpc 精确匹配，不可枚举） */
export async function verifyUser(name: string, studentId: string): Promise<{ authId: string; name: string } | null> {
  const { data, error } = await supabase.rpc('verify_user_identity', {
    name_input: name,
    student_id_input: studentId,
  });
  if (!error) {
    const row = data as { auth_id: string; name: string } | null;
    return row?.auth_id ? { authId: row.auth_id, name: row.name } : null;
  }
  if (error.code !== 'PGRST202') {
    log.error('verify_user_identity 调用失败', error);
    return null;
  }
  const { data: legacy, error: legacyError } = await supabase
    .from('users')
    .select('auth_id, name')
    .eq('student_id', studentId)
    .eq('name', name)
    .single();
  if (legacyError || !legacy || !legacy.auth_id) return null;
  return { authId: legacy.auth_id, name: legacy.name };
}

/** 自主重置密码（通过 auth_id 调用数据库函数） */
export async function selfResetPassword(authId: string, newPassword: string): Promise<boolean> {
  const pwdCheck = validatePasswordStrength(newPassword);
  if (!pwdCheck.valid) {
    return false;
  }

  const { error } = await supabase.rpc('reset_user_password', {
    user_id: authId,
    new_password: newPassword,
  });

  return !error;
}

/** 获取开发者用户信息（开发者入口用） */
export async function fetchDeveloperUser(): Promise<{ name: string; student_id: string } | null> {
  const { data, error } = await supabase
    .from('users')
    .select('name, student_id')
    .eq('role', 'developer')
    .limit(1)
    .single();

  if (error || !data) return null;
  return { name: data.name, student_id: data.student_id };
}

/** 监听认证状态变化 */
export function onAuthStateChange(callback: (user: UserProfile | null) => void) {
  return supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', session.user.id)
      .single();

    if (error) { log.error('onAuthStateChange 查询失败', error); callback(null); return; }
    callback(data as UserProfile | null);
  });
}
