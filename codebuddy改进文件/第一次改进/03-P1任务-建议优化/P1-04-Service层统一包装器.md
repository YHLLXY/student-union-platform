# P1-04 — Service 层统一包装器

## 📋 任务元信息

| 项 | 值 |
|----|----|
| 优先级 | 🟡 P1 建议优化（可跳过） |
| 预估工时 | 0.5 天 |
| 依赖任务 | 无（但建议在 P1-01 之后做，避免文件状态混乱） |
| 涉及文件 | 新建 `src/utils/safeQuery.ts`、所有 `*Service.ts` 文件 |
| 风险等级 | 中（影响面广，但纯重构不影响功能） |
| 需要数据库迁移 | ❌ 否 |

---

## 🎯 任务背景

**问题：** postgrest-js 返回 `PromiseLike` 不是标准 `Promise`，不能用 `.catch()`。每个 service 函数都要手动解构 `{ data, error }` + `if (error) log.error(...)` + 返回默认值，重复代码多。

**当前模式（每个函数都这样写）：**
```typescript
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from('tasks').select('*');
  if (error || !data) { log.error('fetchTasks 查询失败', error); return []; }
  return data as Task[];
}
```

**目标模式：**
```typescript
export async function fetchTasks(): Promise<Task[]> {
  return safeQueryList(() => supabase.from('tasks').select('*'), 'fetchTasks');
}
```

## ✅ 完成目标

1. 新建 `src/utils/safeQuery.ts`，提供 `safeQuery` / `safeQueryList` / `safeQuerySingle` 三个包装器。
2. 改造所有 service 文件使用包装器（可选，不强制全部改）。
3. 减少重复代码，统一错误处理。

---

## 🚧 硬约束（违反即返工）

1. **包装器只做错误处理和默认值返回，不改查询逻辑**。
2. **不破坏现有函数签名**。
3. **不强制改造所有 service**（先改 3-4 个高频 service 验证，稳定后再推广）。
4. **包装器要支持 postgrest-js 的 PromiseLike**（不能用 `.catch()`）。
5. 保留 `log.error` 调用。

---

## 📂 需要阅读的上下文文件

| 文件 | 用途 |
|------|------|
| `src/modules/tickets/ticketService.ts` | 参考现有错误处理模式 |
| `src/modules/auth/authService.ts` | 参考现有错误处理模式 |
| 任意其他 service 文件 | 确认模式一致 |

---

## 🔧 执行步骤

1. 新建 `src/utils/safeQuery.ts`。
2. 选 1-2 个 service（如 `ticketService.ts`）试点改造。
3. build + 测试。
4. 稳定后推广到其他 service（可分批做，不要求一次全改）。

---

## 💬 喂给 DeepSeek 的 Prompt

````markdown
# 任务：Service 层统一包装器

## 角色与上下文

你是资深前端工程师，维护一个 React 19 + TypeScript + Supabase 的学生会平台。
所有 service 函数都重复写 `{ data, error } = await ...; if (error) log.error(...); return 默认值`，需抽取统一包装器。

## 任务目标

1. 新建 `src/utils/safeQuery.ts`，提供三个包装器。
2. 改造 `ticketService.ts` 作为试点（其他 service 暂不改）。

## 硬约束（违反即返工）

1. 只新建 `src/utils/safeQuery.ts` + 改 `src/modules/tickets/ticketService.ts`。
2. 不破坏现有函数签名。
3. 包装器支持 postgrest-js 的 PromiseLike（不能用 .catch()）。
4. 保留 log.error 调用。
5. 不改查询逻辑（只包错误处理）。

## 输入：当前代码

### 文件 1：src/modules/tickets/ticketService.ts（完整）

【把 ticketService.ts 完整内容粘贴到这里】

## 输出要求

### 1. 修改的文件清单
- 新建 `src/utils/safeQuery.ts`
- 修改 `src/modules/tickets/ticketService.ts`（试点）

### 2. safeQuery.ts 实现

