import type { IErrorReporter, ModuleTag } from './types';
import { diagConfig } from './config';

interface ErrorRecord {
  time: number;
  tag: ModuleTag;
  message: string;
}

// 最多保留最近 50 条，避免内存泄漏
const MAX_ERRORS = 50;
const errorLog: ErrorRecord[] = [];

/** 基础控制台错误收集实现 */
export const consoleErrorReporter: IErrorReporter = {
  report(error: Error, tag: ModuleTag, _context?: Record<string, unknown>) {
    errorLog.push({ time: Date.now(), tag, message: error.message });
    if (errorLog.length > MAX_ERRORS) {
      errorLog.shift();
    }
    // 预留：后期替换为 Sentry.captureException(error, { tags: { module: tag }, extra: context })
  },
};

/** 获取最近错误列表（供调试面板使用，预留） */
export function getRecentErrors(): ErrorRecord[] {
  return [...errorLog];
}

/** 初始化：注入 errorReporter 到全局配置 */
export function initErrorReporter(reporter?: IErrorReporter): void {
  diagConfig.errorReporter = reporter ?? consoleErrorReporter;
}
