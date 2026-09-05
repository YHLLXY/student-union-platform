import { QueryClient } from '@tanstack/react-query';

/**
 * 全局数据层客户端。
 * 策略刻意贴近 v3 的行为（挂载时拉取、失败静默上报）以降低迁移回归面：
 *   - staleTime 30s：30 秒内重复挂载直接复用缓存（返回/前进后退不再白屏转圈）
 *   - refetchOnWindowFocus false：切回窗口不闪刷新
 *   - retry 1：网络抖动自动重试一次，仍失败交给页面错误态
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
