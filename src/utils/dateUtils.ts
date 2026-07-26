/**
 * 日期工具函数 — 零外部依赖，使用原生实现
 *
 * 为什么不用 dayjs？
 *   - helpers.ts 被 30+ 文件引用，dayjs 会进入所有引用方的依赖图
 *   - formatDate / formatDateTime 只需要简单的格式化，不需要日期计算
 *   - 手写格式化比 Intl.DateTimeFormat 更可控（保证 - 分隔符 + 补零）
 *   - 注意：dayjs 仍被 dashboardService/MilestonePanel 等使用（复杂计算），
 *     此处仅替换 helpers 中的两个简单格式化函数
 */

/** 格式化日期 YYYY-MM-DD */
export function formatDate(date: string | Date): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '—';
  }
}

/** 格式化日期时间 YYYY-MM-DD HH:mm */
export function formatDateTime(date: string | Date): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch {
    return '—';
  }
}
