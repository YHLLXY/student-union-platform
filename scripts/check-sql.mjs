#!/usr/bin/env node
/**
 * SQL 脚本静态体检：在「让用户去 Supabase 手贴一遍」之前先把语法问题挡下来。
 *
 * 两道关卡：
 *   ① 结构自检（零依赖，永远执行）：语句切分、圆括号配平、$$ 块闭合、字符串闭合、
 *      代码区是否混入全角标点（中文只应出现在字符串与注释里）；
 *   ② PostgreSQL 语法解析（可选，需 pgsql-ast-parser）：逐条真解析。
 *
 * 解析器装法（不写进本项目 package.json，避免污染依赖清单）：
 *   mkdir -p /tmp/sqlcheck && cd /tmp/sqlcheck && npm init -y && npm i pgsql-ast-parser
 *   NODE_PATH=$(cygpath -w /tmp/sqlcheck/node_modules) node scripts/check-sql.mjs <文件.sql>
 *
 * 用法：node scripts/check-sql.mjs supabase-phase2-v4.4.0.sql
 *
 * 说明：解析器对个别 DDL 支持不全（报 "not supported"），这类归为「跳过」而非「错误」，
 *       需人工确认一眼；结构自检不通过则一定有问题。
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('用法：node scripts/check-sql.mjs <sql 文件>');
  process.exit(1);
}

let parser = null;
try {
  const { createRequire } = await import('node:module');
  parser = createRequire(import.meta.url)('pgsql-ast-parser');
} catch {
  parser = null;
}

const abs = path.resolve(file);
const src = fs.readFileSync(abs, 'utf8');

/**
 * 按 `;` 切分语句：跳过字符串、双引号标识符、行/块注释与 $$ 块。
 * 同时产出一份「代码区」文本（注释与字符串内容挖空），用于查全角标点这类问题。
 */
function splitStatements(text) {
  const out = [];
  let cur = '';
  let code = '';
  let depth = 0;
  let minDepth = 0;
  let i = 0;
  let dollar = null;
  let startOffset = 0;
  let started = false;

  const markStart = (pos) => {
    if (!started) {
      startOffset = pos;
      started = true;
    }
  };
  const push = (pos) => {
    if (!cur.trim()) return;
    out.push({ text: cur.trim(), code: code.trim(), offset: startOffset, depth, minDepth });
    void pos;
  };
  const reset = () => {
    cur = '';
    code = '';
    depth = 0;
    minDepth = 0;
    started = false;
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (dollar) {
      if (text.startsWith(dollar, i)) {
        cur += dollar;
        code += dollar; // $$ 本身属于代码
        i += dollar.length;
        dollar = null;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      cur += text.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      cur += text.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
      if (m) {
        markStart(i);
        dollar = m[0];
        cur += dollar;
        code += dollar;
        i += dollar.length;
        continue;
      }
    }

    if (ch === "'") {
      markStart(i);
      cur += ch;
      code += "''"; // 字符串内容不进代码区
      let j = i + 1;
      while (j < text.length) {
        cur += text[j];
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            cur += "'";
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }

    if (ch === '"') {
      markStart(i);
      const close = text.indexOf('"', i + 1);
      const end = close === -1 ? text.length : close + 1;
      cur += text.slice(i, end);
      code += text.slice(i, end);
      i = end;
      continue;
    }

    if (ch === ';') {
      push(i);
      reset();
      i++;
      continue;
    }

    if (!/\s/.test(ch)) markStart(i);
    cur += ch;
    code += ch;
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth < minDepth) minDepth = depth;
    }
    i++;
  }

  push(text.length);
  return out;
}

const lineOf = (offset) => src.slice(0, offset).split('\n').length;
const stmts = splitStatements(src);

// ---- 关卡 ①：结构自检 ----
const structural = [];
for (const s of stmts) {
  const line = lineOf(s.offset);
  const head = s.text.split('\n')[0].slice(0, 72);
  if (s.depth !== 0) {
    structural.push(`L${line} 圆括号不配平（净差 ${s.depth}）  ${head}`);
  }
  if (s.minDepth < 0) {
    structural.push(`L${line} 出现多余的右括号  ${head}`);
  }
  // $$ 未闭合的语句会被切分逻辑吞成一条超长语句，这里用奇偶判定兜底
  const dollars = (s.code.match(/\$\$/g) ?? []).length;
  if (dollars % 2 !== 0) {
    structural.push(`L${line} $$ 块未闭合  ${head}`);
  }
  const fullWidth = s.code.match(/[，；：（）“”‘’]/g);
  if (fullWidth) {
    structural.push(`L${line} 代码区出现全角标点 ${[...new Set(fullWidth)].join('')}  ${head}`);
  }
}

console.log(`文件：${file}`);
console.log(`语句：${stmts.length} 条`);
console.log(`结构自检：${structural.length === 0 ? '通过' : `${structural.length} 项异常`}`);
for (const s of structural) console.log(`  [结构] ${s}`);

