import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { resetStub, loginAs, stubInsert } from './helpers';

/**
 * 移动端横向溢出门禁（v4.6.1）。
 *
 * 背景：Issue #7 修过一轮（2026-07-12），2026-09 仍发现多处页面在手机上超出屏宽。
 * 本门禁把「375px 视口下无页面级横向滚动」变成机器断言，防止下一轮改动再漏。
 *
 * 为什么检查两个滚动器：
 *   - AppLayout 的 `.contentArea`（DOM 上是 `.ant-layout-content`）是 `overflow-y:auto`
 *     的纵向滚动器，按 CSS 规范其 overflow-x 被隐式计算为 auto——页面级溢出在这里
 *     表现为「内容区的内部横滚」，`document.scrollingElement` 根本察觉不到；
 *   - 登录页不在 AppLayout 内，走 document 层。
 *   两个都要 `scrollWidth <= clientWidth + 1` 才算过。
 *
 * 为什么不检查所有滚动容器：看板（85vw 列 + scroll-snap）、年度热力图、设置了
 * `scroll={{x}}` 的表格都是**有意**的内部横滚，是本项目的既定适配形态，不在本门禁范围。
 * 诊断输出里已通过「祖先链上有 overflow-x:auto/scroll 即豁免」排除它们的子元素。
 *
 * 账号与页面锚点与 a11y.spec.ts 保持一致（赵敏/宣传部部长 = 按钮最多的最坏角色；
 * 锚点用各页独有标题，避免被工作台快捷入口提前命中）。
 */
const ZHAO = { name: '赵敏', studentId: 'XUAN2026', password: 'e2ePass123' };

const REPORT_PATH = path.join('docs', 'mobile-overflow-report.md');
const VIEWPORT = { width: 375, height: 812 };
const TOLERANCE_PX = 1;

/** 与 a11y.spec.ts 同一套锚点（两边改锚点务必同步） */
const MODULE: Record<string, { hash: string; heading?: string; text?: string }> = {
  任务管理: { hash: '/tasks', heading: '任务管理' },
  部门公告: { hash: '/notices', text: '部门内部的通知、会议纪要与活动安排' },
  部门论坛: { hash: '/forum', text: '工作讨论、活动策划与资料共享' },
  活动抢票: { hash: '/tickets', heading: '活动抢票' },
  权限管理: { hash: '/admin', heading: '权限管理' },
  个人中心: { hash: '/profile', heading: '个人中心' },
};
const SCAN_MODULES = ['任务管理', '部门公告', '部门论坛', '活动抢票', '权限管理', '个人中心'] as const;

/**
 * 长串回归样例帖：用户生成内容是溢出的大头（长 URL、无空格英文串、代码块长行），
 * 种子数据里没有这类内容，论坛页在门禁里会「假绿」。论坛步骤前插入这条帖子，
 * 并打开详情弹窗一起量测，让批次 1（Markdown 断词）始终有机器证据。
 * created_by 用赵敏的种子 id（uid(4)），保证权限与可见性口径一致。
 */
const ZHAO_ID = '00000000-0000-4000-8000-000000000004';
const LONG_POST_TITLE = '【回归】移动端长串渲染样例（自动生成，可删）';
const LONG_POST_CONTENT = [
  '调研结论与参考资料如下。',
  '',
  '参考链接：https://developer.mozilla.org/zh-CN/docs/Web/CSS/overflow-wrap#' + 'x'.repeat(100),
  '',
  '代码块：',
  '```',
  'const veryLongVariableName = calculateSomethingExtremelyLong(paramOne, paramTwo, paramThree, paramFour, paramFive);',
  '```',
  '',
  '无空格长串：Supercalifragilisticexpialidocious_antidisestablishmentarianism_pneumonoultramicroscopicsilicovolcanoconiosis',
].join('\n');
const LONG_POST_ANCHOR = '调研结论与参考资料如下';

interface ScrollerResult {
  key: string;
  scrollWidth: number;
  clientWidth: number;
  overflow: number;
}

interface PageResult {
  page: string;
  scrollers: ScrollerResult[];
  offenders: string[];
  failed: boolean;
}

