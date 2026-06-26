// 日志级别
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 模块标签格式：模块名/文件名
// 示例：'tasks/TaskForm' | 'tasks/taskService' | 'auth/LoginPage'
export type ModuleTag = string;

// 单条日志结构
export interface LogEntry {
  timestamp: number;        // Date.now()
  level: LogLevel;
  tag: ModuleTag;
  message: string;
  data?: Record<string, unknown>;
}

// 错误报告接口（预留外部监控接入，如 Sentry）
export interface IErrorReporter {
  report(error: Error, tag: ModuleTag, context?: Record<string, unknown>): void;
}

// Logger 实例接口（预留替换实现）
export interface ILogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  api(method: string, success: boolean, durationMs: number, data?: Record<string, unknown>): void;
}

// 诊断系统配置
export interface DiagConfig {
  level: LogLevel;
  target: 'console' | 'remote';
  errorReporter?: IErrorReporter;
}
