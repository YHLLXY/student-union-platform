/**
 * 工具函数 barrel export
 *
 * 实际实现已按职责拆分到：
 *   - dateUtils.ts — 日期格式化（零依赖原生实现）
 *   - roleUtils.ts — 角色/权限/部门/标签
 *   - fileUtils.ts — 文件大小/图标
 *
 * 此文件保留 re-export，所有现有 import 无需修改。
 */

export { formatDate, formatDateTime } from './dateUtils';
export { hasMinRole, isAdmin, getDepartmentLabel, getRoleLabel } from './roleUtils';
export { formatFileSize, getFileIcon } from './fileUtils';