/** 量测目标滚动器的横向溢出：document + 内容区 + 打开中的弹窗遮罩（.ant-modal-wrap 是 fixed+overflow:auto 的全屏滚动器） */
async function measureScrollers(page: Page): Promise<ScrollerResult[]> {
  return page.evaluate(() => {
    const targets: Array<[string, HTMLElement]> = [
      ['document', (document.scrollingElement ?? document.documentElement) as HTMLElement],
      ...Array.from(document.querySelectorAll<HTMLElement>('.ant-layout-content')).map(
        (el, i): [string, HTMLElement] => [`contentArea#${i}`, el],
      ),
      ...Array.from(document.querySelectorAll<HTMLElement>('.ant-modal-wrap')).map(
        (el, i): [string, HTMLElement] => [`modalWrap#${i}`, el],
      ),
    ];
    return targets.map(([key, sc]) => ({ key, scrollWidth: sc.scrollWidth, clientWidth: sc.clientWidth, overflow: sc.scrollWidth - sc.clientWidth }));
  });
}

/**
 * 找溢出的元凶（只做诊断输出，不参与判定）：
 * document 层与每个 .ant-layout-content 内，找右缘超出其容器右缘的元素；
 * 祖先链上有 overflow-x:auto/scroll 的（表格 scroll.x、看板、热力图等有意横滚容器）一律豁免。
 */
async function findOffenders(page: Page): Promise<string[]> {
  return page.evaluate((tol) => {
    const inIntentionalScroller = (el: Element, root: Element | null): boolean => {
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowX)) return true;
      }
      return false;
    };
    const out: Array<{ over: number; desc: string }> = [];
    const scan = (root: Element | null, rootBox: DOMRect) => {
      const scope: ParentNode = root ?? document.body;
      for (const el of scope.querySelectorAll('*')) {
        if (root && el.matches('.ant-layout-content')) continue; // contentArea 自身由量测判定
        if (inIntentionalScroller(el, root)) continue;
        const r = el.getBoundingClientRect();
        const over = Math.round(r.right - rootBox.right);
        if (r.width > 0 && over > tol) {
          const cls = typeof el.className === 'string' ? el.className : '';
          const clsShort = cls ? '.' + cls.split(/\s+/).slice(0, 2).join('.') : '';
          out.push({
            over,
            desc: `<${el.tagName.toLowerCase()}${clsShort}> 超出 ${over}px：「${(el.textContent ?? '').trim().slice(0, 30)}」`,
          });
        }
      }
    };
    // document 层（登录页等 AppLayout 之外的页面）
    const de = document.scrollingElement ?? document.documentElement;
    scan(null, de.getBoundingClientRect());
    // AppLayout 内容区
    for (const area of document.querySelectorAll('.ant-layout-content')) {
      scan(area, area.getBoundingClientRect());
    }
    return out.sort((a, b) => b.over - a.over).slice(0, 5).map((o) => o.desc);
  }, TOLERANCE_PX);
}

async function auditPage(page: Page, label: string): Promise<PageResult> {
  const scrollers = await measureScrollers(page);
  const failed = scrollers.some((s) => s.overflow > TOLERANCE_PX);
  const offenders = failed ? await findOffenders(page) : [];
  return { page: label, scrollers, offenders, failed };
}

