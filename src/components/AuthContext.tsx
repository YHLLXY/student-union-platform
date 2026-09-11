import { createContext, useContext } from 'react';
import type { UserProfile } from '@/modules/auth';

export const AuthContext = createContext<UserProfile | null>(null);

export function useAuth(): UserProfile {
  const user = useContext(AuthContext);
  if (!user) throw new Error('useAuth must be used within authenticated app');
  return user;
}

/**
 * 资料变更回写通道（v4.5.0 引入）。
 *
 * 动机：AuthContext 原来只发不发——用户改了显示名/头像后，内存里的 user 仍是旧值，
 * 顶部头像与「个人信息」卡片要等下次刷新才更新。这里给壳层一个受控的写法入口。
 *
 * 默认值是空函数而不是 null：测试里只挂 AuthContext.Provider 的场景不必再包一层，
 * 也不会在「忘了提供」时抛错——资料回写失败不该把界面搞崩。
 */
export const AuthUpdateContext = createContext<(patch: Partial<UserProfile>) => void>(() => {});

export function useAuthUpdate(): (patch: Partial<UserProfile>) => void {
  return useContext(AuthUpdateContext);
}
