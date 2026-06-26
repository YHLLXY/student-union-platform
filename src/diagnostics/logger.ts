import { diagConfig } from './config';
import type { ILogger, LogLevel, ModuleTag } from './types';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

/** 判断当前级别是否应该输出 */
function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[diagConfig.level];
}

/** 格式化输出到 console */
function output(level: LogLevel, tag: ModuleTag, message: string, extra?: string): void {
  const prefix = `[${level.toUpperCase()}] [${tag}]`;
  const text = extra ? `${prefix} ${message} ${extra}` : `${prefix} ${message}`;

  switch (level) {
    case 'error':
      console.error(text);
      break;
    case 'warn':
      console.warn(text);
      break;
    case 'info':
      console.info(text);
      break;
    default:
      console.log(text);
      break;
  }
}

/** 创建绑定标签的 logger 实例 */
function createLogger(tag: ModuleTag): ILogger {
  return {
    debug(message, data) {
      if (shouldLog('debug')) {
        output('debug', tag, message, data ? JSON.stringify(data) : undefined);
      }
    },
    info(message, data) {
      if (shouldLog('info')) {
        output('info', tag, message, data ? JSON.stringify(data) : undefined);
      }
    },
    warn(message, data) {
      if (shouldLog('warn')) {
        output('warn', tag, message, data ? JSON.stringify(data) : undefined);
      }
    },
    error(message, err, data) {
      if (shouldLog('error')) {
        const errMsg = err instanceof Error ? err.message : String(err ?? '');
        const extra = data
          ? `{ error: "${errMsg}", ${JSON.stringify(data).slice(1)}`
          : `{ error: "${errMsg}" }`;
        output('error', tag, message, extra);
        // 同时调用 errorReporter（如果已配置）
        if (err instanceof Error) {
          diagConfig.errorReporter?.report(err, tag, data);
        }
      }
    },
    api(method, success, durationMs, data) {
      if (shouldLog('info')) {
        const status = success ? '完成' : '失败';
        const extra = data ? ` ${JSON.stringify(data)}` : '';
        output('info', tag, `${method} ${status} { duration: ${durationMs}ms }`, extra);
      }
    },
  };
}

/** 对外：通过标签获取 logger 实例 */
export const logger = {
  for: createLogger,
};