/** 每次运行覆盖写 docs/mobile-overflow-report.md（与 a11y-audit.md 同一套路：报告即交付物） */
function writeReport(results: PageResult[]) {
  const lines: string[] = [
    '# 移动端横向溢出报告（自动生成）',
    '',
    `> 生成时间：${new Date().toISOString()} · 视口：${VIEWPORT.width}×${VIEWPORT.height} · 容忍：${TOLERANCE_PX}px`,
    '> 重新生成：`npx playwright test tests/e2e/mobile-overflow.spec.ts`（同时执行门禁断言）',
    '',
    '| 页面 | document | contentArea | 结论 |',
    '|------|----------|-------------|------|',
  ];
  for (const r of results) {
    const doc = r.scrollers.find((s) => s.key === 'document');
    const content = r.scrollers.find((s) => s.key.startsWith('contentArea'));
    const fmt = (s?: ScrollerResult) => (s ? `${s.scrollWidth}/${s.clientWidth}px` : '—');
    lines.push(`| ${r.page} | ${fmt(doc)} | ${fmt(content)} | ${r.failed ? '❌ 溢出' : '✅'} |`);
  }
  const bad = results.filter((r) => r.failed);
  if (bad.length) {
    lines.push('', '## 溢出明细（每个失败页最多列 5 个元凶，豁免有意横滚容器内的元素）', '');
    for (const r of bad) {
      lines.push(`### ${r.page}`, '', ...r.offenders.map((o) => `- ${o}`), '');
    }
  }
  lines.push(
    '',
    '## 检查口径',
    '',
    '- 目标滚动器：`document.scrollingElement`（登录页）+ `.ant-layout-content`（登录后页面）；',
    '- 判定：`scrollWidth > clientWidth + 1px` 即失败（1px 容忍亚像素取整）；',
    '- **有意横滚不在范围**：设置了 `scroll={{x}}` 的表格、看板（85vw+snap）、年度热力图、论坛分类 chips；',
    '- 弹层（Modal/Drawer）不在本门禁范围（未打开状态不渲染，antd v6 本身把超宽弹窗钳到 100vw）。',
    '',
  );
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

/** 与 a11y.spec.ts 相同的整页导航 + 独有锚点等待（懒加载模块不能点菜单后立刻量测） */
async function visitModule(page: Page, label: string) {
  const { hash, heading, text } = MODULE[label];
  await page.goto(`/#${hash}`);
  await page.waitForURL(new RegExp(`${hash.replace(/\//g, '\\/')}$`));
  if (heading) await page.getByRole('heading', { name: heading }).waitFor({ timeout: 15_000 });
  if (text) await page.getByText(text).first().waitFor({ timeout: 15_000 });
  await page.locator('.ant-skeleton').first().waitFor({ state: 'detached' }).catch(() => {});
  // 懒加载 chunk 下载完 ≠ 布局稳定完，让字体/图片/动画落定后再量
  await page.waitForTimeout(300);
}

test.describe('移动端横向溢出门禁（v4.6.1）', () => {
  test('375px 视口下全部高频页面无页面级横向滚动', async ({ page }) => {
    test.setTimeout(120_000);
    await resetStub();
    // 视口必须在登录前切到 375，让 AppLayout 一路按移动形态渲染（Sider→Drawer）
    await page.setViewportSize(VIEWPORT);

    const results: PageResult[] = [];

    // ① 登录页（AppLayout 之外，量 document 层）
    await page.goto('/');
    await expect(page.getByPlaceholder('学号')).toBeVisible();
    results.push(await auditPage(page, '登录页'));

    // ② 登录后高频页面（赵敏 = 宣传部部长，按钮最多的最坏视角）
    await loginAs(page, ZHAO, { mobile: true });
    await expect(page.getByText('最近动态')).toBeVisible();
    results.push(await auditPage(page, '工作台'));

    for (const mod of SCAN_MODULES) {
      if (mod === '部门论坛') {
        // 种子数据没有长串内容，论坛会「假绿」——先插一条含长 URL/代码块的样例帖
        await stubInsert('forum_posts', {
          title: LONG_POST_TITLE,
          content: LONG_POST_CONTENT,
          category: 'discussion',
          department: 'publicity',
          collaborating_departments: [],
          created_by: ZHAO_ID,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      await visitModule(page, mod);
      results.push(await auditPage(page, mod));
      if (mod === '部门论坛') {
        // 打开长串样例帖详情一起量测：详情是 Modal，被 antd v6 钳到全屏宽，
        // 正文溢出表现为全屏遮罩层（.ant-modal-wrap）的横向滚动
        await page.getByText(LONG_POST_TITLE).first().click();
        await expect(page.getByText(LONG_POST_ANCHOR).first()).toBeVisible();
        await page.waitForTimeout(300);
        results.push(await auditPage(page, '部门论坛·长串帖子详情'));
      }
    }

    // 先落报告再断言：门禁失败时也要留下这一轮的完整清单，便于照着修
    writeReport(results);

    const bad = results.filter((r) => r.failed);
    const detail = bad
      .map((r) => {
        const over = r.scrollers.filter((s) => s.overflow > TOLERANCE_PX).map((s) => `${s.key} ${s.scrollWidth}>${s.clientWidth}px`);
        return `  · ${r.page}（${over.join('，')}）\n${r.offenders.map((o) => `      ${o}`).join('\n')}`;
      })
      .join('\n');
    expect(
      bad.map((r) => r.page),
      `以下页面在 ${VIEWPORT.width}px 视口出现页面级横向溢出：\n${detail}`,
    ).toHaveLength(0);
  });
});
