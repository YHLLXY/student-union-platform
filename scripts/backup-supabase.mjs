#!/usr/bin/env node
/**
 * 全库备份 —— 把 public schema 里所有业务表导出成 gzip JSON（每个表一个文件）。
 *
 * 设计要点（2026-09-12，Phase 4 D1）：
 *   1. **必须分页**：PostgREST 单次最多返回 1000 行，不分页会静默备份成「前 1000 行」——
 *      这种备份最危险，因为它看起来是成功的。本脚本用 `Range` 头翻页，
 *      并用 `Prefer: count=exact` 拿到的总数**核对最终行数**，对不上直接报错退出。
 *   2. **稳定排序**：翻页必须按固定顺序取数，否则并发写入会导致漏行/重复。按主键排。
 *   3. **不备份 app_secrets**：里面是二维码签名的密钥。把密钥写进 git 历史等于长期泄露，
 *      灾难恢复时重新生成一次密钥即可（代价只是已签发的二维码失效）。见 docs/backup-restore.md。
 *   4. 需要 **service_role key**（本地 .env 里没有，只在 GitHub Secrets / 你本机的临时变量里）。
 *      anon key 备份不出任何东西（RLS 会拦成空数组），且会让人误以为「备份成功」。
 *
 * 用法：
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/backup-supabase.mjs [输出目录，默认 backup]
 *
 * 退出码：0 = 全部成功；1 = 有任何一张表失败或行数核对不上（CI 靠它报警）。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 2_000_000; // 防御性上限：出现死循环时不至于把内存吃光

/**
 * 表清单 + 翻页排序键。
 * 顺序无所谓（导出不分依赖），但**每张表的排序键必须稳定**：
 * 绝大多数表有 `id`；两张点赞/收藏表是复合主键、app_secrets 是 key（且不导出）。
 */
const TABLES = [
  { name: 'users',             order: 'id' },
  { name: 'invite_codes',      order: 'id' },
  { name: 'task_templates',    order: 'id' },
  { name: 'tasks',             order: 'id' },
  { name: 'task_submissions',  order: 'id' },
  { name: 'task_milestones',   order: 'id' },
  { name: 'notices',           order: 'id' },
  { name: 'notice_reads',      order: 'id' },
  { name: 'school_notices',    order: 'id' },
  { name: 'forum_posts',       order: 'id' },
  { name: 'forum_replies',     order: 'id' },
  { name: 'forum_likes',       order: 'post_id,user_id' },
  { name: 'forum_bookmarks',   order: 'post_id,user_id' },
  { name: 'tickets',           order: 'id' },
  { name: 'ticket_records',    order: 'id' },
  { name: 'notifications',     order: 'id' },
  { name: 'department_guides', order: 'id' },
  { name: 'platform_guides',   order: 'id' },
  { name: 'points_ledger',     order: 'id' },
  { name: 'usage_events',      order: 'id' },
];

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

if (!url || !key) {
  console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（service_role key 不进仓库，请用环境变量传入）');
  process.exit(1);
}

const outRoot = process.argv[2] ?? 'backup';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const outDir = path.join(outRoot, stamp);
fs.mkdirSync(outDir, { recursive: true });

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
  Prefer: 'count=exact',
};

/** 抓一张表的全部行（分页），返回 { rows, total } */
async function fetchAll(table, order) {
  const rows = [];
  let total = null;
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const res = await fetch(
      `${url}/rest/v1/${table}?select=*&order=${encodeURIComponent(order)}`,
      { headers: { ...headers, Range: `${from}-${to}`, 'Range-Unit': 'items' } },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
    }

    // Content-Range 形如 `0-999/12345`；`*` 表示总数未知
    const range = res.headers.get('content-range') ?? '';
    const slash = range.indexOf('/');
    if (slash >= 0 && range.slice(slash + 1) !== '*') total = Number(range.slice(slash + 1));

    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`响应不是数组：${JSON.stringify(page).slice(0, 120)}`);
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (rows.length > MAX_ROWS_PER_TABLE) throw new Error(`超过 ${MAX_ROWS_PER_TABLE} 行仍未取完，疑似翻页失效`);
  }

  return { rows, total };
}

const results = [];
const failures = [];

for (const { name, order } of TABLES) {
  try {
    const { rows, total } = await fetchAll(name, order);

    // 行数自检：分页实现写错了就会在这里暴露，而不是在将来恢复时才发现少了数据
    if (total !== null && rows.length !== total) {
      throw new Error(`行数核对不上：抓到 ${rows.length} 行，服务端报 ${total} 行`);
    }

    const json = Buffer.from(JSON.stringify(rows), 'utf8');
    const gz = zlib.gzipSync(json, { level: 9 });
    fs.writeFileSync(path.join(outDir, `${name}.json.gz`), gz);

    results.push({
      table: name,
      rows: rows.length,
      bytes_raw: json.length,
      bytes_gz: gz.length,
      sha256: crypto.createHash('sha256').update(gz).digest('hex'),
    });
    console.log(`  ✓ ${name.padEnd(20)} ${String(rows.length).padStart(7)} 行  ${(gz.length / 1024).toFixed(1)} KB gz`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.error(`  ✗ ${name.padEnd(20)} 失败：${err.message}`);
  }
}

const manifest = {
  generated_at: new Date().toISOString(),
  supabase_host: new URL(url).host,
  table_count: results.length,
  total_rows: results.reduce((s, r) => s + r.rows, 0),
  total_bytes_gz: results.reduce((s, r) => s + r.bytes_gz, 0),
  excluded: { app_secrets: '二维码签名密钥，刻意不入备份（见 docs/backup-restore.md）' },
  tables: results,
};

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`\n备份目录：${outDir}`);
console.log(`表 ${manifest.table_count} 张 · 共 ${manifest.total_rows} 行 · ${(manifest.total_bytes_gz / 1024 / 1024).toFixed(2)} MB gz`);

if (failures.length) {
  console.error(`\n失败 ${failures.length} 项：\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
