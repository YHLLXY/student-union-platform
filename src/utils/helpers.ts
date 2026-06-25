import dayjs from 'dayjs';
import { ROLE_LEVEL, DEPARTMENTS, ROLES } from './constants';

/** 判断用户是否满足最低角色要求 */
export function hasMinRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_LEVEL[userRole] ?? -1) >= (ROLE_LEVEL[requiredRole] ?? 99);
}

/** 判断是否为最高权限（主席或老师） */
export function isAdmin(role: string): boolean {
  return role === 'president' || role === 'teacher';
}

/** 格式化日期 YYYY-MM-DD */
export function formatDate(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/** 格式化日期时间 YYYY-MM-DD HH:mm */
export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

/** 根据英文 key 获取部门中文名 */
export function getDepartmentLabel(key: string): string {
  if (!key) return '—';
  return DEPARTMENTS[key] ?? key;
}

/** 根据英文 key 获取角色中文名 */
export function getRoleLabel(key: string): string {
  return ROLES[key] ?? key;
}
