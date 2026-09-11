/**
 * 全局测试守卫：所有 Service 单测必须只打本地 stub。
 * 若 vitest 配置失效（如误加载 .env 的生产 URL），在这里直接炸掉，绝不向生产库写测试数据。
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? '';

if (!/^http:\/\/(127\.0\.0\.1|localhost):99\d\d\/?$/.test(url)) {
  throw new Error(
    `[tests/setup] 危险：测试进程的 VITE_SUPABASE_URL 不是本地 stub（当前为 "${url}"）。` +
    '已中止全部测试以保护生产数据库。请检查 vitest.config.ts 的 test.env。',
  );
}
