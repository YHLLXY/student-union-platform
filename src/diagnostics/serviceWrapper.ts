import { logger } from './logger';
import type { ModuleTag } from './types';

/**
 * 包装单个 async 函数，自动追踪耗时和结果。
 * 不改原函数签名，返回值和异常照常传递。
 * 不做重试（重试属于 service 自身职责）。
 */
export function trace<T extends (...args: any[]) => Promise<any>>(
  tag: ModuleTag,
  methodName: string,
  fn: T,
): T {
  const log = logger.for(tag);
  return (async (...args: any[]) => {
    const start = performance.now();
    try {
      const result = await fn(...args);
      log.api(methodName, true, Math.round(performance.now() - start));
      return result;
    } catch (err) {
      log.api(methodName, false, Math.round(performance.now() - start));
      log.error(`${methodName} 执行失败`, err);
      throw err; // 原样抛出，不吞错误
    }
  }) as T;
}
