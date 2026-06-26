// 诊断基础设施层统一入口
// 模块通过 `import { logger, trace } from '../../diagnostics'` 使用

export { logger } from './logger';
export { trace } from './serviceWrapper';
export { initErrorReporter, getRecentErrors } from './errorReporter';
export type { ILogger, IErrorReporter, LogLevel, ModuleTag, LogEntry, DiagConfig } from './types';
export { diagConfig } from './config';
