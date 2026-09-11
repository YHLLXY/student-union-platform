import { test as base, expect } from '@playwright/test';

/**
 * E2E 测试基座：在所有用例上装一道**硬防线**。
 *
 * 任何非本地（127.0.0.1 / localhost）请求一律 abort。
 * 即便 vite.e2e.config.ts 的 envDir:false 失效、生产 Supabase 地址漏进 E2E 进程，
 * 生产库也收不到任何读写——最坏结果是用例失败报错，而不是污染真实数据。
 *
 * 前提：playwright.config.ts 里 `serviceWorkers: 'block'`。Playwright 不拦截由
 * Service Worker 处理的请求（本应用的 PWA 会注册 sw.js），不屏蔽 SW 时这道防线会形同虚设。
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', (route) => {
      let host = '';
      try {
        host = new URL(route.request().url()).hostname;
      } catch {
        // 非 http(s) 协议（data:/blob: 等）不经过路由，直接放行
        return route.continue();
      }
      if (host === '127.0.0.1' || host === 'localhost') return route.continue();
      return route.abort('blockedbyclient');
    });
    await use(page);
  },
});

export { expect };
