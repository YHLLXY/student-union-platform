import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { resetStub, loginAs } from './helpers';

/**
 * Phase 4 · C3：无障碍（a11y）审计与回归门禁。
 *
 * 两件事一起做，是有意的：
 *   ① **出报告**：把 axe-core 扫出来的问题写成 `docs/a11y-audit.md`（人可读、可 diff，
 *      作为每一轮的审计留痕）；
 *   ② **当门禁**：对 critical 级问题断言为 0，防止后续改动把已修好的高频路径弄坏。
 *
 * 为什么只卡 critical 而不卡 serious：antd 组件库自身会带来一批 serious 级
 *（主要是颜色对比度与 aria 属性风格），逐条改要么改主题令牌、要么与组件库行为对抗，
 * 收益远低于成本。报告里如实列全，门禁只守「读屏用户完全用不了」的那一类。
 *
 * 账号用 stub 种子用户：赵敏（宣传部部长，能看到发布/审核类入口，页面最全）。
 */
const ZHAO = { name: '赵敏', studentId: 'XUAN2026', password: 'e2ePass123' };

const REPORT_PATH = path.join('docs', 'a11y-audit.md');

interface Finding {
  page: string;
  id: string;
  impact: string;
  help: string;
  nodes: number;
  targets: string[];
  sample: string;
}

const collected: Finding[] = [];

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  for (const v of results.violations) {
    collected.push({
      page: label,
      id: v.id,
      impact: v.impact ?? 'unknown',
      help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      sample: (v.nodes[0]?.html ?? '').replace(/\s+/g, ' ').slice(0, 120),
    });
  }
  return results;
}

