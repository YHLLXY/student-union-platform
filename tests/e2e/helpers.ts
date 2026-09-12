import { expect, type Locator, type Page } from '@playwright/test';

/**
 * E2E 公共操作封装。
 *
 * 端口常量与 playwright.config.ts 保持一致（9913 = E2E 专用 stub，
 * 与开发 9999 / 单测 9911 隔离）。
 */
export const STUB_ORIGIN = 'http://127.0.0.1:9913';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 按中文文案定位按钮。
 *
 * 需要兼容 antd 的两处渲染细节：
 *   1. 「恰好两个汉字」的按钮会被自动插入一个空格（继续 → "继 续"、发布 → "发 布"）；
 *   2. 带图标的按钮，其可访问名会带上图标名（`lock 修改密码`、`plus 发布任务`）。
 * 因此用「允许前导图标名 + 允许字间空白」的正则匹配。
 */
export function btn(scope: Page | Locator, label: string): Locator {
  const chars = [...label].map(escapeRegExp).join('\\s*');
  const pattern = new RegExp(`^(?:[a-z][a-z-]*\\s+)*${chars}$`);
  return scope.getByRole('button', { name: pattern });
}

/** 恢复 stub 种子数据。每个用例开头调用，保证用例之间互不污染（也保证可重复运行）。 */
export async function resetStub(): Promise<void> {
  const res = await fetch(`${STUB_ORIGIN}/__reset`, { method: 'POST' });
  expect(res.ok, `stub /__reset 调用失败（${res.status}）——dev-stub 需支持该端点`).toBeTruthy();
}

/** 直接向 stub 写数据（走 PostgREST 插入接口，与前端同一条路径） */
export async function stubInsert(table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${STUB_ORIGIN}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  expect(res.ok, `stub 插入 ${table} 失败（${res.status}）`).toBeTruthy();
  const data = (await res.json()) as Record<string, unknown>[];
  return data[0];
}

/** 批量写入（一次请求多行）——用于造分页 / 聚合这类需要十几条以上的场景 */
export async function stubBulkInsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  const res = await fetch(`${STUB_ORIGIN}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  expect(res.ok, `stub 批量插入 ${table} 失败（${res.status}）`).toBeTruthy();
}

/**
 * 直接改 stub 里的数据（走 PostgREST 的 PATCH 接口，与前端同一条路径）。
 * filter 用 PostgREST 语法，如 `student_id=eq.XUAN1001`。
 */
export async function stubUpdate(
  table: string,
  filter: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${STUB_ORIGIN}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  expect(res.ok, `stub 更新 ${table} 失败（${res.status}）`).toBeTruthy();
}

/**
 * 关掉新人引导（若它正弹着）。
 *
 * 第十九部分起 users.onboarded 默认为 false，**注册流程新建的账号**一登录就会看到引导，
 * 而它带全屏遮罩 —— 不关掉，后续任何点击都会落在遮罩上。
 * 种子里已有的账号都是 onboarded = true（与迁移里的存量回填口径一致），不受影响。
 */
export async function dismissOnboarding(page: Page): Promise<void> {
  const title = page.getByText('欢迎加入学生会交流平台');
  if (!(await title.isVisible().catch(() => false))) return;
  await btn(page, '跳过引导').click();
  await expect(title).toBeHidden();
}

/** 身份步（注册：未注册学号 + 邀请码） */
export async function fillIdentity(
  page: Page,
  name: string,
  studentId: string,
  inviteCode: string,
): Promise<void> {
  await page.getByPlaceholder('姓名').fill(name);
  await page.getByPlaceholder('学号').fill(studentId);
  await page.getByPlaceholder('部门邀请码').fill(inviteCode);
  await btn(page, '继续').click();
}

/**
 * 走真实 UI 登录（已注册用户）。
 *
 * Phase 1 B1 起，身份步会 debounce 即查学号：命中已注册即隐藏邀请码栏、
 * 按钮变「下一步：输入密码」。因此这里的等待条件是「已注册」提示出现——
 * 它同时证明了即查链路真的跑通了（而不是碰巧没被拦）。
 */
export async function loginAs(
  page: Page,
  user: { name: string; studentId: string; password: string },
  opts?: { mobile?: boolean },
): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder('姓名').fill(user.name);
  await page.getByPlaceholder('学号').fill(user.studentId);
  await expect(page.getByText(/已注册，无需邀请码/)).toBeVisible();
  await expect(page.getByPlaceholder('部门邀请码')).toHaveCount(0);
  await btn(page, '下一步：输入密码').click();
  await expect(page.getByText(`欢迎回来，${user.name}`)).toBeVisible();
  await page.getByPlaceholder('输入密码').fill(user.password);
  await btn(page, '登录').click();
  await expect(page).toHaveURL(/#\/dashboard/);
  // 侧边栏菜单只在桌面（md≥768）渲染；移动端它是收起的 Drawer，菜单项不在 DOM。
  // 移动模式下改由调用方断言页面级锚点（如工作台的「最近动态」）确认就绪。
  if (!opts?.mobile) {
    await expect(page.getByRole('menuitem', { name: '任务管理' })).toBeVisible();
  }
}

/** 退出登录（顶部用户下拉 → 退出登录，会整页 reload 回登录页） */
export async function logout(page: Page, userName: string): Promise<void> {
  await page.locator('header').getByText(userName, { exact: true }).click();
  await page.getByText('退出登录').click();
  await expect(page.getByPlaceholder('姓名')).toBeVisible();
}

/** 通过侧边栏菜单切换模块（不整页刷新，走真实 react-router 导航） */
export async function gotoModule(page: Page, label: string): Promise<void> {
  await page.getByRole('menuitem', { name: label }).click();
}

/**
 * 给 antd DatePicker（showTime）填值：打开面板 → 键盘输入 → 失焦提交。
 *
 * 刻意不按 Enter：输入框在 antd Form 里回车会触发表单隐式提交（发布按钮 htmlType=submit），
 * 弹窗会在点击「发布」之前就关闭，导致点击悬空超时。失焦同样会提交解析结果。
 */
export async function setDateTimePicker(page: Page, placeholder: string, value: string): Promise<void> {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(value);
  await input.evaluate((el) => (el as HTMLInputElement).blur());
  await expect(input).toHaveValue(value);
}

/** 点击 Popconfirm 的确认按钮（作用域限定在弹出层内，避免误点触发按钮） */
export async function confirmPopconfirm(page: Page, title: string, okText: string): Promise<void> {
  const pop = page.locator('.ant-popover').filter({ hasText: title });
  await expect(pop).toBeVisible();
  await btn(pop, okText).click();
}
