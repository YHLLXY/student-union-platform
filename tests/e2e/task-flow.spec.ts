import { test, expect } from './fixtures';
import { resetStub, loginAs, logout, gotoModule, confirmPopconfirm, btn } from './helpers';

/**
 * E2E 冒烟② 发布任务 → 志愿者提交 → 审核通过
 *
 * 三角色闭环里最核心的一条：部长（dept_head）发布 → 同部门志愿者（volunteer）提交 →
 * 部长在提交记录上审核通过。全程只走真实 UI，数据落在本地 stub。
 */
const DEPT_HEAD = { name: '赵敏', studentId: 'XUAN2026', password: 'e2ePass123' };    // 宣传部 部长
const VOLUNTEER = { name: '孙晓雨', studentId: 'XUAN1001', password: 'e2ePass123' };  // 宣传部 志愿者
const TASK_TITLE = 'E2E 冒烟：迎新物料清点与入库';
const SUBMIT_NOTE = '物料已清点完毕，明细见群文件。';

test.describe('冒烟② 发布任务 → 志愿者提交 → 审核通过', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('部长发布后志愿者可提交，部长审核通过任务转为已完成', async ({ page }) => {
    // ---------- 1. 部长发布任务（指派部门默认本人部门：宣传部） ----------
    await loginAs(page, DEPT_HEAD);
    await gotoModule(page, '任务管理');
    await btn(page, '发布任务').click();
    await page.getByPlaceholder('输入任务标题').fill(TASK_TITLE);
    await page.getByPlaceholder('描述任务详情').fill('E2E 冒烟用例创建，用于验证提交与审核闭环。');
    await btn(page, '发布').click();

    await expect(page.getByText('任务发布成功')).toBeVisible();
    await expect(page.getByText(TASK_TITLE)).toBeVisible();

    // ---------- 2. 志愿者提交任务 ----------
    await logout(page, DEPT_HEAD.name);
    await loginAs(page, VOLUNTEER);
    await gotoModule(page, '任务管理');
    await page.getByText(TASK_TITLE).click();

    const detail = page.getByRole('dialog');
    await expect(detail.getByText(DEPT_HEAD.name)).toBeVisible();   // 发布者
    await detail.getByPlaceholder('描述你的完成情况和备注').fill(SUBMIT_NOTE);
    await btn(detail, '提交任务').click();

    await expect(page.getByText('提交成功，等待审核')).toBeVisible();
    // 提交记录出现在详情里，且任务状态转「待审核」
    await expect(detail.getByText(SUBMIT_NOTE)).toBeVisible();
    await expect(detail.getByText('待审核').first()).toBeVisible();
    await btn(detail, '关闭').click();

    // ---------- 3. 部长审核通过 ----------
    await logout(page, VOLUNTEER.name);
    await loginAs(page, DEPT_HEAD);
    await gotoModule(page, '任务管理');
    await page.getByText(TASK_TITLE).click();

    const reviewDetail = page.getByRole('dialog');
    await expect(reviewDetail.getByText(VOLUNTEER.name)).toBeVisible();  // 提交人
    await btn(reviewDetail, '通过').click();
    await confirmPopconfirm(page, '确认通过？', '通过');

    // 提交记录标记「已通过」
    await expect(reviewDetail.getByText('已通过').first()).toBeVisible();

    // 任务状态转「已完成」，且**弹窗内同步刷新**——Phase 1 B5 修掉 ISSUES #9：
    // 弹窗改为按 id 从列表数据取（原先持打开时的快照，列表已更新而弹窗还显示「待审核」）
    await expect(reviewDetail.getByText('已完成').first()).toBeVisible();
    await btn(reviewDetail, '关闭').click();
    const card = page.locator('.ant-card').filter({ hasText: TASK_TITLE });
    await expect(card.getByText('已完成')).toBeVisible();
  });
});
