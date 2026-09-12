#!/usr/bin/env node
/**
 * 数据层就位自检 —— 「那份 SQL 脚本到底跑了没有？」
 *
 * 由来（2026-09-12 实测教训）：Phase 3 的数据层脚本（第十九部分 / supabase-phase3-v4.5.0.sql）
 * 交付时标注「待用户执行」，之后几天没有人发现它**其实一直没执行**——前端早已上线，
 * 于是论坛页每次打开都是「帖子加载失败」。直到 Phase 4 的验收表打出两行
 * `[缺失] 只有 0 条`，才从「两张表根本不存在」反推出来。
 * 根因不是脚本写错，而是「执行与否」当时没有任何机器可查的证据，只能靠回忆与截图。
 * 本脚本就是那份证据：不写任何数据，只用 anon key 做只读探测，回答一个问题——
 * **每一批数据层脚本期待的对象，在这个库里到底有没有？**
 *
 * 判据来自 PostgREST 的响应顺序（实测，见下方 preflight 注释）：
 *   · 表不存在            → HTTP 404 + code `PGRST205`（"Could not find the table ... in the schema cache"）
 *   · 表存在但 anon 无权限 → HTTP 401 + code `42501`（第二十部分收权后的正常状态）
 *   · 列不存在            → HTTP 400 + code `42703`
 *   · 列存在（无论有无权限）→ HTTP 200，或 401/403（**解析先于鉴权**，
 *     所以列探测在「anon 已被收权」的表上依然有效 —— 这正是只用 anon key 就能干活的根据）
 *
 * 一次性副作用：无。`limit=0` 意味着不取任何行；全程只有 GET。
 *
 * 用法：
 *   npm run probe:db                     # 自动读仓库根 .env 里的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/probe-schema.mjs
 *
 * 退出码：0 = 各批次对象齐全；1 = 有缺失（列出缺什么、该跑哪份脚本）。
 *
 * 注意：这是**运维检查**，访问的是 .env 指向的真实项目（通常是生产库），
 * 所以它不进 CI、也不当测试用（测试一律打本地桩，见 tests/e2e/safety.spec.ts）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * 每批数据层脚本「期待的对象」。只列能用 REST 证明的部分（表 / 列）；
 * 函数、触发器、索引、策略走对应的 SQL 验收表，不在这里重复。
 * 加新批次时照抄一段即可 —— 键名保持一致，报告格式就不用改。
 */
const BATCHES = [
  {
    part: '第十八部分',
    title: 'v4.4.0 · Phase 2 数据层',
    script: 'supabase-phase2-v4.4.0.sql',
    tables: ['points_ledger', 'app_secrets'],
    columns: [
      ['ticket_records', 'checked_in_at'],
      ['ticket_records', 'checked_by'],
      ['invite_codes', 'batch_id'],
    ],
  },
  {
    part: '第十九部分',
    title: 'v4.5.0 · Phase 3 数据层',
    script: 'supabase-phase3-v4.5.0.sql',
    tables: ['forum_likes', 'forum_bookmarks'],
    columns: [
      ['forum_posts', 'pinned_at'],
      ['forum_posts', 'reply_count'],
      ['forum_posts', 'like_count'],
      ['users', 'onboarded'],
      ['users', 'contact_phone'],
      ['users', 'contact_email'],
    ],
  },
];

/** 第二十部分没有新表新列，它的就位证据是「anon 被收回表权限」：抽样几张表，anon 必须被拒。 */
const LOCKDOWN = {
  part: '第二十部分',
  title: 'v4.6.0 · Phase 4 权限收口',
  script: 'supabase-phase4-v4.6.0.sql',
  sampleTables: ['users', 'tasks', 'forum_posts', 'ticket_records', 'notifications'],
};

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if (v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnvFile(path.join(ROOT, '.env'));

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const key = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!url || !key) {
  console.error('缺少 SUPABASE_URL / SUPABASE_ANON_KEY（也可写进仓库根 .env：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）');
  process.exit(1);
}

/** 只读探测一个 REST 路径，返回 { status, code }；响应体从不打印（可能含业务数据）。 */
async function probe(query) {
  const res = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  let code = null;
  try {
    code = (await res.json())?.code ?? null;
  } catch {
    // 空响应体（例如 200 时的 []）不算错
  }
  return { status: res.status, code };
}

/**
 * 对照探测：一张确定不存在的表必须回 404/PGRST205。
 * 如果它返回 401（key 无效）或直接抛错（URL/网络不通），那么后面所有
 * 「401 = 就位」的判定都会变成假阳性 —— 此时必须中止，绝不能给出「全部就位」的结论。
 */
