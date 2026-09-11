import { test, expect } from './fixtures';
import { resetStub, loginAs, gotoModule, setDateTimePicker, btn } from './helpers';

/**
 * E2E 冒烟③ 发布票务 → 抢票 → 我的票券
 *
 * 票务侧最容易出问题的是「开抢时间」与「活动时间」的时序（决定按钮是否可点），
 * 因此这里刻意发布一张「开抢时间在过去、活动时间在将来」的新票，再走抢票与票券查询。
 */
const ORGANIZER = { name: '吴雅婷', studentId: 'WENYI2026', password: 'e2ePass123' }; // 文艺部 部长
const TICKET_TITLE = 'E2E 冒烟：迎新晚会加座票';

test.describe('冒烟③ 发布票务 → 抢票 → 我的票券', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('部长发布票务后可抢票，票券出现在「我的票券」', async ({ page }) => {
    // ---------- 1. 发布票务 ----------
    await loginAs(page, ORGANIZER);
    await gotoModule(page, '活动抢票');
    await btn(page, '发布票务').click();
    await page.getByPlaceholder('例：元旦晚会入场券').fill(TICKET_TITLE);
    await page.getByPlaceholder('活动详情').fill('E2E 冒烟用例发布的票务。');
    await setDateTimePicker(page, '选择活动开始时间', '2030-01-01 19:00:00');
    await setDateTimePicker(page, '选择开抢时间（应早于活动开始时间）', '2020-01-01 00:00:00');
    await btn(page, '发布').click();

    await expect(page.getByText('票务发布成功')).toBeVisible();

    // ---------- 2. 抢票（新票开抢时间已过 → 按钮可用） ----------
    const card = page.locator('.ant-card').filter({ hasText: TICKET_TITLE });
    // 先确认两个时间真的落库（DatePicker 的输入是否被提交，看卡片文案最直接）
    await expect(card.getByText('活动：2030-01-01 19:00')).toBeVisible();
    await expect(card.getByText('开抢：2020-01-01 00:00')).toBeVisible();
    await expect(card.getByText('剩余 100/100')).toBeVisible();
    await btn(card, '抢票').click();

    await expect(page.getByText('抢票成功')).toBeVisible();
    await expect(card.getByText('已抢票')).toBeVisible();

    // ---------- 3. 我的票券 ----------
    await page.getByRole('tab', { name: '我的票券' }).click();
    const myPane = page.getByRole('tabpanel');
    await expect(myPane.getByText(TICKET_TITLE)).toBeVisible();
    await expect(myPane.getByText('已抢到')).toBeVisible();
  });
});
