import { logger } from '@/diagnostics';

const log = logger.for('lib/sb');

/** PostgREST 错误形状（避免直接依赖 postgrest-js 内部类型） */
export interface PgErrorLike {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** 服务层查询错误：携带操作标签与 PostgREST 上下文，供上层 isError / catch 统一处理 */
export class SbError extends Error {
  readonly label: string;
  readonly pgCode: string | undefined;
  readonly pgDetails: string | null | undefined;
  readonly pgHint: string | null | undefined;

  constructor(label: string, cause: PgErrorLike) {
    super(`[${label}] ${cause.message}`);
    this.name = 'SbError';
    this.label = label;
    this.pgCode = cause.code;
    this.pgDetails = cause.details;
    this.pgHint = cause.hint;
  }
}

function throwSb(label: string, error: PgErrorLike): never {
  log.error(`${label} 查询失败`, new SbError(label, error));
  throw new SbError(label, error);
}

/**
 * 服务层读函数统一约定（v4 起）：
 *   - 查询失败 → 记录日志 + 抛出 SbError（TanStack Query isError / 调用方 catch 接住）
 *   - 不再返回 [] / null 伪装成功，杜绝「失败静默渲染空列表」
 * 写函数（create/update/delete）保持返回布尔/null 的既有 UX，不在此列。
 */

/**
 * 列表 / single 查询解包。
 * 行类型从 PostgrestBuilder 的 then 解析结果自动推导（R = PostgrestSingleResponse<Rows>），
 * single 未命中行会以错误返回，故无错误时 data 必非 null，NonNullable 安全。
 */
export async function unwrap<R extends { data: unknown; error: PgErrorLike | null }>(
  label: string,
  p: PromiseLike<R>,
): Promise<NonNullable<R['data']>> {
  const { data, error } = await p;
  if (error) throwSb(label, error);
  if (data === null || data === undefined) throw new SbError(label, { message: '查询返回空数据' });
  return data as NonNullable<R['data']>;
}

/** maybeSingle 查询解包：无匹配行时合法返回 null */
export async function unwrapMaybe<R extends { data: unknown; error: PgErrorLike | null }>(
  label: string,
  p: PromiseLike<R>,
): Promise<R['data']> {
  const { data, error } = await p;
  if (error) throwSb(label, error);
  return data;
}

/** count 查询解包：失败抛 SbError，成功返回 count ?? 0 */
export async function unwrapCount(
  label: string,
  p: PromiseLike<unknown>,
): Promise<number> {
  const { count, error } = await p as { count: number | null; error: PgErrorLike | null };
  if (error) throwSb(label, error);
  return count ?? 0;
}
