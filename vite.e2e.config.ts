import type { UserConfig } from 'vite';
import base from './vite.config';

/**
 * E2E 专用 Vite 配置：继承主配置，但彻底关闭 .env 文件的加载（envDir: false）。
 *
 * 为什么必须这么做：根目录 .env 里是**生产** Supabase 的 URL/anon key，而 Vite 默认会加载它。
 * E2E 只允许连本地 stub，所以这里让 .env 根本不参与解析，Supabase 地址只能来自
 * playwright.config.ts 里 webServer.env 注入的进程环境变量（loadEnv 对 VITE_* 前缀的
 * process.env 取值优先级高于 .env，双重保险）。
 */
export default {
  ...base,
  envDir: false,
} as UserConfig;
