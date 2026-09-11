import { test, expect } from './fixtures';
import { resetStub, loginAs, gotoModule, btn } from './helpers';
import fs from 'node:fs';

/**
 * Phase 2（v4.4.0）三个新闭环的端到端验证：
 *   ① 票务扫码签到（token 取码 → 手输签到 → 幂等 → 无效码）
 *   ② 票务详情 Drawer 的签到名单与导出
 *   ③ 考核积分在个人中心与工作看板的呈现
 *   ④ 批量生成邀请码
 *
 * 关于「手输签到码」：E2E 环境没有摄像头（也不该在 CI 里开），所以走的是产品里
 * 真实存在的降级入口——签到码原文就展示在二维码下方。这条路径与扫码共用同一个
 * RPC，因此验它等价于验签到链路本身。
 */
const DEV = { name: '王开发', studentId: 'DEV0001', password: 'e2ePass123' };
const PRESIDENT = { name: '陈主席', studentId: 'PRES2026', password: 'e2ePass123' };
const DEPT_HEAD = { name: '吴雅婷', studentId: 'WENYI2026', password: 'e2ePass123' };

/** 种子票据 705 的活动时间在「现在 +1 小时」= 签到时间窗内 */
const IN_WINDOW_TICKET = '校运会志愿者现场签到凭证';

test.describe('票务闭环：签到码 → 扫码/手输 → 幂等 → 名单', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('我的票券取码 → 手输签到成功 → 重复签到被识别 → 无效码被拒', async ({ page }) => {
    await loginAs(page, DEV);
    await gotoModule(page, '活动抢票');

    // ---------- 1. 取签到码（参与者侧） ----------
    await page.getByRole('tab', { name: '我的票券' }).click();
    const myPane = page.getByRole('tabpanel');
    // CSS Modules 会保留局部类名作前缀（_myTicketItem_hash），用子串匹配最稳
    const myItem = page.locator('[class*="myTicketItem"]').filter({ hasText: IN_WINDOW_TICKET });
    await btn(myItem, '签到码').click();

    const qrModal = page.locator('.ant-modal').filter({ hasText: '我的签到码' });
    await expect(qrModal.getByAltText('签到二维码')).toBeVisible();
    // 签到码原文（SUP1.<记录>.<过期>.<MAC>）同时展示，作为手输降级入口
    const token = await qrModal.locator('[title^="SUP1."]').innerText();
    expect(token.startsWith('SUP1.')).toBeTruthy();

    // 关闭用 Esc：这两个弹窗都是 footer=null 的纯展示弹窗，右上角 X 的可访问名
    // 随 antd 版本/语言包变化，键盘关闭才是稳定路径（也是真实用户的习惯动作）
    await page.keyboard.press('Escape');
    await expect(qrModal).toHaveCount(0);

    // ---------- 2. 组织者侧手输签到 ----------
    await btn(page, '扫码签到').click();
    const scanModal = page.locator('.ant-modal').filter({ hasText: '扫码签到' });
    await scanModal.getByPlaceholder(/手输签到码/).fill(token);
    await btn(scanModal, '确认签到').click();
    await expect(page.getByText('王开发 签到成功（积分 +1）').first()).toBeVisible();

    // ---------- 3. 同一张票再签一次：幂等，不重复加分 ----------
    await scanModal.getByPlaceholder(/手输签到码/).fill(token);
    await btn(scanModal, '确认签到').click();
    await expect(scanModal.getByText(/已于 .* 签到过/).first()).toBeVisible();

    // ---------- 4. 乱码：明确拒绝 ----------
    await scanModal.getByPlaceholder(/手输签到码/).fill('SUP1.00000000-0000-4000-8000-000000000713.1.deadbeef');
    await btn(scanModal, '确认签到').click();
    await expect(scanModal.getByText(/签到码无效或已过期/).first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(scanModal).toHaveCount(0);

    // ---------- 5. 我的票券状态已翻转 ----------
    await expect(myPane.getByText('已签到').first()).toBeVisible();
  });

  test('票务详情 Drawer：签到名单统计与导出', async ({ page }) => {
    await loginAs(page, DEPT_HEAD);
    await gotoModule(page, '活动抢票');

    const card = page.locator('.ant-card').filter({ hasText: IN_WINDOW_TICKET });
    await btn(card, '详情').click();

    const drawer = page.locator('.ant-drawer').filter({ hasText: IN_WINDOW_TICKET });
    await expect(drawer.getByRole('tab', { name: '活动说明' })).toBeVisible();

    // 组织者才有「签到名单」Tab：2 人领票，其中 1 人已签到（种子数据）
    // 统计 Tag 与进度条文案（「已领 2 张」）会撞词，故用 exact 收紧
    await drawer.getByRole('tab', { name: '签到名单' }).click();
    await expect(drawer.getByText('已领 2', { exact: true })).toBeVisible();
    await expect(drawer.getByText('已签到 1', { exact: true })).toBeVisible();
    await expect(drawer.getByText('孙晓雨')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn(drawer, '导出名单').click(),
    ]);
    const content = fs.readFileSync((await download.path())!, 'utf8');
    expect(content).toContain('姓名,学号,领票时间,签到状态,签到时间');
    expect(content).toContain('孙晓雨,XUAN1001');
    expect(content).toContain('已签到');
    expect(content).toContain('未签到');
  });
});

