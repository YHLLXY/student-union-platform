import { test, expect } from './fixtures';
import { resetStub, stubBulkInsert, loginAs, btn } from './helpers';

/**
 * Phase 1 B4 通知中心升级：分栏计数、分页加载、同类聚合。
 *
 * 数据构造：王开发（dev-stub 种子 uid(1)）原有 4 条通知（2 未读），
 * 再批量灌 22 条同类型同跳转目标的未读通知 → 总数 26（超过一页 20）、未读 24。
 */
const WANG = { name: '王开发', studentId: 'DEV0001', password: 'e2ePass123' };
const WANG_ID = '00000000-0000-4000-8000-000000000001';
const EXTRA = 22;

/** 铃铛触发器：图标本身会被绝对定位的红点压住，故点它的父级（onClick 就在父级） */
const bellTrigger = (page: import('@playwright/test').Page) =>
  page.locator('header').getByRole('img', { name: 'bell' }).locator('xpath=..');

/** 时间戳显式错开，让「时间倒序 + 分页边界」可断言 */
function seedPagedNotifications(count: number) {
  const base = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => ({
    user_id: WANG_ID,
    type: 'new_notice',
    title: `E2E 分页通知 #${i}`,
    content: '',
    related_link: '/notices',
    is_read: false,
    created_at: new Date(base + i * 3600_000).toISOString(),
  }));
}

test.describe('通知中心升级', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('分栏计数 / 同类聚合 / 加载更多', async ({ page }) => {
    await stubBulkInsert('notifications', seedPagedNotifications(EXTRA));
    await loginAs(page, WANG);

    // 角标 = 种子 2 条未读 + 新增 22 条（只算未读，与已读的两条无关）
    const bell = bellTrigger(page);
    await expect(bell).toBeVisible();
    await expect(bell.getByText(String(EXTRA + 2), { exact: true })).toBeVisible();

    await bell.click();
    const panel = page.locator('.ant-popover').filter({ hasText: '消息通知' });
    await expect(panel).toBeVisible();

    // 分栏计数：总数 4+22，任务 2（task_assigned + submission_approved），公告 1+22，论坛 1，系统 0
    await expect(panel.getByRole('tab', { name: /全\s*部\s*26/ })).toBeVisible();
    await expect(panel.getByRole('tab', { name: /任\s*务\s*2/ })).toBeVisible();
    await expect(panel.getByRole('tab', { name: /公\s*告\s*23/ })).toBeVisible();
    await expect(panel.getByRole('tab', { name: /系\s*统\s*0/ })).toBeVisible();

    // 首屏只加载 20 条：4 条种子 + #21..#6 → 聚合组为 #21 打头 + 15 条折叠子项
    await expect(panel.getByText(/还有 15 条同类通知/)).toBeVisible();

    // 展开聚合组：子项内联展开，本页最后一条可见
    await panel.getByText(/还有 15 条同类通知/).click();
    await expect(panel.getByText('收起')).toBeVisible();
    await expect(panel.getByText('E2E 分页通知 #6')).toBeVisible();
    // 仍在第一页：更老的 #5 必须还没出现
    await expect(panel.getByText('E2E 分页通知 #5')).toHaveCount(0);

    // 加载更多 → 第二页补齐剩余 5 条，最老的一条出现
    await btn(panel, '加载更多').click();
    await expect(panel.getByText('E2E 分页通知 #0')).toBeVisible();

    // 收起后聚合组的条数覆盖到两页全部：22 条同类
    await panel.getByText('收起').click();
    await expect(panel.getByText(`还有 ${EXTRA - 1} 条同类通知`)).toBeVisible();
  });

  test('分栏切到「公告」后只剩公告类通知', async ({ page }) => {
    await stubBulkInsert('notifications', seedPagedNotifications(EXTRA));
    await loginAs(page, WANG);

    await bellTrigger(page).click();
    const panel = page.locator('.ant-popover').filter({ hasText: '消息通知' });
    await panel.getByRole('tab', { name: /公\s*告\s*23/ }).click();

    // 任务类通知不出现
    await expect(panel.getByText(/招新宣传推文终稿校对与排版/)).toHaveCount(0);

    // 公告栏里，种子的那条公告与本轮灌入的 22 条同类型同跳转目标 → 首次加载即合成一组
    await expect(panel.getByText(/还有 19 条同类通知/)).toBeVisible();
    await panel.getByText(/还有 19 条同类通知/).click();
    await expect(panel.getByText('E2E 分页通知 #21')).toBeVisible();
  });

  test('「本栏已读」把当前栏清空未读', async ({ page }) => {
    await loginAs(page, WANG);

    const bell = bellTrigger(page);
    await bell.click();
    const panel = page.locator('.ant-popover').filter({ hasText: '消息通知' });

    // 任务栏 2 条中 1 条未读（另一条种子是已读）→「本栏已读」后角标降为 1、按钮消失
    await panel.getByRole('tab', { name: /任\s*务\s*2/ }).click();
    await expect(btn(panel, '本栏已读')).toBeVisible();
    await btn(panel, '本栏已读').click();

    await expect(bell.getByText('1', { exact: true })).toBeVisible();
    await expect(panel.getByText('本栏已读')).toHaveCount(0);
  });

  test('点单条通知：就地置已读、角标即时减一、跳转到关联模块', async ({ page }) => {
    await loginAs(page, WANG);

    const bell = bellTrigger(page);
    await bell.click();
    const panel = page.locator('.ant-popover').filter({ hasText: '消息通知' });
    await panel.getByRole('tab', { name: /任\s*务\s*2/ }).click();

    // 未读 2 条：种子 801（任务指派，跳 /tasks）+ 802（公告）
    await expect(bell.getByText('2', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: /你有新任务/ }).click();

    await expect(page).toHaveURL(/#\/tasks/);
    // 乐观更新：不等后台返回，角标就地降为 1
    await expect(bell.getByText('1', { exact: true })).toBeVisible();
  });
});
