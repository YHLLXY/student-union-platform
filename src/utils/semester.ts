/**
 * 学期工具
 *
 * 与数据库函数 `public.semester_of()` 保持**同一口径**：学期键形如 `2026-2027-1`，
 * 9 月 ~ 次年 1 月为第一学期，2 月 ~ 8 月为第二学期。
 *
 * 为什么前端也实现一份：积分筛选、排行榜标题、导出文件名都要用到同一口径，
 * 没必要每次去数据库算一次。**改这里必须同步改 supabase-migration.sql 第十八部分的函数**，
 * 两边算出来的学期键不一致会导致「明细对不上排行」这种最难查的 bug。
 */

/** 当前学期键，如 2026-2027-1 */
export function currentSemester(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 9) return `${y}-${y + 1}-1`;
  if (m === 1) return `${y - 1}-${y}-1`;
  return `${y - 1}-${y}-2`;
}

/** 学期键 → 展示文案：2026-2027-1 → 2026-2027 学年第一学期 */
export function formatSemester(semester: string): string {
  const [a, b, term] = semester.split('-');
  if (!a || !b || !term) return semester;
  return `${a}-${b} 学年${term === '1' ? '第一学期' : '第二学期'}`;
}
