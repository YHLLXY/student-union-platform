// 临时脚本：审计指定 chunk 的 sourcemap 来源构成（按原始字节聚合）
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist/assets';
const targets = process.argv.slice(2);

function audit(mapFile) {
  const map = JSON.parse(readFileSync(join(dist, mapFile), 'utf8'));
  const byPkg = new Map();
  for (const src of map.sources) {
    const m = src.match(/node_modules\/(.+?)(\/|$)/);
    const key = m ? m[1] : (src.includes('src/') ? '【本项目 src】' + src.split('src/')[1].split('?')[0] : src);
    byPkg.set(key, (byPkg.get(key) ?? 0) + 1);
  }
  // sourcesContent 字节聚合（映射文件级别的近似体积）
  const byBytes = new Map();
  if (map.sourcesContent) {
    map.sources.forEach((src, i) => {
      const m = src.match(/node_modules\/(.+?)(\/|$)/);
      const key = m ? m[1] : (src.includes('src/') ? '【本项目】' + src.split('src/')[1] : src);
      byBytes.set(key, (byBytes.get(key) ?? 0) + (map.sourcesContent[i]?.length ?? 0));
    });
  }
  const rows = [...byBytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
  console.log(`\n=== ${mapFile} ===`);
  console.log('来源数:', map.sources.length);
  rows.forEach(([k, v]) => console.log(`  ${(v / 1024).toFixed(1).padStart(8)} KB  ${k}`));
}

if (targets.length === 0) {
  console.log('用法: node scripts/audit-chunk.mjs <chunk名1> [chunk名2...]');
  console.log('可用 map:', readdirSync(dist).filter(f => f.endsWith('.map')).join('\n'));
} else {
  for (const t of targets) audit(t);
}