test.describe('考核积分：个人中心与工作看板', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('个人中心显示本学期积分与明细，并可导出', async ({ page }) => {
    await loginAs(page, DEV);
    await gotoModule(page, '个人中心');

    // 种子：王开发 3 条流水 = +2（审核通过）+1（按时提交）+1（签到）= 4
    await expect(page.getByText('我的积分')).toBeVisible();
    await expect(page.getByText('本学期累计')).toBeVisible();
    await expect(page.locator('.ant-statistic-content-value').filter({ hasText: '4' }).first()).toBeVisible();

    await btn(page, '明细').click();
    const detail = page.locator('.ant-modal').filter({ hasText: '我的积分明细' });
    await expect(detail.getByText('任务审核通过').first()).toBeVisible();
    await expect(detail.getByText('活动签到').first()).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn(detail, '导出明细').click(),
    ]);
    const content = fs.readFileSync((await download.path())!, 'utf8');
    expect(content).toContain('时间,事项,积分变化,学期');
    expect(content).toContain('任务审核通过');
  });

  test('工作看板的积分排行可切范围并导出', async ({ page }) => {
    await loginAs(page, PRESIDENT);
    await gotoModule(page, '权限管理');
    await page.getByRole('tab', { name: '工作看板' }).click();

    await expect(page.getByText('本学期积分排行')).toBeVisible();
    // 范围切换是 antd Segmented（不是 button，role 随版本而变），按容器定位
    await page.locator('.ant-segmented-item').filter({ hasText: '全校' }).click();

    // 排行表里同名成员卡片也在同一页面，故把断言收进排行卡作用域
    const standingsCard = page.locator('.ant-card').filter({ hasText: '本学期积分排行' });
    await expect(standingsCard.getByRole('cell', { name: '王开发' })).toBeVisible();
    await expect(standingsCard.getByRole('cell', { name: '孙晓雨' })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn(page, '导出排行').click(),
    ]);
    const content = fs.readFileSync((await download.path())!, 'utf8');
    expect(content).toContain('排名,姓名,部门,角色,本学期积分');
    expect(content).toContain('本学期积分');
  });
});

test.describe('批量生成邀请码', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('按当前参数批量生成 3 个，可复制全部并导出 CSV', async ({ page }) => {
    await loginAs(page, PRESIDENT);
    await gotoModule(page, '权限管理');

    await btn(page, '批量生成').click();
    const modal = page.locator('.ant-modal').filter({ hasText: '批量生成邀请码' });
    await expect(modal.getByText('按当前参数生成')).toBeVisible();

    // 数量输入框（默认 10，改成 3）
    const countInput = modal.locator('.ant-input-number-input').first();
    await countInput.fill('3');
    await btn(modal, '生成 3 个邀请码').click();

    await expect(page.getByText('已生成 3 个邀请码')).toBeVisible();
    await expect(modal.getByText(/已生成 3 个邀请码/)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn(modal, '导出 CSV').click(),
    ]);
    const content = fs.readFileSync((await download.path())!, 'utf8');
    expect(content).toContain('序号,邀请码,部门,角色,有效期');
    expect(content).toContain('永不过期');

    // 结果表里正好 3 行邀请码（纯正则：6 位大写字母数字）
    const codeCount = (content.match(/,\d{0,2}[A-Z0-9]{6},/g) ?? []).length;
    expect(codeCount).toBe(3);
  });
});
