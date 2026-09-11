import { test, expect } from './fixtures';
import { resetStub, fillIdentity, loginAs, logout, gotoModule, btn } from './helpers';

/**
 * E2E 冒烟① 注册 → 登录 → 改密
 *
 * 覆盖走查发现的核心链路上最容易断的一环：邀请码注册 → 落库 → 重新登录 → 改密。
 * 学号刻意避开 dev-stub 种子数据，保证「全新用户」语义。
 */
const NEW_MEMBER = {
  name: '钱多多',
  studentId: 'E2E20260001',
  password: 'e2ePass123',
  newPassword: 'e2eNew456',
};

test.describe('冒烟① 注册 → 登录 → 改密', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('新成员凭邀请码注册后可重新登录并成功改密', async ({ page }) => {
    // ---------- 1. 注册：身份步（体育部志愿者邀请码 TIYU_VOL） ----------
    await page.goto('/');
    await fillIdentity(page, NEW_MEMBER.name, NEW_MEMBER.studentId, 'TIYU_VOL');

    await expect(page.getByText('首次登录，请设置密码')).toBeVisible();
    await page.getByPlaceholder('设置密码（至少 8 位，含字母+数字）').fill(NEW_MEMBER.password);
    await page.getByPlaceholder('确认密码').fill(NEW_MEMBER.password);
    await btn(page, '注册并登录').click();

    // 注册即登录 → 工作台，且顶部显示本人姓名
    await expect(page).toHaveURL(/#\/dashboard/);
    await expect(page.locator('header').getByText(NEW_MEMBER.name, { exact: true })).toBeVisible();

    // ---------- 2. 退出后用同一账号重新登录（已注册用户跳过邀请码校验） ----------
    await logout(page, NEW_MEMBER.name);
    await loginAs(page, NEW_MEMBER);
    await expect(page).toHaveURL(/#\/dashboard/);

    // ---------- 3. 个人中心改密 ----------
    await gotoModule(page, '个人中心');
    await btn(page, '修改密码').click();
    await page.getByPlaceholder('新密码（至少 6 位）').fill(NEW_MEMBER.newPassword);
    await page.getByPlaceholder('再次输入新密码').fill(NEW_MEMBER.newPassword);
    await btn(page, '确认修改').click();

    // 提示出现 + 弹窗关闭即为提交成功
    // （stub 的 auth 不校验密码，故「新密码能否登录」无法在此判别真实性）
    await expect(page.getByText('密码修改成功').first()).toBeVisible();
    await expect(btn(page, '确认修改')).toBeHidden();
  });

  // ---------- B1：学号即查决定要不要邀请码栏 ----------
  test('未注册学号仍然要求邀请码（B1 的反向保障）', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('姓名').fill('新同学');
    await page.getByPlaceholder('学号').fill('BRANDNEW2026');

    // 等即查防抖（500ms）跑完再断言「没有」——断言缺席只能是等一段时间；
    // 这里等的意义是：若实现把邀请码栏一刀切隐藏，这条会红。
    await page.waitForTimeout(1200);
    await expect(page.getByText(/已注册，无需邀请码/)).toHaveCount(0);
    await expect(page.getByPlaceholder('部门邀请码')).toBeVisible();

    // 未注册路径仍能走通：填有效邀请码 → 进入设密步
    await page.getByPlaceholder('部门邀请码').fill('TIYU_VOL');
    await btn(page, '继续').click();
    await expect(page.getByText('首次登录，请设置密码')).toBeVisible();
  });
});
