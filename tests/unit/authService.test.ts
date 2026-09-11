import { describe, it, expect } from 'vitest';
import {
  validatePasswordStrength, checkInviteCode, checkTeacherCode, checkStudentId,
  signUp, verifyUser, selfResetPassword,
  readCachedProfile, writeCachedProfile, removeCachedProfile,
} from '@/modules/auth/authService';
import supabase from '@/supabaseClient';

const uniq = (p: string) => `${p}${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 1e4)}`;

describe('validatePasswordStrength', () => {
  it('少于 8 位拒绝', () => {
    const r = validatePasswordStrength('Ab1');
    expect(r.valid).toBe(false);
    expect(r.message).toContain('8 位');
  });

  it('纯数字拒绝（缺字母）', () => {
    const r = validatePasswordStrength('12345678');
    expect(r.valid).toBe(false);
    expect(r.message).toContain('字母');
  });

  it('纯字母拒绝（缺数字）', () => {
    const r = validatePasswordStrength('abcdefgh');
    expect(r.valid).toBe(false);
    expect(r.message).toContain('数字');
  });

  it('空密码拒绝', () => {
    expect(validatePasswordStrength('').valid).toBe(false);
  });

  it('字母+数字且满 8 位通过', () => {
    expect(validatePasswordStrength('abc12345').valid).toBe(true);
    expect(validatePasswordStrength('Passw0rd!').valid).toBe(true);
  });
});

describe('checkInviteCode（取数 + 规则复核）', () => {
  it('有效邀请码返回行', async () => {
    const row = await checkInviteCode('TIYU_VOL');
    expect(row).not.toBeNull();
    expect(row!.department).toBe('sports');
    expect(row!.role).toBe('volunteer');
  });

  it('不存在的码返回 null', async () => {
    expect(await checkInviteCode('NO_SUCH_CODE')).toBeNull();
  });

  it('已用尽（used_count >= max_uses）返回 null', async () => {
    const code = uniq('USED_');
    await supabase.from('invite_codes').insert({
      code, department: 'testdept', role: 'volunteer',
      used_count: 1, max_uses: 1, is_used: true,
    });
    expect(await checkInviteCode(code)).toBeNull();
  });

  it('未用尽（used_count < max_uses）可用', async () => {
    const code = uniq('MULTI_');
    await supabase.from('invite_codes').insert({
      code, department: 'testdept', role: 'volunteer',
      used_count: 1, max_uses: 3, is_used: false,
    });
    expect(await checkInviteCode(code)).not.toBeNull();
  });

  it('已撤销（revoked_at）返回 null', async () => {
    const code = uniq('REVOKE_');
    await supabase.from('invite_codes').insert({
      code, department: 'testdept', role: 'volunteer',
      used_count: 0, max_uses: 1, revoked_at: new Date().toISOString(),
    });
    expect(await checkInviteCode(code)).toBeNull();
  });

  it('已过期（expires_at 过去）返回 null', async () => {
    const code = uniq('EXPIRE_');
    await supabase.from('invite_codes').insert({
      code, department: 'testdept', role: 'volunteer',
      used_count: 0, max_uses: 1, expires_at: new Date(Date.now() - 86400e3).toISOString(),
    });
    expect(await checkInviteCode(code)).toBeNull();
  });
});

describe('checkTeacherCode', () => {
  it('教师码可用', async () => {
    const code = uniq('TEA_');
    await supabase.from('invite_codes').insert({
      code, department: 'testdept', role: 'teacher',
      used_count: 0, max_uses: 1,
    });
    expect(await checkTeacherCode(code)).not.toBeNull();
  });

  it('学生码对教师入口无效', async () => {
    expect(await checkTeacherCode('TIYU_VOL')).toBeNull();
  });
});

describe('checkStudentId（rpc 布尔）', () => {
  it('已注册学号 true', async () => {
    expect(await checkStudentId('DEV0001')).toBe(true);
  });

  it('未注册学号 false', async () => {
    expect(await checkStudentId(uniq('NOBODY_'))).toBe(false);
  });
});

describe('signUp', () => {
  it('弱密码在任何网络请求前被拒', async () => {
    const r = await signUp('张三', uniq('WEAK_'), 'TIYU_VOL', 'short', 'sports', 'volunteer');
    expect(r.user).toBeNull();
    expect(r.error).toContain('8 位');
  });

  it('正常注册写入 users 表', async () => {
    const sid = uniq('REG_');
    const r = await signUp('测试志愿者', sid, 'TIYU_VOL', 'Passw0rd123', 'sports', 'volunteer');
    expect(r.error).toBeNull();
    expect(r.user).not.toBeNull();
    expect(r.user!.student_id).toBe(sid);
    expect(r.user!.role).toBe('volunteer');
    expect(await checkStudentId(sid)).toBe(true);
  });
});

describe('verifyUser（忘记密码身份验证）', () => {
  it('姓名+学号匹配返回 authId', async () => {
    const u = await verifyUser('王开发', 'DEV0001');
    expect(u).not.toBeNull();
    expect(u!.name).toBe('王开发');
    expect(u!.authId).toBeTruthy();
  });

  it('学号不存在返回 null', async () => {
    expect(await verifyUser('王开发', uniq('X_'))).toBeNull();
  });

  it('姓名不匹配返回 null', async () => {
    expect(await verifyUser('张三丰', 'DEV0001')).toBeNull();
  });
});

describe('selfResetPassword', () => {
  it('弱密码直接 false（不调 rpc）', async () => {
    const auth = await verifyUser('王开发', 'DEV0001');
    expect(await selfResetPassword(auth!.authId, 'short')).toBe(false);
  });

  it('合法密码重置成功', async () => {
    const auth = await verifyUser('王开发', 'DEV0001');
    expect(await selfResetPassword(auth!.authId, 'NewPass123')).toBe(true);
  });
});

describe('档案本地缓存', () => {
  const profile = {
    id: 'u-cache-1', auth_id: 'auth-cache-1', name: '缓存用户',
    student_id: 'CACHE01', department: 'sports', role: 'volunteer', created_at: '',
  };

  it('写入后按 authId 可读回', () => {
    writeCachedProfile(profile);
    expect(readCachedProfile('auth-cache-1')?.name).toBe('缓存用户');
  });

  it('authId 不匹配视为无缓存（换号保护）', () => {
    expect(readCachedProfile('auth-other')).toBeNull();
  });

  it('缓存损坏时静默返回 null', () => {
    localStorage.setItem('su_profile_cache_v1', '{broken json');
    expect(readCachedProfile('auth-cache-1')).toBeNull();
  });

  it('清除后为空', () => {
    removeCachedProfile();
    expect(readCachedProfile('auth-cache-1')).toBeNull();
  });
});
