import { describe, it, expect } from 'vitest';
import {
  fetchAllMembers, updateMemberRole, removeMember, transferMember,
  generateInviteCode, fetchInviteCodes, deleteInviteCode,
  deactivateInviteCode, resetMemberPassword,
} from '@/modules/admin/adminService';
import supabase from '@/supabaseClient';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U_PRES = uid(2);
// 合成数据走独立部门/学号，避开种子数据与其他测试文件的断言
const synthId = () => `syn${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 1e4)}`;

/** 直插一名测试用户（绕开注册流程，聚焦 adminService 自身逻辑） */
async function seedUser() {
  const sid = synthId();
  const { data, error } = await supabase.from('users').insert({
    auth_id: `aa000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`,
    name: `测试成员${sid}`, student_id: sid,
    department: 'testdept', role: 'volunteer',
  }).select('*').single();
  expect(error).toBeNull();
  return data!;
}

describe('fetchAllMembers 角色边界', () => {
  it('president 看全部（含合成部门成员）', async () => {
    const u = await seedUser();
    const all = await fetchAllMembers('president', 'presidium');
    expect(all.some((m) => m.id === u.id)).toBe(true);
  });

  it('dept_head 只看本部门', async () => {
    const rows = await fetchAllMembers('dept_head', 'publicity');
    expect(rows.every((m) => m.department === 'publicity')).toBe(true);
    expect(rows.length).toBe(2); // 种子：赵敏 + 孙晓雨
  });
});

describe('成员角色/部门流转', () => {
  it('updateMemberRole 生效', async () => {
    const u = await seedUser();
    expect(await updateMemberRole(u.id, 'dept_head')).toBe(true);
    const { data } = await supabase.from('users').select('role').eq('id', u.id).single();
    expect((data as { role: string }).role).toBe('dept_head');
  });

  it('removeMember 置为 removed（软删除）', async () => {
    const u = await seedUser();
    expect(await removeMember(u.id)).toBe(true);
    const { data } = await supabase.from('users').select('role').eq('id', u.id).single();
    expect((data as { role: string }).role).toBe('removed');
  });

  it('transferMember 换部门', async () => {
    const u = await seedUser();
    expect(await transferMember(u.id, 'sports')).toBe(true);
    const { data } = await supabase.from('users').select('department').eq('id', u.id).single();
    expect((data as { department: string }).department).toBe('sports');
  });
});

describe('邀请码生成与管理', () => {
  it('generateInviteCode 生成 6 位码且可查回', async () => {
    const code = await generateInviteCode('testdept', 'volunteer', 5, null, U_PRES);
    expect(code).not.toBeNull();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    const rows = await fetchInviteCodes('testdept');
    const row = rows.find((c) => c.code === code);
    expect(row).toBeDefined();
    expect(row!.max_uses).toBe(5);
    expect(row!.used_count).toBe(0);
    expect(row!.used_by_name).toBe('-');
  });

  it('fetchInviteCodes 不传部门返回全部（含使用人联表）', async () => {
    const rows = await fetchInviteCodes();
    expect(rows.length).toBeGreaterThanOrEqual(3); // 种子 3 条
    const zuzi = rows.find((c) => c.code === 'ZHUZI_ADM');
    expect(zuzi).toBeDefined();
    expect(zuzi!.department).toBe('presidium');
  });

  it('deactivateInviteCode 置 revoked_at（撤销而非占用）', async () => {
    const code = await generateInviteCode('testdept', 'volunteer');
    const rows = await fetchInviteCodes('testdept');
    const row = rows.find((c) => c.code === code)!;

    expect(await deactivateInviteCode(row.id)).toBe(true);
    const after = (await fetchInviteCodes('testdept')).find((c) => c.id === row.id)!;
    expect(after.revoked_at).toBeTruthy();
    expect(after.used_by).toBeNull(); // 撤销 ≠ 已被注册使用
  });

  it('deleteInviteCode 物理删除未使用码', async () => {
    const code = await generateInviteCode('testdept', 'volunteer');
    const row = (await fetchInviteCodes('testdept')).find((c) => c.code === code)!;
    expect(await deleteInviteCode(row.id)).toBe(true);
    expect((await fetchInviteCodes('testdept')).some((c) => c.id === row.id)).toBe(false);
  });
});

describe('resetMemberPassword', () => {
  it('返回 8 位随机新密码', async () => {
    const pwd = await resetMemberPassword(uid(104)); // 孙晓雨 auth_id
    expect(pwd).not.toBe(false);
    expect(String(pwd)).toMatch(/^[a-z0-9]{8}$/);
  });
});
