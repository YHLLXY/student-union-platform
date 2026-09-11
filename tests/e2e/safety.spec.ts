import { test, expect } from './fixtures';
import { resetStub } from './helpers';

/**
 * 测试基建自身的护栏用例。
 *
 * fixtures.ts 里那道「非本地请求一律 abort」的防线是 E2E 不误伤生产库的最后保障，
 * 一旦被削弱（比如有人换掉 page.route），这里会立刻变红——否则这种事故只有等到
 * 真实数据库被写脏才会暴露。
 */
test.describe('E2E 测试隔离', () => {
  test.beforeEach(async () => {
    await resetStub();
  });

  test('非本地请求被拦截，生产库不会被 E2E 触及', async ({ page }) => {
    const isLocal = (url: string) => /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
    const responses: string[] = [];
    page.on('response', (r) => { if (!isLocal(r.url())) responses.push(r.url()); });

    await page.goto('/');
    const outcome = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/', { mode: 'no-cors' });
        return 'reached';
      } catch {
        return 'blocked';
      }
    });

    expect(
      outcome,
      '外网请求未被拦截——检查 fixtures.ts 的本地白名单与 playwright.config.ts 的 serviceWorkers:block',
    ).toBe('blocked');
    expect(responses, `以下非本地请求竟拿到了响应：${responses.join(', ')}`).toHaveLength(0);
  });

  test('stub 的 /__reset 能恢复种子数据（用例可重复运行的前提）', async ({ page }) => {
    await page.goto('/');
    // 直接向 stub 插入一行，再 reset，确认数据回到种子状态
    const insert = await fetch('http://127.0.0.1:9913/rest/v1/school_notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ title: 'E2E 临时数据', content: '用例结束后应被 reset 清除' }),
    });
    expect(insert.ok).toBe(true);

    await resetStub();

    const res = await fetch('http://127.0.0.1:9913/rest/v1/school_notices?title=eq.E2E%20临时数据');
    const rows = (await res.json()) as unknown[];
    expect(rows, 'reset 后临时数据应已消失').toHaveLength(0);
  });
});
