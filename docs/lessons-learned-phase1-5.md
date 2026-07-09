# Phase 1-5 经验教训总结

> 2026-07-08 ~ 2026-07-09 | 5 项功能增强 | 涉及 30+ 文件 | 4 次 build 验证全部通过

---

## 一、查询性能：N+1 是头号杀手

### 问题

在多处发现 N+1 查询模式，即外层取 N 条记录，内层对每条记录再发一次查询：

| 位置 | 模式 | N=50 时查询数 |
|------|------|:--:|
| `adminService.ts` `fetchMemberWorkSummaries` | 1 成员列表 + 5N 统计 | 251 |
| `TaskListPage.tsx` `loadTasks` | N 个里程碑任务的逾期查询 | ~1+15 |
| `forumService.ts` `fetchPosts` | N 个帖子的回复数查询 | ~1+50 |
| `ticketService.ts` `fetchTickets` | N 个票务的抢票数查询 | ~1+30 |

### 教训

1. **只要看到 `.map()` + `supabase.from()`，就是 N+1 信号。** 必须停下来思考是否可以合并为批量查询。

2. **批量查询的正确做法：**
   ```typescript
   // ❌ N+1：每个 ID 一次查询
   const results = await Promise.all(ids.map(id => supabase.from('t').select().eq('id', id)));
   
   // ✅ 批量：一次 in() 查询
   const { data } = await supabase.from('t').select().in('id', ids);
   ```

3. **事前防范：每写完一个 Service 函数，grep 调用方确认没有在循环中调用它。**

---

## 二、Promise.all 是铁律，不是建议

### 问题

Phase 2 自检时发现 `NoticeList.tsx` 的 `loadReadStats` 用了两个串行 `await`：

```typescript
// ❌ 串行：总耗时 = A + B
const a = await supabase.from('notice_reads').select()...;
const b = await supabase.from('users').select()...;

// ✅ 并行：总耗时 = max(A, B)
const [a, b] = await Promise.all([
  supabase.from('notice_reads').select()...,
  supabase.from('users').select()...,
]);
```

### 教训

1. **编译通过 ≠ 性能正确。** TypeScript 不会警告串行 await，只有主动审查才能发现。
2. **每个 Phase 结束后必须做一次"Promise.all 检查"**：grep 所有 `await supabase`，看它们之间有没有其他 `await`。
3. **写新函数时默认用 `Promise.all`**，除非 A 的结果确实是 B 的必要输入。

---

## 三、乐观更新：改 State ≠ 改对象

### 问题

Phase 4 看板拖拽最初直接修改 task 对象再传给父组件，React 不触发重渲染：

```typescript
// ❌ 直接 mutation：React 检测不到变化
task.status = newStatus;
onTaskMove(taskId, newStatus);

// ✅ 通过 setState 回调：创建新对象
setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
```

### 教训

1. **React 中永远不要直接修改对象属性。** 必须通过 `setState` 回调返回新对象。
2. **乐观更新的三步模式**：本地立即更新 → 后台同步 → 失败回滚。
3. **拖拽操作要用 `PointerSensor` + `activationConstraint: { distance: 5 }`**，避免点击和拖拽冲突。

---

## 四、迁移脚本编辑：END $$; 歧义陷阱

### 问题

`supabase-migration.sql` 中有多个 `DO $$ ... END $$;` 块，使用 Edit 工具追加 Part 9 时，`END $$;` 匹配到了两个位置导致编辑失败。

### 教训

1. **不要用 `END $$;` 作为 Edit 的唯一定位字符串。** 必须包含足够上下文（如上一个 `IF NOT EXISTS` 的完整内容）以确保唯一匹配。
2. **考虑给每个 Part 的 `END $$;` 后加一行唯一注释**，如 `-- END PART 8`，方便后续编辑定位。
3. **大型 SQL 迁移文件考虑拆分为多个文件**，每个 Part 一个文件，消除匹配歧义。

---

## 五、角色权限过滤：一个变量管两件事必然出 bug

### 问题

Phase 3 自检发现 `fetchDashboardStats` 用同一个 `deptFilter` 变量控制两个不同逻辑：
- 待审核任务数（仅 dept_head+ 可见）
- 逾期/今日截止数（所有人可见，但需按部门过滤）

```typescript
// ❌ 一个变量控制两个逻辑，volunteer 的 filter 为 null → 所有统计返回 0
const deptFilter = canReview ? user.dept : null;

// ✅ 拆分为独立判断
const reviewQuery = canReview ? query.eq('status', 'review') : { count: 0 };
const generalQuery = isGlobalRole ? query : query.eq('assigned_department', dept);
```

### 教训

1. **一个变量不要服务两个不同的业务逻辑。** 即使它们恰好用了同一个字段过滤。
2. **写完后用最低权限角色（volunteer）的视角验证数据**：他们能看到什么？不能看到什么？
3. **角色权限测试矩阵**应在实现前就列出来：

