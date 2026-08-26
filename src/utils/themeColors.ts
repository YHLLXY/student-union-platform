/* === 学生会平台 · TS 侧共享色值常量（单一事实来源） ===
   凡多个组件使用同一组非主题语义色，必须在此定义后引用，
   禁止各组件内重复硬编码。CSS 场景请用 variables.css 的变量。 */

/** 热力图五级绿色阶（GitHub 风格）：Heatmap / TaskCalendar 共用 */
export const HEATMAP_LEVEL_COLORS = [
  '#ebedf0',
  '#c6e48b',
  '#7bc96f',
  '#239a3b',
  '#196127',
] as const;

/** 排行榜前三名徽章色 */
export const PODIUM_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'] as const;

/** 排行榜前三名卡片背景 */
export const PODIUM_BG = ['#fffbe6', '#f5f5f5', '#fdf2e9'] as const;

/** 模块强调色：全局搜索结果、跨模块图标等场景用于区分模块 */
export const MODULE_ACCENT = {
  tasks: '#3498db',
  notices: '#e67e22',
  forum: '#27ae60',
  guides: '#8e44ad',
} as const;
