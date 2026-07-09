import dayjs from 'dayjs';
import { ROLE_LEVEL, DEPARTMENTS, ROLES } from './constants';

/** 判断用户是否满足最低角色要求 */
export function hasMinRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_LEVEL[userRole] ?? -1) >= (ROLE_LEVEL[requiredRole] ?? 99);
}

/** 判断是否为最高权限（主席或老师） */
export function isAdmin(role: string): boolean {
  return role === 'president' || role === 'teacher' || role === 'developer';
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

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 根据 MIME 类型返回文件图标 */
export function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('excel') || type.includes('sheet')) return '📊';
  if (type.includes('powerpoint') || type.includes('presentation')) return '📽️';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z') || type.includes('tar') || type.includes('gzip')) return '📦';
  return '📄';
}
