import { describe, it, expect } from 'vitest';
import { hasMinRole, isAdmin, getDepartmentLabel, getRoleLabel } from '@/utils/helpers';

describe('hasMinRole（角色层级判断）', () => {
  it('同级满足', () => {
    expect(hasMinRole('volunteer', 'volunteer')).toBe(true);
    expect(hasMinRole('dept_head', 'dept_head')).toBe(true);
    expect(hasMinRole('presidium', 'presidium')).toBe(true);
    expect(hasMinRole('president', 'president')).toBe(true);
  });

  it('低角色不满足高要求', () => {
    expect(hasMinRole('volunteer', 'dept_head')).toBe(false);
    expect(hasMinRole('dept_head', 'presidium')).toBe(false);
    expect(hasMinRole('presidium', 'president')).toBe(false);
  });

  it('高角色满足低要求', () => {
    expect(hasMinRole('president', 'volunteer')).toBe(true);
    expect(hasMinRole('teacher', 'dept_head')).toBe(true);
    expect(hasMinRole('developer', 'presidium')).toBe(true);
  });

  it('边界：未知用户角色视为最低（-1）', () => {
    expect(hasMinRole('ghost_role', 'volunteer')).toBe(false);
  });

  it('边界：未知要求角色视为不可达（99）', () => {
    expect(hasMinRole('president', 'ghost_role')).toBe(false);
  });

  it('边界：双边未知', () => {
    expect(hasMinRole('ghost_a', 'ghost_b')).toBe(false);
  });
});

describe('isAdmin（最高权限判断）', () => {
  it('主席/老师/开发者 为管理员', () => {
    expect(isAdmin('president')).toBe(true);
    expect(isAdmin('teacher')).toBe(true);
    expect(isAdmin('developer')).toBe(true);
  });

  it('主席团及以下不是管理员', () => {
    expect(isAdmin('presidium')).toBe(false);
    expect(isAdmin('dept_head')).toBe(false);
    expect(isAdmin('volunteer')).toBe(false);
    expect(isAdmin('')).toBe(false);
  });
});

describe('getDepartmentLabel', () => {
  it('已知 key 返回中文', () => {
    expect(getDepartmentLabel('publicity')).toBe('宣传部');
    expect(getDepartmentLabel('sports')).toBe('体育部');
    expect(getDepartmentLabel('presidium')).toBe('主席主任团');
  });

  it('未知 key 原样返回（不藏错）', () => {
    expect(getDepartmentLabel('unknown_dept')).toBe('unknown_dept');
  });

  it('空值返回占位符', () => {
    expect(getDepartmentLabel('')).toBe('—');
  });
});

describe('getRoleLabel', () => {
  it('已知 key 返回中文', () => {
    expect(getRoleLabel('volunteer')).toBe('常驻志愿者');
    expect(getRoleLabel('dept_head')).toBe('部门负责人');
  });

  it('未知 key 原样返回', () => {
    expect(getRoleLabel('ghost')).toBe('ghost');
  });
});
