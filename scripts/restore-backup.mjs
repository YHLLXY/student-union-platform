#!/usr/bin/env node
/**
 * 从备份目录恢复数据（与 scripts/backup-supabase.mjs 配对）。
 *
 * 用法：
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/restore-backup.mjs backup/20260913_030000 --yes [--table users,tasks] [--dry-run]
 *
 * 行为约定（都是刻意的）：
 *   · **必须显式 --yes**：不传只打印「将要写入哪台库、哪些表、多少行」然后退出。理由很直白——
 *     这个脚本用 service_role 全库写入，误连生产会直接覆盖数据，不能靠「小心点」来防。
 *   · **按依赖顺序写入**：外键不是延迟约束，父表必须先落。
 *   · **幂等**：全部走 `Prefer: resolution=merge-duplicates`（按主键 upsert），
 *     重复执行同一份备份不会产生重复行。
 *   · **先校验 sha256**：备份文件坏一位都不该被写进库里。
 *   · 恢复**不会删除**目标库里多出来的行（备份之后新产生的数据保留）；要「完全回到备份时点」
 *     需要手动清表，本脚本不做这件事，避免一个手滑把线上清空。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

/** 写入顺序即依赖顺序：父表在前 */
const TABLES = [
  'users',
  'invite_codes',
  'task_templates',
  'tasks',
  'task_submissions',
  'task_milestones',
  'notices',
  'notice_reads',
  'school_notices',
  'forum_posts',
  'forum_replies',
  'forum_likes',
  'forum_bookmarks',
  'tickets',
  'ticket_records',
  'notifications',
  'department_guides',
  'platform_guides',
  'points_ledger',
  'usage_events',
];

const BATCH = 500;

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const confirmed = args.includes('--yes');
const dryRun = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--table='))?.slice('--table='.length);
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : null;

if (!dir) {
  console.error('用法：node scripts/restore-backup.mjs <备份目录> [--yes] [--dry-run] [--table=a,b]');
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
if (!url || !key) {
  console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const manifestPath = path.join(dir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`找不到 ${manifestPath}（备份目录里应当有 manifest.json）`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// ---- 1. 先校验完整性，再谈写库 ----
const plan = [];
let bad = 0;
for (const entry of manifest.tables) {
  if (only && !only.includes(entry.table)) continue;
  if (!TABLES.includes(entry.table)) continue;

  const file = path.join(dir, `${entry.table}.json.gz`);
  if (!fs.existsSync(file)) {
    console.error(`  ✗ ${entry.table}：缺文件 ${file}`);
    bad++;
    continue;
  }
  const gz = fs.readFileSync(file);
  const sha = crypto.createHash('sha256').update(gz).digest('hex');
  if (sha !== entry.sha256) {
    console.error(`  ✗ ${entry.table}：sha256 不匹配（备份文件已损坏，拒绝写入）`);
    bad++;
    continue;
  }
  plan.push({ table: entry.table, rows: entry.rows, file });
}

console.log(`备份时间：${manifest.generated_at}`);
console.log(`来源库：  ${manifest.supabase_host}`);
console.log(`目标库：  ${new URL(url).host}${url.includes(manifest.supabase_host) ? '  ← 与来源同一台' : ''}`);
console.log(`待写入：  ${plan.length} 张表 · ${plan.reduce((s, p) => s + p.rows, 0)} 行${only ? `（限 ${only.join(', ')}）` : ''}`);

if (bad) {
  console.error(`\n有 ${bad} 个文件未通过校验，已中止。`);
  process.exit(1);
}
if (dryRun || !confirmed) {
  console.log(confirmed ? '\n--dry-run：只校验不写入。' : '\n未加 --yes：只校验不写入。确认无误后重跑并加 --yes。');
  process.exit(0);
}

// ---- 2. 按依赖顺序写入 ----
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

let written = 0;
const failures = [];

for (const { table, file } of plan) {
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  if (!rows.length) {
    console.log(`  · ${table.padEnd(20)} 空表，跳过`);
    continue;
  }

  let ok = 0;
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      ok += chunk.length;
    }
    written += ok;
    console.log(`  ✓ ${table.padEnd(20)} ${ok} 行`);
  } catch (err) {
    failures.push(`${table}: ${err.message}（已写入 ${ok} 行，可修正后重跑，upsert 幂等）`);
    console.error(`  ✗ ${table.padEnd(20)} ${err.message}`);
  }
}

console.log(`\n共写入 ${written} 行。`);
if (failures.length) {
  console.error(`失败 ${failures.length} 张表：\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
