# Supabase 手写类型 + TanStack Query 数据层实践

> v4.0 迭代调研沉淀 · 2026-09-03
> 场景约束：无法访问 Supabase CLI / 无法 `supabase gen types`（数据库在云端，本地只有迁移 SQL），且 React 19 + supabase-js 2.108。

## 一、手写 Database 类型（不跑 CLI 也拿到端到端类型）

### 类型结构约定

supabase-js v2 的 `createClient<Database>()` 对 Database 的形状要求（源码 `GenericSchema`）：

```ts
interface Database {
  public: {
    Tables: {
      [name]: {
        Row: {};      // SELECT 返回形状
        Insert: {};   // INSERT 允许形状（有默认值的列应为可选）
        Update: {};   // UPDATE 允许形状（全部可选，可空列允许 | null）
        Relationships: Relationship[];  // ★ 外键声明，缺了嵌套 select 无法推断
      };
    };
    Views / Functions / Enums / CompositeTypes: ...;
  };
}
```

要点（本项目全部踩过）：

1. **JSONB 列不要写 `Json`**：按业务实际结构收敛（如 `attachments: AttachmentMeta[]`），否则 unknown 渗透到服务层。Update 类型中可空 JSONB/数组列要补 `| null`（SQL 无 NOT NULL 的列 UPDATE 可置 null）。
2. **Relationships 必须是字面量类型**：泛型助手要保住字面量，`ReturnType<typeof fn>` 会退化成 `string` 导致推断失效：

```ts
type Rel<F extends string, C extends [string, ...string[]], R extends string> = {
  foreignKeyName: F; columns: C; isOneToOne: false;
  referencedRelation: R; referencedColumns: ['id'];
};
type FkUsers<C extends [string, ...string[]], F extends string> = Rel<F, C, 'users'>;
// 用法：Relationships: [FkUsers<['created_by'], 'tasks_created_by_fkey'>, ...]
```

3. **迁移 SQL 是唯一事实来源**，但线上库可能超前于迁移脚本（本项目 `invite_codes.created_by` 就是线上有、脚本无——以代码中实际读写的列为准补录）。

### 双外键嵌入的解析（大坑）

一张表有两个外键指向 users（如 tasks 的 created_by + assigned_to）时，嵌套 select 类型解析规则（用 emitDeclarationOnly 探针实测确认）：

| 写法 | 类型解析 | 运行时 |
|---|---|---|
| `creator:created_by(name)` | ❌ SelectQueryError<"more than one relationship…"> | ✅ 正常 |
| `assignee:assigned_to!tasks_assigned_to_fkey(name)`（FK 名提示） | ❌ 行类型被丢弃 | — |
| **`creator:users!created_by(name)`（表名+列名提示）** | ✅ | ✅ |

**结论：双外键表一律写 `别名:目标表!列名(字段)`**。单外键表（notices/forum_posts 等）可以继续用列名直写。探针方法：临时 tsconfig `emitDeclarationOnly` 输出 .d.ts 直接看推断结果，比猜快。

## 二、服务层错误约定：失败即抛

v3 的服务层「吞错返回 []/null/false」导致调用方无法区分空数据与失败，页面静默渲染空列表。v4 统一为 `src/lib/sb.ts`：

```ts
// 读函数：失败 → logger 记录 + 抛 SbError（调用方 isError/catch 接住）
export async function unwrap<R extends { data: unknown; error: PgErrorLike | null }>(
  label: string, p: PromiseLike<R>,
): Promise<NonNullable<R['data']>>

export async function unwrapMaybe<R>(...): Promise<R['data'] | null>  // maybeSingle 用
export async function unwrapCount(label, p): Promise<number>          // head 计数用
```

分层约定（重要，防止一刀切）：

| 场景 | 约定 |
|---|---|
| 路由级读数据 | 必须走 unwrap + useQuery（isError → 错误态 + 重试） |
| 弹窗内临时数据 | 可命令式拉取，但**必须 `.catch` 暴露错误**（message.error） |
| 写操作（create/update/delete） | 保持返回布尔/null 的既有 UX（message 驱动），不强制抛 |
| 聚合搜索（globalSearch） | 允许单源静默降级——搜索场景一个源挂了不该杀死全部结果 |
| 通知徽标（AppLayout） | `throwOnError: false` 的环境提示，静默保持上次值 |

## 三、TanStack Query 迁移模式（React 19）

### 全局默认刻意保守

```ts
new QueryClient({ defaultOptions: { queries: {
  staleTime: 30_000,      // 30s 内重复挂载直接吃缓存（返回/前进秒开）
  gcTime: 5 * 60_000,
  retry: 1,               // 网络抖动自动重试一次
  refetchOnWindowFocus: false,  // 贴近 v3「挂载时拉一次」的行为，缩小回归面
} } })
```

迁移决策：默认配置越贴近旧行为，逐页迁移的回归面越小；UX 增益来自缓存与错误态而非激进的重取策略。

### 各场景映射

| v3 模式 | v4 模式 |
|---|---|
| `useEffect` + `useState` + skeleton | `useQuery({ queryKey, queryFn })`，`isPending` → 骨架屏，`isError` → 重试 |
| `loadXxx()` 手动刷新 | `queryClient.invalidateQueries({ queryKey })` |
| Realtime 订阅回调里 loadData | 订阅回调里 `invalidateQueries`（单一事实源是缓存） |
| 乐观更新（看板拖拽/通知已读） | `queryClient.setQueryData` 直写缓存，失败再 invalidate 回滚 |
| 弹窗按需拉取 | `useQuery({ enabled: open })`（Dashboard 待审核弹窗） |
| 权限守卫后才拉取 | `useQuery({ enabled: canView })`（排行榜） |
| 年/月切换 | queryKey 带 `[year, month]`，回看历史月份命中缓存秒开 |

### 包体积

`@tanstack/react-query` v5 全量约 13KB gzip（tree-shaking 后更小），在 400KB+ 的首盘里可忽略。v5 与 React 19 完全兼容。

## 四、顺手修掉的真 bug

1. **fetchUserStats 恒为 0**：`select('id', { count:'exact', head:true })` 的响应 `data` 是 `[]`（head 模式无行），原代码取 `data?.length ?? 0` 永远是 0——必须用 `count` 字段（unwrapCount 封装）。
2. **会话过期僵尸页**：App 根部挂 `supabase.auth.onAuthStateChange`，`SIGNED_OUT` 时清空用户态 + `queryClient.clear()`。

## 参考来源

- [supabase-js TypeScript 支持（Database 泛型）](https://supabase.com/docs/reference/javascript/typescript-support)
- [supabase-js v2 源码类型（SelectQueryError / Relationships 推断）](https://github.com/supabase/postgrest-js/blob/master/src/types.ts)
- [TanStack Query — Queries / Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/queries)
- [TanStack Query — Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [TanStack Query — Invalidations 与 Realtime 联动](https://tanstack.com/query/latest/docs/framework/react/guides/filters)
- [Supabase 官方示例 slack-clone（RQ + Realtime 模式参考）](https://github.com/supabase-community/slack-clone)
