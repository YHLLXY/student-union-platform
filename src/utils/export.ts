/* === 数据导出（CSV，Excel / WPS 直接双击可开） ===
 *
 * 为什么不用 xlsx：npm 上 `xlsx`（SheetJS 社区版）最新为 0.18.5，发布于 2022-03-24，
 * 带两个高危公告（GHSA-4r6h-8v6p-xvw6 原型污染、GHSA-5pgg-2g8v-p4x9 ReDoS），
 * 而修复版只在 SheetJS 自建 CDN 分发、npm 侧永久停更——引入即等于接受两个无修复途径的高危依赖。
 * 本项目三处导出都是扁平表格（成员名单 / 任务清单 / 统计汇总），CSV + UTF-8 BOM 完全满足
 * 「Excel、WPS 打开中文不乱码」，且零依赖、零供应链风险。
 *
 * 落地约束：
 *   - 行分隔用 CRLF、字段按需加引号（含逗号/引号/换行/首尾空格时必须引）；
 *   - 首字符为 = + - @ 制表符 的字符串做公式注入防护（Excel 会把它们当公式执行）；
 *   - 文件头写 UTF-8 BOM（\uFEFF），否则 Excel 按 GBK 解析中文会乱码。
 */

export interface ExportColumn<T> {
  /** 表头文字 */
  title: string;
  /** 单元格取值；返回 null / undefined / '' 时导出为空单元格 */
  value: (row: T) => string | number | null | undefined;
}

/** 需要做公式注入防护的首字符（Excel/WPS 会把这些开头的单元格当公式） */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';

  let text = typeof raw === 'number' ? String(raw) : raw;
  if (typeof raw === 'string' && FORMULA_PREFIX.test(text)) {
    // 前置单引号：Excel 视为纯文本，且不会显示该引号
    text = `'${text}`;
  }

  const needsQuote = /[",\r\n]/.test(text) || text !== text.trim();
  return needsQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 生成 CSV 文本（含 BOM 头，CRLF 换行） */
export function buildCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.title)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  }
  // Excel 对 UTF-8 的识别靠 BOM，缺了就是乱码
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 文件名附日期戳，避免多次导出互相覆盖 */
export function stampFileName(base: string, ext = 'csv'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `${base}-${day}.${ext}`;
}

/** 触发浏览器下载（Blob + 临时 a 标签；用完立即 revoke，避免内存泄漏） */
function download(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 导出为 CSV 文件。
 * @returns 导出的数据行数（不含表头），调用方可据此提示「已导出 N 条」
 */
export function exportCsv<T>(rows: T[], columns: ExportColumn<T>[], baseName: string): number {
  download(buildCsv(rows, columns), stampFileName(baseName), 'text/csv;charset=utf-8');
  return rows.length;
}