async function preflight() {
  const control = 'zzz_probe_control_absent';
  const r = await probe(`${control}?select=*&limit=0`);
  if (r.status === 404 && r.code === 'PGRST205') return;
  console.error(
    `对照探测失败：不存在的表 ${control} 返回 HTTP ${r.status}${r.code ? ` / ${r.code}` : ''}，` +
      '预期是 404 / PGRST205。\n' +
      '说明 URL 或 anon key 不对（或网络不通），此时「401 = 已就位」的判定不可信，已中止。',
  );
  process.exit(1);
}

/** 判定单个对象的就位情况，返回 { ok, note } */
function judge(kind, { status, code }) {
  if (status === 404 || code === 'PGRST205') return { ok: false, note: kind === '表' ? '表不存在' : '表不存在（列无从谈起）' };
  if (code === '42703') return { ok: false, note: '列不存在' };
  if (status === 200 || status === 206) return { ok: true, note: kind === '表' ? '存在（anon 仍可读）' : '存在' };
  if (status === 401 || status === 403) return { ok: true, note: kind === '表' ? '存在（anon 已收权）' : '存在（anon 被拦，说明列已解析）' };
  return { ok: false, note: `未知响应 HTTP ${status}${code ? ` / ${code}` : ''}` };
}

/** 并发探测但限流，避免一次性打出一串请求 */
async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

async function checkBatch(batch) {
  const jobs = [
    ...batch.tables.map((t) => ({ kind: '表', label: `表 ${t}`, query: `${t}?select=*&limit=0` })),
    ...batch.columns.map(([t, c]) => ({ kind: '列', label: `列 ${t}.${c}`, query: `${t}?select=${c}&limit=0` })),
  ];
  const results = await mapLimit(jobs, 5, async (job) => ({ ...job, ...judge(job.kind, await probe(job.query)) }));
  return { batch, results, missing: results.filter((r) => !r.ok) };
}

async function checkLockdown() {
  const results = await mapLimit(LOCKDOWN.sampleTables, 5, async (t) => {
    const r = await probe(`${t}?select=*&limit=0`);
    if (r.status === 404 || r.code === 'PGRST205') return { label: `表 ${t}`, ok: false, note: '表不存在' };
    if (r.status === 200 || r.status === 206) return { label: `表 ${t}`, ok: false, note: 'anon 仍能读 —— 收权未生效' };
    if (r.status === 401 || r.status === 403) return { label: `表 ${t}`, ok: true, note: 'anon 已被拒' };
    return { label: `表 ${t}`, ok: false, note: `未知响应 HTTP ${r.status}` };
  });
  return { results, missing: results.filter((r) => !r.ok) };
}

await preflight();

const lines = [];
let failed = 0;

for (const batch of BATCHES) {
  const { results, missing } = await checkBatch(batch);
  if (missing.length) failed += missing.length;
  const head = `${batch.part.padEnd(6)} ${batch.title.padEnd(26)} ${String(results.length).padStart(2)} 项`;
  lines.push(
    `${head}  ${missing.length === 0 ? '[OK] 全部就位' : `[缺失] ${missing.length} 项 → 请在 Supabase 执行 ${batch.script}`}`,
  );
  for (const m of missing) lines.push(`         · ${m.label} —— ${m.note}`);
}

const lock = await checkLockdown();
const lockOk = lock.missing.length === 0;
if (!lockOk) failed += lock.missing.length;
lines.push(
  `${LOCKDOWN.part.padEnd(6)} ${LOCKDOWN.title.padEnd(26)} ${String(lock.results.length).padStart(2)} 项  ` +
    `${lockOk ? '[OK] anon 已被全面拒绝' : `[缺失] ${lock.missing.length} 项 → 请在 Supabase 执行 ${LOCKDOWN.script}`}`,
);
for (const m of lock.missing) lines.push(`         · ${m.label} —— ${m.note}`);

console.log('数据层就位自检（只读；对照探测通过，说明 key 与 URL 有效）');
console.log(lines.join('\n'));

if (failed > 0) {
  // 结论一律走 stdout：混用 stderr 会让「结论」跑到明细前面去（npm 转发时不保证顺序）
  console.log(`\n结论：[缺失 ${failed} 项] 先执行上面点名的脚本，再重跑本命令；全部 [OK] 后，再跑 supabase-verify-v4.6.0.sql 做策略级自证。`);
  process.exitCode = 1;
} else {
  console.log('\n结论：[OK] 各批次对象齐全，且 anon 权限已收口。');
}
