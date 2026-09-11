import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 测试专用配置：不加载 .env（避免误连生产库），统一指向 vitest globalSetup 拉起的本地 stub。
// tests/setup.ts 里有硬守卫：URL 不是本地 stub 直接抛错，绝不写生产数据。
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['scripts/vitest-global-setup.mjs'],
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:9911',
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
    },
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
