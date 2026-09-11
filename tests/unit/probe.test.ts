/**
 * stub 行为探针（Phase 0 基建自检）：
 * 在写正式用例前验证 dev-stub 对 postgrest-js 各类查询形态的兼容性。
 * 全部通过后此文件保留为基建回归哨兵。
 */
import { describe, it, expect } from 'vitest';
import supabase from '@/supabaseClient';

describe('dev-stub 兼容性探针', () => {
  it('测试环境指向本地 stub', () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toMatch(/127\.0\.0\.1:99\d\d/);
  });

  it('普通列表查询', async () => {
    const { data, error } = await supabase.from('users').select('*').limit(5);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('single 命中行', async () => {
    const { data, error } = await supabase
      .from('users').select('*').eq('student_id', 'DEV0001').single();
    expect(error).toBeNull();
    expect((data as { name: string }).name).toBe('王开发');
  });

  it('maybeSingle 未命中行返回 null（不抛错）', async () => {
    const { data, error } = await supabase
      .from('users').select('id').eq('student_id', 'NO_SUCH_ID_XYZ').maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('head:true + count:exact 返回真实计数', async () => {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', '00000000-0000-4000-8000-000000000001');
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(0);
  });

  it('or 过滤生效（volunteer 视角 fetchTasks 依赖）', async () => {
    const { data, error } = await supabase.from('tasks').select('id')
      .or('assigned_to.eq.00000000-0000-4000-8000-000000000005,assigned_department.eq.sports');
    expect(error).toBeNull();
    // 种子数据里 publicity 的任务 assigned_to=uid5（孙晓雨），sports 部门有 2 条 → 至少 3 条
    expect(data!.length).toBeGreaterThanOrEqual(3);
  });

  it('contains 过滤生效（fetchLinkedNotices 依赖）', async () => {
    const { data, error } = await supabase.from('notices').select('id')
      .contains('linked_tasks', ['00000000-0000-4000-8000-000000000201']);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it('注册→登录→改密 全链路（auth 层）', async () => {
    const sid = `P${Date.now().toString().slice(-8)}`;
    const { signUp, signIn, checkStudentId, changePassword } = await import('@/modules/auth/authService');
    expect(await checkStudentId(sid)).toBe(false);
    const reg = await signUp('测试志愿者', sid, 'TIYU_VOL', 'Passw0rd123', 'sports', 'volunteer');
    expect(reg.error).toBeNull();
    expect(reg.user).not.toBeNull();
    expect(await checkStudentId(sid)).toBe(true);

    const login = await signIn(sid, 'whatever');
    expect(login.error).toBeNull();
    expect(login.user?.student_id).toBe(sid);

    const { error: pwdErr } = await changePassword('Passw0rd456');
    expect(pwdErr).toBeNull();
  });
});
