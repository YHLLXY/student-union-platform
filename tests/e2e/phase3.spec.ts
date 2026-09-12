import { test, expect } from './fixtures';
import { resetStub, loginAs, logout, gotoModule, btn, dismissOnboarding, stubUpdate } from './helpers';

/**
 * Phase 3（v4.5.0）E2E：
 *   ① A5 论坛互动：点赞 / 收藏 / 我的收藏筛选 / 置顶 / @提及通知链路
 *   ② B2 新人引导：三步走完 → 落库 → 再登录不再出现
 *   ③ B3 个人资料编辑：改名与联系方式落库 + 即时回写（并用新名重新登录验证持久化）
 *
 * 账号都用 stub 种子用户：赵敏（宣传部部长，种子帖 601 属宣传部，有 3 条回复 0 个赞）、
 * 陈主席（被 @ 的对象，种子通知里没有他的记录 → 收到提及后角标恰好是 1，便于断言）。
 */
const ZHAO = { name: '赵敏', studentId: 'XUAN2026', password: 'e2ePass123' };        // 宣传部 部长
const CHEN = { name: '陈主席', studentId: 'PRES2026', password: 'e2ePass123' };      // 主席团
const SUN = { name: '孙晓雨', studentId: 'XUAN1001', password: 'e2ePass123' };       // 宣传部 志愿者

const POST_TITLE = '【协作】迎新晚会宣传物料设计需求对接';

/** 铃铛触发器：图标本身被角标压住，onClick 在父级（同 notification.spec.ts） */
const bellTrigger = (page: import('@playwright/test').Page) =>
  page.locator('header').getByRole('img', { name: 'bell' }).locator('xpath=..');

const postCard = (page: import('@playwright/test').Page) =>
  page.locator('.ant-card').filter({ hasText: POST_TITLE }).first();

test.describe('Phase 3 论坛互动（A5）', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('点赞与收藏：计数即时变化、可取消，「我的收藏」只列本人收藏', async ({ page }) => {
    await loginAs(page, ZHAO);
    await gotoModule(page, '部门论坛');

    const card = postCard(page);
    await expect(card).toBeVisible();
    // 种子帖 601：3 条回复、0 个赞
    await expect(card.getByRole('button', { name: '点赞' })).toContainText('0');

    // ---- 点赞（乐观更新） ----
    await card.getByRole('button', { name: '点赞' }).click();
    await expect(card.getByRole('button', { name: '取消点赞' })).toContainText('1');

    // ---- 收藏后出现在「我的收藏」 ----
    await card.getByRole('button', { name: '收藏' }).click();
    await expect(card.getByRole('button', { name: '取消收藏' })).toBeVisible();
    await page.getByRole('menuitem', { name: '我的收藏' }).click();
    const marked = postCard(page);
    await expect(marked).toBeVisible();
    await expect(marked.getByRole('button', { name: '取消收藏' })).toBeVisible();

    // ---- 在收藏列表里取消收藏：卡片立刻消失并落到空状态 ----
    await marked.getByRole('button', { name: '取消收藏' }).click();
    await expect(page.getByText('还没有收藏的帖子')).toBeVisible();

    // ---- 取消点赞：从 1 回到 0 ----
    await page.getByRole('menuitem', { name: '全部' }).click();
    await expect(postCard(page).getByRole('button', { name: '取消点赞' })).toContainText('1');
    await postCard(page).getByRole('button', { name: '取消点赞' }).click();
    await expect(postCard(page).getByRole('button', { name: '点赞' })).toContainText('0');
  });

  test('详情页置顶 + @提及回复，且被提及者收到通知', async ({ page }) => {
    await loginAs(page, ZHAO);
    await gotoModule(page, '部门论坛');

    // ---- 打开详情并置顶（部门负责人以上才有按钮） ----
    await postCard(page).click();
    const modal = page.locator('.ant-modal').filter({ hasText: POST_TITLE });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: '置顶' }).click();
    await expect(page.getByText('已置顶')).toBeVisible();

    // ---- @提及：输入 @ 弹出成员候选，点选后整段替换为 @姓名 ----
    const replyBox = modal.getByPlaceholder(/输入回复内容/);
    await replyBox.click();
    await replyBox.pressSequentially('请 @陈主');
    const picker = page.getByRole('listbox', { name: '选择要提及的成员' });
    await expect(picker).toBeVisible();
    await picker.getByRole('option', { name: /陈主席/ }).click();
    await expect(replyBox).toHaveValue(/请 @陈主席 /);

    await btn(modal, '发送').click();
    await expect(page.getByText('回复成功')).toBeVisible();
    // 回复正文里的提及以高亮 span 渲染
    await expect(modal.locator('[class*="mention"]').filter({ hasText: '@陈主席' })).toBeVisible();

    // ---- 关闭详情：列表里该帖带上置顶标签并排到最前 ----
    await btn(modal, '关闭').click();
    await expect(modal).toBeHidden();
    const card = postCard(page);
    await expect(card.getByText('置顶')).toBeVisible();

    // ---- 被提及者登录后应收到「有人提到了你」 ----
    await logout(page, ZHAO.name);
    await loginAs(page, CHEN);
    const bell = bellTrigger(page);
    await bell.click();
    const panel = page.locator('.ant-popover').filter({ hasText: '消息通知' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('有人在论坛提到了你')).toBeVisible();
  });
});