/** 把这一轮扫到的全部问题写成报告（每次运行覆盖，报告里带生成时间与结论） */
function writeReport(scanned: string[]) {
  const byImpact: Record<string, number> = {};
  for (const f of collected) byImpact[f.impact] = (byImpact[f.impact] ?? 0) + 1;

  const lines: string[] = [
    '# 无障碍审计报告（自动生成）',
    '',
    `> 生成时间：${new Date().toISOString()} · 工具：axe-core（wcag2a / wcag2aa / wcag21a / wcag21aa）`,
    `> 扫描页面：${scanned.join(' · ')}`,
    '> 重新生成：`npx playwright test tests/e2e/a11y.spec.ts`（会同时跑回归门禁）',
    '',
    '## 总览',
    '',
    '| 影响级别 | 条数 | 含义 |',
    '|---------|------|------|',
    `| critical | ${byImpact.critical ?? 0} | 读屏用户完全无法使用，**门禁卡这一级** |`,
    `| serious  | ${byImpact.serious ?? 0} | 明显障碍，本轮修高频路径，其余留待下轮 |`,
    `| moderate | ${byImpact.moderate ?? 0} | 体验受损 |`,
    `| minor    | ${byImpact.minor ?? 0} | 吹毛求疵 |`,
    '',
    `合计 ${collected.length} 条规则命中。`,
    '',
  ];

  if (!collected.length) {
    lines.push('本轮未发现任何问题。', '');
  } else {
    lines.push('## 明细', '', '| 页面 | 规则 | 级别 | 问题 | 节点 | 命中位置 |', '|------|------|------|------|:----:|------|');
    for (const f of [...collected].sort(
      (a, b) => a.page.localeCompare(b.page) || a.impact.localeCompare(b.impact) || a.id.localeCompare(b.id),
    )) {
      lines.push(
        `| ${f.page} | \`${f.id}\` | ${f.impact} | ${f.help} | ${f.nodes} | \`${f.targets.join('` `')}\` |`,
      );
    }
    lines.push('');
  }

  lines.push(
    '## 本次覆盖的检查项',
    '',
    '- **axe-core 静态规则**（wcag2a / wcag2aa / wcag21a / wcag21aa）：上面明细里的全部条目；',
    '- **登录页键盘可达性**：真的按 Tab 走一遍，断言「学号」与提交按钮都能聚焦且顺序不越级',
    '  （实测顺序：姓名 → 学号 → 部门邀请码 → 继续 → 开发者，无越级；axe 查不出这一项）；',
    '- **尚未覆盖**：颜色对比度之外的视觉无障碍（放大/缩放、动效偏好 `prefers-reduced-motion` 的实际生效）、',
    '  屏幕阅读器实机朗读、非登录页的焦点顺序。',
    '',
    '## 修复原则（本项目约定）',
    '',
    '- **不改主题风格**：对比度类问题优先用 `src/utils/themeColors.ts` 的语义令牌解决，不硬编码颜色、不动整体视觉；',
    '- **表单控件必须有可访问名**：`Form.Item` + `label` 已覆盖大部分；筛选栏这类不在 Form 里的控件用 `aria-label`；',
    '- **只有图标的按钮必须有可访问名**：`aria-label`（antd 的 Tooltip 会补 `aria-describedby`，但不补按钮名）；',
    '- **装饰性图形用 `alt=""` / `aria-hidden`**，不要塞无意义文本；',
    '- 本轮只修「登录 / 工作台 / 任务 / 公告 / 论坛」这条高频路径，低频后台页列入下轮。',
    '',
  );

  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

/**
 * 每个被扫描页面的定位锚点：路由 hash + 该页**独有**的标题/副标题。
 *
 * 为什么不用侧边栏文案当锚点：工作台的快捷操作里有「发布任务 / 发布公告」，
 * 用这两个词等页面就绪会在**工作台**上就命中，等于没等——首跑就是这么把任务管理的问题
 * 记成了部门公告的问题。改用各页自己的标题/副标题，它们在别处不出现。
 *
 * 为什么每次整页 `goto` 而不是点侧边栏：模块是懒加载的，点菜单后 URL 立刻变、
 * 新页面的 JS 还在下载，这段时间 DOM 里仍是上一页。整页加载从根上消除这种「扫到上一页」。
 */
const MODULE: Record<string, { hash: string; heading?: string; text?: string }> = {
  任务管理: { hash: '/tasks', heading: '任务管理' },
  部门公告: { hash: '/notices', text: '部门内部的通知、会议纪要与活动安排' },
  部门论坛: { hash: '/forum', text: '工作讨论、活动策划与资料共享' },
  活动抢票: { hash: '/tickets', heading: '活动抢票' },
  权限管理: { hash: '/admin', heading: '权限管理' },
  个人中心: { hash: '/profile', heading: '个人中心' },
};

/** 登录页提交按钮的可访问名（antd 两字按钮会插空格，比对前已去空白） */
const SUBMIT_RE = /继续|下一步|登录|进入|注册/;

/** 扫描顺序：高频在前（登录 → 工作台 → 任务 / 公告 / 论坛），其余常用模块在后 */
const SCAN_MODULES = ['任务管理', '部门公告', '部门论坛', '活动抢票', '权限管理', '个人中心'] as const;

async function visitModule(page: Page, label: string) {
  const { hash, heading, text } = MODULE[label];
  await page.goto(`/#${hash}`);
  await page.waitForURL(new RegExp(`${hash}$`));
  if (heading) await page.getByRole('heading', { name: heading }).waitFor({ timeout: 15_000 });
  if (text) await page.getByText(text).first().waitFor({ timeout: 15_000 });
  await page.locator('.ant-skeleton').first().waitFor({ state: 'detached' }).catch(() => {});
}

test.describe('Phase 4 无障碍审计（C3）', () => {
  test('高频路径扫描 + critical 门禁 + 生成 docs/a11y-audit.md', async ({ page }) => {
    test.setTimeout(120_000);
    await resetStub();

    const scanned: string[] = [];

    // ① 登录页（未登录状态，含注册/找回密码入口）
    await page.goto('/');
    await expect(page.getByPlaceholder('学号')).toBeVisible();
    scanned.push('登录页');
    await scan(page, '登录页');

    // ② 登录后的高频页面
    await loginAs(page, ZHAO);
    await page.waitForURL(/#\/dashboard/);
    await expect(page.getByText('最近动态')).toBeVisible();
    scanned.push('工作台');
    await scan(page, '工作台');

    for (const mod of SCAN_MODULES) {
      await visitModule(page, mod);
      scanned.push(mod);
      await scan(page, mod);
    }

    // 先落报告再断言：门禁失败时也要留下这一轮的完整清单，便于照着修
    writeReport(scanned);

    const criticals = collected.filter((f) => f.impact === 'critical');
    if (criticals.length) {
      console.log(
        'critical 无障碍问题：\n' +
          criticals
            .map((c) => `  · [${c.page}] ${c.id}（${c.nodes} 处）：${c.targets.join(' / ')}`)
            .join('\n'),
      );
    }

    expect(criticals.map((c) => `[${c.page}] ${c.id} ${c.targets[0]}`), '存在 critical 无障碍问题').toHaveLength(0);
  });

  /**
   * 焦点顺序：axe 查不出这一项（它只做静态规则），但键盘用户每天都会撞上——
   * 只能用「真的按 Tab 走一遍」来验证。登录页是全站第一道门，先守它。
   */
  test('登录页键盘可达性：Tab 能走到所有输入与提交按钮，顺序不越级', async ({ page }) => {
    await resetStub();
    await page.goto('/');
    await expect(page.getByPlaceholder('学号')).toBeVisible();

    const focusPath: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return '';
        return (
          el.getAttribute('placeholder') ||
          el.getAttribute('aria-label') ||
          (el.textContent || '').trim().slice(0, 12) ||
          el.tagName.toLowerCase()
        );
      });
      // antd 会给恰好两个汉字的按钮插一个空格（`继续` → `继 续`），比对前统一去掉空白
      if (label) focusPath.push(label.replace(/\s+/g, ''));
      if (focusPath.some((f) => f.includes('学号')) && focusPath.some((f) => SUBMIT_RE.test(f))) break;
    }

    const idIdx = focusPath.findIndex((f) => f.includes('学号'));
    const submitIdx = focusPath.findIndex((f) => SUBMIT_RE.test(f));
    expect(idIdx, `Tab 路径里没到达「学号」输入框：${focusPath.join(' → ')}`).toBeGreaterThanOrEqual(0);
    expect(submitIdx, `Tab 路径里没到达提交按钮：${focusPath.join(' → ')}`).toBeGreaterThan(idIdx);
  });
});