// ---- 关卡 ③：DDL 顺序检查（新增列必须先于引用它的一切）----
// 来自真实事故：CREATE TRIGGER ... AFTER UPDATE OF checked_in_at 排在
// ALTER TABLE ... ADD COLUMN checked_in_at 之前 → 执行到建触发器时报
// 42703 column "checked_in_at" of relation "ticket_records" does not exist。
// Postgres 在「创建触发器」与「创建索引」时就会校验列是否存在，所以顺序是真会炸的。
const normTable = (t) => t.replace(/"/g, '').replace(/^public\./i, '').toLowerCase();
const addedAt = new Map(); // "表.列" → 首次被 ADD COLUMN 的语句序号

stmts.forEach((s, i) => {
  const flat = s.text.replace(/^--.*$/gm, '').replace(/\s+/g, ' ');
  const m = /^ALTER TABLE\s+([\w".]+)[\s\S]*?\bADD COLUMN\b/i.exec(flat);
  if (!m) return;
  const table = normTable(m[1]);
  for (const c of flat.matchAll(/\bADD COLUMN(?:\s+IF NOT EXISTS)?\s+"?([A-Za-z_]\w*)"?/gi)) {
    const key = `${table}.${c[1].toLowerCase()}`;
    if (!addedAt.has(key)) addedAt.set(key, i);
  }
});

const orderIssues = [];
const colsIn = (list) =>
  list
    .split(',')
    .map((x) => x.trim().split(/\s+/)[0].replace(/"/g, '').toLowerCase())
    .filter((x) => /^[a-z_]\w*$/.test(x));

stmts.forEach((s, i) => {
  const flat = s.text.replace(/^--.*$/gm, '').replace(/\s+/g, ' ');
  const refs = []; // { table, col, what }

  const trg = /^CREATE TRIGGER[\s\S]*?\bON\s+([\w".]+)/i.exec(flat);
  if (trg) {
    const table = normTable(trg[1]);
    const of = /UPDATE\s+OF\s+([\w",\s]+?)\s+ON\b/i.exec(flat);
    if (of) for (const c of colsIn(of[1])) refs.push({ table, col: c, what: '触发器 UPDATE OF' });
  }

  const idx = /^CREATE (?:UNIQUE )?INDEX[\s\S]*?\bON\s+([\w".]+)\s*\(([^)]*)\)/i.exec(flat);
  if (idx) {
    const table = normTable(idx[1]);
    const cols = idx[2].split(',').map((x) => x.trim().split(/\s+/)[0]);
    for (const c of colsIn(cols.join(','))) {
      // 表达式索引（含括号/函数）跳过，只查纯列名
      if (/^[a-z_]\w*$/.test(c)) refs.push({ table, col: c, what: '索引列' });
    }
  }

  for (const r of refs) {
    const at = addedAt.get(`${r.table}.${r.col}`);
    if (at !== undefined && at > i) {
      orderIssues.push(
        `第 ${i + 1} 条语句（L${lineOf(s.offset)}）${r.what}引用了 ${r.table}.${r.col}，` +
          `但该列到第 ${at + 1} 条语句（L${lineOf(stmts[at].offset)}）才 ADD COLUMN——顺序反了，执行必报 42703`,
      );
    }
  }
});

console.log(`DDL 顺序检查：${orderIssues.length === 0 ? '通过' : `${orderIssues.length} 项异常`}`);
for (const s of orderIssues) console.log(`  [顺序] ${s}`);

// ---- 关卡 ②：语法解析（只解析解析器真正支持的语句类型）----
// pgsql-ast-parser 覆盖的是查询与部分 DDL；SECURITY DEFINER / SET search_path / GRANT /
// REVOKE / CREATE POLICY / CREATE TRIGGER / ENABLE ROW LEVEL SECURITY / ANALYZE / DO 一律不认，
// COMMENT ON FUNCTION 也不认（只认 COMMENT ON TABLE / COLUMN）。
// 这些恰好是本项目脚本里 Postgres 专有、且语法固定不易写错的部分，故按白名单跳过，
// 只对「查询与建表建索引」这类最容易手滑的语句做真解析。
const SUPPORTED =
  /^(SELECT|WITH|INSERT|UPDATE|DELETE\b|CREATE TABLE|CREATE (UNIQUE )?INDEX|COMMENT ON (TABLE|COLUMN))\b/i;
const ALTER_ADD_COLUMN = /^ALTER TABLE[\s\S]*\bADD COLUMN\b/i;

let parseFailed = 0;
if (parser) {
  const skipped = [];
  const failed = [];
  let ok = 0;
  for (const s of stmts) {
    const flat = s.text.replace(/^--.*$/gm, '').trim();
    const head = flat.replace(/\s+/g, ' ').slice(0, 40);
    if (!SUPPORTED.test(flat) && !ALTER_ADD_COLUMN.test(flat)) {
      skipped.push({ line: lineOf(s.offset), head });
      continue;
    }
    try {
      parser.parse(s.text);
      ok++;
    } catch (err) {
      failed.push({
        line: lineOf(s.offset),
        head,
        msg: String(err?.message ?? err).slice(0, 220),
      });
    }
  }
  parseFailed = failed.length;

  console.log(
    `语法解析：通过 ${ok} · 解析器覆盖不到 ${skipped.length} · 报错 ${failed.length}`,
  );
  if (skipped.length) {
    console.log('\n[Postgres 专有 DDL，解析器覆盖不到，未做机器校验]');
    for (const s of skipped) console.log(`  L${s.line}  ${s.head}`);
  }
  if (failed.length) {
    console.log('\n[语法报错]');
    for (const s of failed) console.log(`  L${s.line}  ${s.head}\n        ${s.msg}`);
  }
} else {
  console.log('语法解析：跳过（未找到 pgsql-ast-parser，见文件头安装说明）');
}

const bad = structural.length + orderIssues.length + parseFailed;
console.log(`\n结论：${bad === 0 ? '未发现语法问题' : `${bad} 项待处理`}`);
process.exit(bad ? 1 : 0);
