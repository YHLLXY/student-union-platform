import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 冒烟配置（Phase 0 测试护栏）
 *
 * 架构：Playwright 同时拉起两个本地进程——
 *   1. dev-stub（9913）：Supabase 桩，E2E 的唯一数据出口；
 *   2. Vite dev server（4173，vite.e2e.config.ts）：envDir:false，不加载指向生产的 .env。
 * 端口与开发用（9999 桩 / 5173 站点）、单测用（9911 桩）全部分开，互不干扰。
 */
export const STUB_PORT = 9913;
export const WEB_PORT = 4173;
export const STUB_ORIGIN = `http://127.0.0.1:${STUB_PORT}`;
export const BASE_URL = `http://127.0.0.1:${WEB_PORT}/student-union-platform/`;

export default defineConfig({
  testDir: './tests/e2e',
  // stub 是单进程可变状态，用例必须串行（用例内各自 /__reset 恢复种子）
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    // 应用会注册 PWA service worker，而 Playwright 不拦截由 SW 处理的请求——
    // 不屏蔽 SW，fixtures.ts 那道「非本地一律 abort」的防线会形同虚设，
    // 且 SW 缓存会给 E2E 带来资源陈旧的假象。E2E 只验证逻辑，不需要离线能力。
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      // channel:'chromium' = 用完整 Chromium 跑 headless（新版 headless 模式），
      // 而不是另下一份 chromium-headless-shell，少一个下载依赖、渲染也更接近真实浏览器
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'node scripts/dev-stub.mjs',
      env: { STUB_PORT: String(STUB_PORT) },
      url: `${STUB_ORIGIN}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // --host 127.0.0.1：Vite 默认只绑 ::1（IPv6 localhost），不显式指定的话
      // baseURL 用的 127.0.0.1 会直接连不上
      // --strictPort：端口被占用直接失败，避免 Playwright 连到非 E2E 实例而 baseURL 失配
      command: `npx vite --config vite.e2e.config.ts --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      env: {
        VITE_SUPABASE_URL: STUB_ORIGIN,
        VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
      },
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