```typescript
import { logger } from '../diagnostics';

const log = logger.for('utils/safeQuery');

/** postgrest-js 查询结果类型 */
interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * 包装 Supabase 查询：返回单个对象或 null
 * 适用：.single() / .maybeSingle() 查询
 */
export async function safeQuery<T>(
  fn: () => PromiseLike<QueryResult<T>>,
  context: string,
): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) {
      log.error(`${context} 查询失败`, error);
      return null;
    }
    return data;
  } catch (err) {
    log.error(`${context} 异常`, err);
    return null;
  }
}

/**
 * 包装 Supabase 查询：返回数组
 * 适用：列表查询（无 .single()）
 */
export async function safeQueryList<T>(
  fn: () => PromiseLike<QueryResult<T[]>>,
  context: string,
): Promise<T[]> {
  try {
    const { data, error } = await fn();
    if (error || !data) {
      log.error(`${context} 查询失败`, error);
      return [];
    }
    return data;
  } catch (err) {
    log.error(`${context} 异常`, err);
    return [];
  }
}

/**
 * 包装 Supabase 写入操作：返回是否成功
 * 适用：insert / update / delete
 */
export async function safeExecute(
  fn: () => PromiseLike<QueryResult<unknown>>,
  context: string,
): Promise<boolean> {
  try {
    const { error } = await fn();
    if (error) {
      log.error(`${context} 执行失败`, error);
      return false;
    }
    return true;
  } catch (err) {
    log.error(`${context} 异常`, err);
    return false;
  }
}
```

### 3. ticketService.ts 改造示例

改造前：
```typescript
export async function fetchMyTickets(userId: string): Promise<MyTicket[]> {
  const { data, error } = await supabase
    .from('ticket_records')
    .select('*, ticket:ticket_id(title, event_time)')
    .eq('user_id', userId)
    .order('grabbed_at', { ascending: false });

  if (error || !data) { log.error('fetchMyTickets 查询失败', error); return []; }

  return data.map((r: Record<string, unknown>) => { ... });
}
```

改造后：
```typescript
export async function fetchMyTickets(userId: string): Promise<MyTicket[]> {
  const data = await safeQueryList(
    () => supabase
      .from('ticket_records')
      .select('*, ticket:ticket_id(title, event_time)')
      .eq('user_id', userId)
      .order('grabbed_at', { ascending: false }),
    'fetchMyTickets',
  );

  return data.map((r: Record<string, unknown>) => {
    const ticket = r.ticket as { title: string; event_time: string } | null;
    return {
      id: r.id as string,
      // ... 其余字段
    };
  });
}
```

**注意：** `grabTicket` 这种有复杂业务逻辑的函数不要硬套包装器，保持原样。包装器只用于简单的 CRUD。

### 4. 自检清单
- [ ] safeQuery.ts 三个函数都支持 PromiseLike
- [ ] ticketService.ts 试点函数改造后签名不变
- [ ] grabTicket 等复杂函数未改
- [ ] log.error 保留
- [ ] 无 TODO / 占位符
````

---

## 📝 验收标准

- [ ] 新建 `src/utils/safeQuery.ts`
- [ ] `ticketService.ts` 的简单 CRUD 函数已改造
- [ ] `npm run build` 0 error
- [ ] 票务功能全部正常

---

## 🧪 验证步骤

### 1. Build

```bash
npm run build
```

### 2. 功能验证

```bash
npm run dev
```

- [ ] 票务列表正常显示
- [ ] 抢票功能正常
- [ ] 我的票券正常显示
- [ ] 退票功能正常
- [ ] 故意断网测试：操作时提示错误，不崩溃

---

## ⚠️ 风险与回滚

**风险：** 包装器改变了错误处理时序，导致某些依赖 error.code 的逻辑失效（如抢票的 `23505` 唯一约束冲突判断）。

**应对：** `grabTicket` 等需要判断 error.code 的函数**不要用包装器**，保持原样。包装器只用于"成功拿数据，失败返回默认值"的简单场景。

**回滚：**
```bash
git checkout HEAD -- src/modules/tickets/ticketService.ts
rm src/utils/safeQuery.ts
```

---

## 📦 Commit Message

```
refactor(utils): 新增 safeQuery 包装器统一错误处理

[P1-04] 新建 safeQuery/safeQueryList/safeExecute 三个包装器，
支持 postgrest-js 的 PromiseLike，统一 service 层错误处理模式。
ticketService 作为试点改造，复杂业务函数保持原样。
```
