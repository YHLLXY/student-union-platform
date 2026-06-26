import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { HashRouter } from 'react-router-dom';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import theme from './theme';
import { initErrorReporter } from './diagnostics';

// 初始化诊断系统错误收集器
initErrorReporter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={theme} locale={zhCN}>
      <HashRouter>
        <App />
      </HashRouter>
    </ConfigProvider>
  </StrictMode>,
);