test.describe('Phase 3 新人引导（B2）', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('三步走完即落库，之后登录不再出现', async ({ page }) => {
    // 种子账号都是「已引导」（与迁移的存量回填一致），这里把孙晓雨改回未引导来触发
    await stubUpdate('users', 'student_id=eq.XUAN1001', { onboarded: false });
    await loginAs(page, SUN);

    const title = page.getByText('欢迎加入学生会交流平台');
    await expect(title).toBeVisible();

    // 第一步：看使用指南（这里只验证入口按钮就位；指南抽屉本身是既有功能）
    await expect(btn(page, '打开使用指南')).toBeVisible();
    await btn(page, '下一步').click();

    // 第二步：认领第一个任务 → 直达任务页（引导抽屉此时仍开着，可继续走完）
    await expect(page.getByText(/任务管理页会列出分配给你的任务/)).toBeVisible();
    await btn(page, '去任务管理').click();
    await expect(page).toHaveURL(/#\/tasks/);

    // 第三步：完善个人资料 → 直达个人中心
    await btn(page, '下一步').click();
    await expect(page.getByText(/上传头像、补上联系方式/)).toBeVisible();
    await btn(page, '去个人中心').click();
    await expect(page).toHaveURL(/#\/profile/);

    // 完成引导 → 抽屉收起并落库
    await btn(page, '完成引导').click();
    await expect(title).toBeHidden();
    await expect(page.getByText('引导已完成，祝使用愉快！')).toBeVisible();

    // 重新登录（强制重拉档案）后不该再出现
    await logout(page, SUN.name);
    await loginAs(page, SUN);
    await expect(page.locator('header').getByText(SUN.name, { exact: true })).toBeVisible();
    await expect(page.getByText('欢迎加入学生会交流平台')).toBeHidden();
    // 顺带自证：未触发引导时 dismissOnboarding 是空操作，不会掩盖问题
    await dismissOnboarding(page);
  });
});

test.describe('Phase 3 个人资料编辑（B3）', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('改名与联系方式生效、即时回写，且重新登录仍是新名', async ({ page }) => {
    const NEW_NAME = '孙晓雨E2E';
    await loginAs(page, SUN);
    await gotoModule(page, '个人中心');

    await btn(page, '编辑资料').click();
    const modal = page.locator('.ant-modal').filter({ hasText: '编辑资料' });
    await expect(modal).toBeVisible();

    await page.getByPlaceholder('在平台中展示的姓名').fill(NEW_NAME);
    await page.getByPlaceholder('选填，便于同事联系你').fill('13800001111');
    await page.getByPlaceholder('选填', { exact: true }).fill('sun@example.com');
    await btn(modal, '保存').click();

    await expect(page.getByText('资料已更新')).toBeVisible();

    // 即时回写：顶部用户名的头像旁、个人信息卡片都反映新值（AuthUpdateContext）
    await expect(page.locator('header').getByText(NEW_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText('13800001111')).toBeVisible();
    await expect(page.getByText('sun@example.com')).toBeVisible();

    // 持久化：退出后用新名 + 原学号仍能登录（登录的身份步校对的正是 users 里的姓名）
    await logout(page, NEW_NAME);
    await loginAs(page, { ...SUN, name: NEW_NAME });
    await expect(page).toHaveURL(/#\/dashboard/);
  });
});
