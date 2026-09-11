import { test, expect } from './fixtures';
import { resetStub, fillIdentity, logout, gotoModule, btn } from './helpers';

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
    await fillIdentity(page, NEW_MEMBER.name, NEW_MEMBER.studentId, 'EXISTING-USER-PLACEHOLDER');
    await expect(page.getByText(`欢迎回来，${NEW_MEMBER.name}`)).toBeVisible();
    await page.getByPlaceholder('输入密码').fill(NEW_MEMBER.password);
    await btn(page, '登录').click();
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
});
