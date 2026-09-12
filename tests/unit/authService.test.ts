import { describe, it, expect } from 'vitest';
import {
  validatePasswordStrength, checkInviteCode, checkTeacherCode, checkStudentId,
  signUp, verifyUser, selfResetPassword,
  readCachedProfile, writeCachedProfile, removeCachedProfile,
} from '@/modules/auth/authService';
import supabase from '@/supabaseClient';

const uniq = (p: string) => `${p}${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 1e4)}`;

/** 造一张指定上限的邀请码，返回 code。
 *  v4.6.0 起注册走 register_user，邀请码在数据库侧被复核「未撤销/未过期/还有余量」，
 *  用种子里的固定码会与其他测试文件抢同一张码，故每个用例都现造一张。 */
async function makeInviteCode(maxUses: number): Promise<string> {
  const code = uniq('CODE_');
  await supabase.from('invite_codes').insert({
    code, department: 'sports', role: 'volunteer', is_used: false,
    used_count: 0, max_uses: maxUses, revoked_at: null,
  });
  return code;
}

/** 读回邀请码行的当前状态 */
async function readInviteCode(code: string) {
  const { data } = await supabase
    .from('invite_codes')
    .select('used_count, max_uses, is_used, used_by')
    .eq('code', code)
    .single();
  return data as { used_count: number; max_uses: number; is_used: boolean; used_by: string | null } | null;
}

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
    const code = await makeInviteCode(5);
    const r = await signUp('测试志愿者', sid, code, 'Passw0rd123', 'sports', 'volunteer');
    expect(r.error).toBeNull();
    expect(r.user).not.toBeNull();
    expect(r.user!.student_id).toBe(sid);
    expect(r.user!.role).toBe('volunteer');   // 角色由邀请码推导
    expect(r.user!.onboarded).toBe(false);    // 新账号应弹新人引导（落库整行必须带默认列）
    expect(await checkStudentId(sid)).toBe(true);
  });
});

describe('register_user（v4.6.0：注册的唯一入口，角色由邀请码推导）', () => {
  it('注册成功后 used_count 自增，used_by 指向新用户', async () => {
    const code = await makeInviteCode(3);
    const r = await signUp('核销测试', uniq('RDM_'), code, 'Passw0rd123', 'sports', 'volunteer');

    expect(r.error).toBeNull();
    const row = await readInviteCode(code);
    expect(row!.used_count).toBe(1);
    expect(row!.is_used).toBe(false);          // 上限 3，还没用完
    expect(row!.used_by).toBe(r.user!.id);     // 记的是本库 users.id，不是 auth_id
  });

  it('用满上限的那一次会把 is_used 置为 true', async () => {
    const code = await makeInviteCode(1);
    await signUp('核销测试A', uniq('RDM_'), code, 'Passw0rd123', 'sports', 'volunteer');

    const row = await readInviteCode(code);
    expect(row!.used_count).toBe(1);
    expect(row!.is_used).toBe(true);
  });

  it('角色以邀请码为准，请求里传的角色不作数', async () => {
    // 第二十部分的核心意图：客户端不能自己挑角色。这里传 'president'，落库必须是码里的 volunteer。
    const code = await makeInviteCode(1);
    const r = await signUp('想提权的人', uniq('ESC_'), code, 'Passw0rd123', 'sports', 'president');
    expect(r.error).toBeNull();
    expect(r.user!.role).toBe('volunteer');
  });

  it('已用完的码：注册被明确拒绝，不再建号（v4.6.0 行为变更，见迁移注释）', async () => {
    const code = await makeInviteCode(1);
    await signUp('核销测试B', uniq('RDM_'), code, 'Passw0rd123', 'sports', 'volunteer'); // 用掉
    const before = await readInviteCode(code);

    const sid = uniq('RDM_');
    const r = await signUp('核销测试C', sid, code, 'Passw0rd123', 'sports', 'volunteer');

    expect(r.user).toBeNull();                        // 不再「码废了但人建出来了」
    expect(r.error).toContain('邀请码已用完');
    expect(await checkStudentId(sid)).toBe(false);    // 确认没落库
    const after = await readInviteCode(code);
    expect(after!.used_count).toBe(before!.used_count); // 码也不会再涨
  });

  it('已撤销的码：注册被拒绝', async () => {
    const code = await makeInviteCode(5);
    await supabase.from('invite_codes')
      .update({ revoked_at: new Date().toISOString() })
      .eq('code', code);

    const r = await signUp('撤销码测试', uniq('REV_'), code, 'Passw0rd123', 'sports', 'volunteer');
    expect(r.user).toBeNull();
    expect(r.error).toContain('撤销');
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
