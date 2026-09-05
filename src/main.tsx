import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { buildTheme } from './theme';
import { ThemeModeProvider, useThemeMode } from './theme/ThemeModeProvider';
import { queryClient } from './lib/queryClient';
import { initErrorReporter } from './diagnostics';
import '@/styles/variables.css';
import '@/styles/base.css';
import '@/styles/animations.css';

// 初始化诊断系统错误收集器
initErrorReporter();

/** 桥接主题模式 → antd ConfigProvider */
function ThemedApp() {
  const { resolvedDark } = useThemeMode();
  return (
    <ConfigProvider theme={buildTheme(resolvedDark)} locale={zhCN}>
      <HashRouter>
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </HashRouter>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 动效基建：strict 模式强制全项目用 m 组件（体积优化，见 docs/research/01）；
        reducedMotion="user" 自动尊重系统「减弱动态效果」设置 */}
    <LazyMotion features={domAnimation} strict>
      <ThemeModeProvider>
        <QueryClientProvider client={queryClient}>
          <ThemedApp />
        </QueryClientProvider>
      </ThemeModeProvider>
    </LazyMotion>
  </StrictMode>,
);
