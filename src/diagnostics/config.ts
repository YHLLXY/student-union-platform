import type { DiagConfig } from './types';

export const diagConfig: DiagConfig = {
  // 开发模式输出所有级别（debug + info + warn + error），生产模式仅 info 及以上
  level: import.meta.env.DEV ? 'debug' : 'info',
  // 当前仅 console 输出；后期扩展 'remote' 可接入外部服务
  target: 'console',
  // errorReporter 在 errorReporter.ts 初始化时注入
};
