#!/usr/bin/env node
/**
 * 首屏急加载 JS 体积测量（改分包 / 加依赖后必跑）。
 *
 * 口径：`dist/index.html` 引用的**全部 .js** 的 gzip 之和。
 *   - `<link rel="modulepreload">` 也要算——入口会**静态 import** 它们，是真会阻塞首屏的；
 *   - 只有被动态 `import()` 拉起的 chunk（如 qrcode）不算，它们不进 index.html。
 *
 * 预算：**≤340 KB gz**。历史：v4.3.0 = 319.5 · v4.4.0 = 325.2。
 *
 * 用法：
 *   npm run build && node scripts/measure-eager.mjs
 *   node scripts/measure-eager.mjs dist   # 指定目录
 *
 * 排查提示：若总量突然上涨，先看是不是某个新依赖被 `priority: 1` 的 vendor 兜底分组吸走了
 * （vendor 是入口静态 import 的），再调 `vite.config.ts` 的 codeSplitting 分组与
 * `entriesAwareMergeThreshold`（该阈值对结果极其敏感，改前先量一遍当前值）。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const distDir = process.argv[2] ?? 'dist';
const htmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error(`找不到 ${htmlPath}，先跑 npm run build`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const files = [
  ...new Set([...html.matchAll(/assets\/[^"']+\.js/g)].map((m) => m[0])),
];

let total = 0;
const rows = [];
for (const f of files) {
  const gz = zlib.gzipSync(fs.readFileSync(path.join(distDir, f)), { level: 9 }).length;
  total += gz;
  rows.push([gz, f.replace(/^assets\//, '')]);
}
rows.sort((a, b) => b[0] - a[0]);

const kb = (n) => (n / 1024).toFixed(1);
console.log(`首屏急加载 JS：${files.length} 个 chunk，合计 ${kb(total)} KB gz（预算 ≤340）`);
for (const [gz, f] of rows.slice(0, 6)) {
  console.log(`  ${kb(gz).padStart(6)} KB gz  ${f.slice(0, 64)}`);
}
