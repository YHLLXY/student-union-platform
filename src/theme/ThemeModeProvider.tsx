import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/* === 主题模式提供者 ===
   light / dark / system 三态，localStorage 持久化；
   system 跟随 prefers-color-scheme 并实时响应系统切换；
   <html data-theme> 同步供 CSS 变量覆盖（variables.css [data-theme='dark']），
   index.html 头部内联脚本先行设置以避免首帧闪烁 */

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeModeContextValue {
  mode: ThemeMode;
  /** 实际解析出的明暗（system 展开后的结果） */
  resolvedDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: 'system',
  resolvedDark: false,
  setMode: () => {},
});

const STORAGE_KEY = 'theme-mode';

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDocumentTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // 跟随系统切换
  useEffect(() => {
    if (!matchMedia) return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedDark = mode === 'dark' || (mode === 'system' && systemDark);

  useEffect(() => {
    applyDocumentTheme(resolvedDark);
  }, [resolvedDark]);

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      mode,
      resolvedDark,
      setMode: (next) => {
        setModeState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* 存储不可用时仅本次会话生效 */
        }
      },
    }),
    [mode, resolvedDark],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  return useContext(ThemeModeContext);
}