| 角色 | 能看到待审核 | 能看到逾期 | 能看到今日截止 |
|------|:--:|:--:|:--:|
| volunteer | ❌ | ✅ 本部门 | ✅ 本部门 |
| dept_head | ✅ 本部门 | ✅ 本部门 | ✅ 本部门 |
| president | ✅ 全部 | ✅ 全部 | ✅ 全部 |

---

## 六、Fire-and-Forget：非关键操作不应阻塞主流程

### 问题

Phase 1 通知触发逻辑如果写成 `await createNotification(...)`，会导致任务创建/审核等主操作等待通知写入完成才返回。

### 正确做法

```typescript
// ✅ 火后不理：通知写入失败不影响主操作
createNotification({ userId, type, title, content }).catch(() => {});

// ❌ 阻塞主流程
await createNotification({ userId, type, title, content });
```

### 教训

1. **区分关键路径和非关键路径。** 通知、日志、统计埋点等属于非关键路径。
2. **非关键路径用 `.catch(() => {})` 静默失败**，不要 `.catch(log.error)`（会污染控制台）。
3. **关键路径（任务状态更新、提交审核）必须有明确的错误处理**和用户提示。

---

## 七、死代码：grep 调用方再动手

### 问题

Phase 3 自检时发现 `fetchNoticeReadStats` 和 `fetchNoticeReadStatsMap` 两个函数定义但从未被调用。

### 教训

1. **删除前 grep 调用方**：确认真的没人用。
2. **新增函数后 grep 调用方**：确认真的有人用——如果没人用，要么是忘记集成，要么是 YAGNI。
3. **TypeScript `noUnusedLocals` 只能检测文件内未使用变量**，跨文件的未使用导出函数检测不到。需要人工或 lint 工具补充。

---

## 八、组件复用：从第一行代码就设计为通用

### 问题

Phase 5 FileUpload 被 3 个模块（TaskForm/PostForm/NoticeForm）和 3 个详情页共享。如果一开始在每个 Form 中内联写上传逻辑，会有 6 份重复代码。

### 正确做法

```typescript
// FileUpload.tsx — 一次实现，到处使用
interface FileUploadProps {
  module: string;             // 'tasks' | 'forum' | 'notices'
  value?: Attachment[];       // 受控模式
  onChange?: (list) => void;  // 标准受控回调
  maxCount?: number;          // 可配置
}
```

### 教训

1. **当一个功能需要在 ≥2 个地方使用时，立即抽成组件。** 不要等到第三处再重构。
2. **组件用标准的 `value` + `onChange` 受控模式**，与 antd Form 无缝集成。
3. **`Attachment` 类型定义在组件文件中，通过 `import type` 引入**，避免循环依赖。

---

## 九、Realtime 订阅：每个连接都要算账

### 问题

5 个模块各自订阅了 Realtime，每个在线用户 = 5 个 WebSocket 通道。Supabase 免费层上限 200 连接。

### 教训

1. **每新增一个 `.channel().subscribe()`，在文档中记录**：哪个表、什么事件、什么过滤条件。
2. **所有订阅必须在 `useEffect` 中返回 cleanup 函数**：
   ```typescript
   useEffect(() => {
     const unsub = subscribeToXxx(dept, callback);
     return unsub; // ← 组件卸载时自动取消订阅
   }, [dept]);
   ```
3. **定期审计订阅数量**：用 `grep '\.subscribe()' src/ -r` 确认没有泄露。
4. **如果接近 200 上限，考虑合并**：将低频模块改为手动刷新。

---

## 十、自检的价值：3 个真实 Bug 被前置发现

Phase 3 结束时的自检发现了 3 个问题，如果不检查直接上线：

| 问题 | 线上表现 |
|------|------|
| `loadReadStats` 串行 await | 公告列表加载慢 2 倍 |
| volunteer 统计全返回 0 | 首页工作台对普通成员是空白页 |
| `fetchNoticeReadStats` 死代码 | 无影响，但混淆后续维护 |

**教训：每完成一个 Phase 必须自检。** 检查项包括：
- `grep 'await.*supabase'` → 看有没有连续两个 await 中间不依赖
- `grep '\.map\(.*supabase'` → 看有没有 N+1
- `grep 'export.*function'` → 看有没有定义了但 grep 不到调用方的
- `npm run build` → 确保 0 error
- 用最低权限角色视角过一遍数据流

---

## 检查清单（后续 Phase 复用）

每个 Phase 结束时执行：

```
□ build: npm run build → 0 error
□ Promise.all: grep 连续 await → 无串行化
□ N+1: grep .map( + supabase → 无循环内查询
□ 死代码: grep export + grep 调用方 → 无孤立函数
□ 角色矩阵: 用 volunteer/dept_head/president 三视角验证数据过滤
□ Realtime: 新增订阅了吗？cleanup 正确吗？
```

---

## 对 CLAUDE.md 规范的补充建议

以上发现的部分模式已在本次开发中落实，建议将以下条目纳入 CLAUDE.md：
- 性能铁律（Promise.all / LIMIT / 防抖）→ 已在设计文档中
- 乐观更新模式 → 新增
- 组件受控模式规范 → 新增
- Realtime 订阅登记 → 新增
