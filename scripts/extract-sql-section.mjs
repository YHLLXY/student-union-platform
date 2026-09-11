#!/usr/bin/env node
/**
 * 从 supabase-migration.sql 中抽取某个「第 N 部分」章节，生成可整份粘贴进
 * Supabase SQL Editor 的独立脚本，避免手抄带来的两份内容不一致。
 *
 * 用法：
 *   node scripts/extract-sql-section.mjs 第十八部分 supabase-phase2-v4.4.0.sql
 *
 * 输出文件带「勿手工编辑」抬头；校验方式是重新抽取并与磁盘内容逐字节比较，
 * 因此不得在抬头里写生成时间戳（否则每次重跑都产生无意义 diff）。
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , marker, outFile] = process.argv;
if (!marker || !outFile) {
  console.error('用法：node scripts/extract-sql-section.mjs <章节标记，如 第十八部分> <输出文件>');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'supabase-migration.sql');
const lines = fs.readFileSync(source, 'utf8').split(/\r?\n/);

const markerIdx = lines.findIndex((l) => l.startsWith(`-- ${marker}：`));
if (markerIdx === -1) {
  console.error(`在 ${source} 中找不到章节：-- ${marker}：…`);
  process.exit(1);
}

// 抬头注释块以 `-- ====` 起头，往上一行即章节开头
const start = lines[markerIdx - 1]?.startsWith('-- ====') ? markerIdx - 1 : markerIdx;

// 章节结束于「下一个章节抬头块」之前，而不是文件末——否则抽早期章节会把后续章节一并带上
const isRule = (l) => /^-- ={10,}\s*$/.test(l);
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (isRule(lines[i]) && lines[i + 1]?.startsWith('-- 第')) {
    end = i;
    break;
  }
}

const body = lines.slice(start, end).join('\n').replace(/\s+$/, '') + '\n';

const header = [
  '-- ⚠️ 本文件由 scripts/extract-sql-section.mjs 从 supabase-migration.sql 自动抽取，请勿手工编辑。',
  `--    改动请改 supabase-migration.sql 的「${marker}」章节，然后重新执行：`,
  `--      node scripts/extract-sql-section.mjs ${marker} ${path.basename(outFile)}`,
  '',
].join('\n');

const target = path.join(root, outFile);
fs.writeFileSync(target, header + body, 'utf8');

// 自证：重新读回并与「抬头 + 正文本应内容」比较，不等则说明写入被截断
const readBack = fs.readFileSync(target, 'utf8');
if (readBack !== header + body) {
  console.error('写入校验失败：回读内容与预期不一致');
  process.exit(1);
}

const rel = path.relative(root, source).replace(/\\/g, '/');
console.log(`已生成 ${outFile}`);
console.log(`  来源：${rel} → 「${marker}」（第 ${start + 1} 行至第 ${end} 行）`);
console.log(`  行数：${body.split('\n').length - 1}，字节：${Buffer.byteLength(readBack, 'utf8')}`);
