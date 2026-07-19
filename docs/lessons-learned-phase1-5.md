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

## 十一、补遗：Phase 1-7 全量自检（2026-07-09）

全部 7 个 Phase 完成后执行了一次全面自检，发现：

### 发现并修复的问题

| # | 严重度 | 位置 | 问题 | 修复 |
|:--:|:--:|------|------|------|
| 1 | 🔴 | [NoticeList.tsx:106](../src/modules/notices/NoticeList.tsx#L106) | 志愿者可点击已读数字查看具体"谁读了/谁没读"名单 — 隐私泄露 | `handleShowReaders` 加 `canCreate` 守卫 |
| 2 | 🟡 | [FileUpload.tsx:201](../src/components/FileUpload.tsx#L201) | `attachmentToUploadFile` 导出但无外部引用 | 保留（预留 API） |
| 3 | 🟢 | FileUpload.tsx + FileList.tsx | `formatSize` / `getFileIcon` 重复定义 | 已知，暂无大碍 |

### 新代码全部通过的检查项

- `Promise.all` 并行：`fetchDashboardStats`、`fetchRecentActivity`、`fetchWeeklyBrief`、`fetchMonthlyReport`、`globalSearch` 全部正确并行
- `LIMIT`：notifications(20)、activity(5×3)、search(5×4) 全有限制
- N+1：新代码无循环内查询
- Realtime cleanup：所有订阅在 useEffect 中正确返回
- 角色权限：Dashboard/BriefCard/ReportModal/Search 全部有 `hasMinRole` 守卫
- Type imports：跨模块类型引用全部用 `import type`
- 防抖：GlobalSearch 300ms debounce + 空输入不查询

### 既有代码的问题（非本次引入，记录备忘）

| 类别 | 数量 | 典型位置 |
|------|:--:|------|
| 串行 await | 5 处 | `forumService.fetchPostDetail`、`noticeService.fetchNoticeReaders`、`TaskDetail.tsx`、`PostDetail.tsx`、`NoticeList.tsx` |
| N+1 查询 | 2 处 | `forumService.fetchPosts`(每帖查回复数)、`TaskListPage.loadTasks`(每任务查里程碑) |
| 缺少 LIMIT | 14 处 | `fetchTasks`、`fetchPosts`、`fetchNotices`、`fetchReplies` 等均无限制 |
| N×5 爆炸 | 1 处 | `adminService.fetchMemberWorkSummaries`(每人 5 个 count 查询) |

### 新增教训

**#11：权限检查不能只靠 UI 隐藏。**
志愿者看不到"发布公告"按钮 → 但能看到 `👁 3/12` 已读数字。点击后直接调 `fetchNoticeReaders` 拿到了具体名单。**UI 隐藏 ≠ 权限守卫，每个数据接口入口都要独立做角色检查。**

**#12：全量自检必须模拟最低权限角色。**
以 `volunteer`(0) / `dept_head`(1) / `president`(3) 三个视角，逐一过每个可见元素：这个角色应该能点击吗？点击后能拿到什么数据？仅此一次自检就发现了 1 个隐私漏洞。

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

## 十二、Realtime channel 名全局唯一（2026-07-12 补遗）

### 问题

v2.3 侧边栏徽标功能导致全局 ErrorBoundary 崩溃，强制白屏。根因是 `AppLayout.tsx` 和 `NotificationBell.tsx` 都调用了 `subscribeToNotifications()`，但该函数硬编码了 channel 名 `notifications-changes`。Supabase Realtime 禁止在 `subscribe()` 后对同一 channel 追加 `.on()` 回调。

### 教训

**#13：Supabase Realtime channel 名是全局唯一的。** 如果多个组件需要订阅同一张表的变化，有三个选择：

1. **不同 channel 名**（本次修复）：给 `subscribeToNotifications(userId, callback, 'sidebar')` 加可选后缀，各自独立 channel，互不干扰
2. **共享回调链**（更优）：父组件订阅 → 通过 Context/props 下发给子组件，一个 channel 服务多个消费者
3. **合并为单组件**：如果两个消费者在同一个组件树中，合并为一个 useEffect

### 修复

```typescript
// notificationService.ts
export function subscribeToNotifications(
  userId: string,
  onNewNotification: (notification: Notification) => void,
  channelSuffix?: string,  // ← 新增
): () => void {
  const channelName = channelSuffix
    ? `notifications-${channelSuffix}`
    : 'notifications-changes';
  // ...
}

// AppLayout.tsx — 使用独立 channel
const unsubscribe = subscribeToNotifications(user.id, () => loadBadges(), 'sidebar');
// NotificationBell.tsx — 不受影响，仍用默认 channel
const unsubscribe = subscribeToNotifications(user.id, () => { ... });
```

**修改位置：** [notificationService.ts:162](../src/modules/notification/notificationService.ts#L162) + [AppLayout.tsx:75](../src/components/AppLayout.tsx#L75)
**Commit:** `69ab3af6`
**记录于：** [ISSUES.md #6](./ISSUES.md#6-supabase-realtime-channel-名冲突导致全局渲染崩溃)

---

## 十三、移动端适配必须逐模块全量检查（2026-07-12 补遗）

### 问题

Phase 1+2 完成了 AppLayout、公告、Dashboard、Tickets 的适配，以为覆盖了主要页面。但用户在手机上使用后发现权限管理、任务管理、论坛等模块仍有横向溢出——原因是我们没有逐模块、逐文件的系统性检查。

### 全量审计发现的溢出模式

| 根因类型 | 数量 | 影响模块 |
|------|:--:|------|
| Table 缺 `scroll.x` | 3 处 | admin、tasks |
| Modal 固定 `width` | 11 处 | tasks、forum、school、profile、admin |
| CSS flex 缺 `flex-wrap` | 8 处 | forum、school、tasks |
| 固定宽度 Select/组件 | 1 处 | forum |
| Descriptions `column` 硬编码 | 1 处 | tasks |

### 教训

**#14：移动端适配不能只靠"设计阶段覆盖"，必须做全量逐文件审计。**

检查清单（每个模块）：
```
□ Modal: grep 'width={' → 固定值需改为 md ? N : undefined
□ Table: 没有 scroll.x 的必须加 scroll={{ x: 'max-content' }}
□ CSS flex: 没有 flex-wrap 的容器在 @media 中补 wrap
□ 固定宽度: grep 'width: \d+px' → 超过 300px 的在小屏上可能溢出
□ Descriptions: column 固定值 → md ? N : 1
□ Select/Input: style={{ width: N }} → md ? N : '100%'
```

**关键原则：** 不要假设"这个模块用了 Ant Design 组件所以自然响应式"。Ant Design 的默认行为是容器自适应，但 `Table`（无 scroll.x 不启用内部滚动）、`Modal`（固定宽度不缩小）、自定义 CSS flex（不自动折行）都需要显式处理。

### 移动端适配速查表（Ant Design + 768px 断点）

以下 6 种模式覆盖了本次所有溢出修复。以后同类项目直接套用：

| # | 场景 | 原始写法 | 移动端写法 | 判断条件 |
|:--:|------|------|------|------|
| 1 | 侧边导航 | `<Sider>` | `md ? <Sider> : <Drawer placement="left" width={220}>` | `Grid.useBreakpoint()` |
| 2 | Modal 宽度 | `width={600}` | `width={md ? 600 : undefined}` | `undefined` = antd 自适应 |
| 3 | Table 溢出 | 无 `scroll` | `scroll={{ x: 'max-content' }}` | `max-content` 自适应列宽 |
| 4 | 固定宽度组件 | `style={{ width: 360 }}` | `style={{ width: md ? 360 : '100%' }}` | 手机端占满宽度 |
| 5 | Descriptions 列 | `column={3}` | `column={md ? 3 : 1}` | 手机端单列堆叠 |
| 6 | flex 容器 | `display: flex` 无 wrap | `@media { flex-wrap: wrap }` | 手机端自动折行 |

**前置条件模板（每个文件开头）：**
```typescript
import { Grid } from 'antd';
// 组件内：
const { md } = Grid.useBreakpoint();
```

**CSS 模板（每个 `.module.css` 文件末尾）：**
```css
@media (max-width: 768px) {
  .pageHeader { flex-wrap: wrap; gap: 8px; }
  .pageHeader h2 { font-size: 16px !important; }
  /* 仅覆盖 @media 内，桌面端零影响 */
}
```

**方法论总结：**
1. **"用了 Ant Design ≠ 自然响应式"** — Table/Modal/flex 都需要显式处理
2. **"逐文件 grep、逐处改"** — 不能靠"主要页面覆盖了"的假设，必须全量审计
3. **"断点统一 768px，桌面端零影响"** — 所有规则关在 `@media` 里，不改任何默认行为
4. **"修改顺序：组件属性 → CSS 布局"** — 先改能用 `md ?` 解决的（Modal/Table/Descriptions），再补 CSS flex-wrap

**修改位置：** [ISSUES.md #7](./ISSUES.md#7-全局移动端横向溢出--多个模块-tablemodalflex-导致页面撑破)
**Commits:** `54169010` + `d5b92a03` + `0462b3b9`

---

## 十四、布尔字段语义过载：一个字段别表达两种含义（2026-07-12 补遗）

### 问题

邀请码管理页面中，管理员点击"停用"后，状态列显示"已使用"而非"已停用"。根因是 `is_used`（布尔值）一个字段承载了两种不同语义：

| 场景 | `is_used` | `used_by` | 实际含义 |
|------|:--:|:--:|------|
| 未被使用 | `false` | `null` | 可用 |
| 被用户注册使用 | `true` | 有 UUID | 已使用 |
| 管理员手动停用 | `true` | `null` | 已停用 |

`deactivateInviteCode` 通过设置 `is_used = true` 来阻止注册（正确），但前端渲染用单一布尔值判断，导致"已使用"和"已停用"无法区分。

### 教训

**#15：布尔字段只能表达两种状态。如果需要表达三种或更多状态，先检查是否有其他现有字段可以组合区分，再考虑新增列。**

本例中 `used_by` 字段天然能区分——被注册使用时一定有值，管理员停用时一定为 null。所以：

```typescript
// ❌ 单一布尔值判断——歧义
render: (used: boolean) => used ? '已使用' : '可用'

// ✅ 组合判断——三种状态清晰
if (!record.is_used) return '可用';
if (record.used_by) return '已使用';
return '已停用';
```

### 设计启示

1. **建表时问自己：这个布尔字段未来会不会需要表达第三种状态？** 如果是，直接用枚举或加一个配套字段。
2. **修 bug 时优先考虑"不改数据库"的方案。** 本例不改 schema、不改注册流程、只改前端渲染，改动面最小，风险最低。
3. **`used_by` 这类关联字段不仅是"谁用了"，也是天然的"是否被真实使用过"的鉴别器。** 在设计时就该意识到它可以作为状态判定的辅助字段。

**修改位置：** [adminService.ts](../src/modules/admin/adminService.ts) + [InviteCodeManage.tsx](../src/modules/admin/InviteCodeManage.tsx)
**Commit:** `ab2cd87f`
**记录于：** [ISSUES.md #8](./ISSUES.md#8-停用邀请码后状态显示已使用而非已停用)

---

## 对 CLAUDE.md 规范的补充建议

以上发现的部分模式已在本次开发中落实，建议将以下条目纳入 CLAUDE.md：
- 性能铁律（Promise.all / LIMIT / 防抖）→ 已在设计文档中
- 乐观更新模式 → 新增
- 组件受控模式规范 → 新增
- Realtime 订阅登记 → 新增

---

## 十六、PWA 化：Vite 哈希文件名与 SW 预缓存的冲突

### 问题

PWA 的传统做法是在 Service Worker 的 `install` 事件中预缓存所有静态文件。但 Vite 构建产物使用内容哈希命名（如 `index-B6ggk74c.js`），每次 build 文件名都变。手写的 `sw.js`（放在 `public/` 目录不经过 Vite 编译）无法预知这些哈希值。

### 解决方案

放弃"安装时预缓存所有资源"，改用**运行时缓存**策略：
- HTML → 网络优先，回退缓存（保证版本及时更新）
- JS/CSS → 缓存优先，回退网络（首次访问后自动缓存，离线可用）
- API → 仅网络，不缓存

仅在 install 中预缓存少量不变的 Shell 文件（manifest.json、favicon、版本文件）。

### 教训

1. **构建工具 + PWA = 必须考虑缓存策略适配。** 哈希文件名是好事（天然做版本控制），但要放弃"全部预缓存"的传统思路。
2. **运行时缓存同样能实现离线访问。** 用户首次在线使用过程中，所有静态资源都被自动缓存，之后离线完全可用。
3. **SW 文件必须放 `public/` 根目录。** Vite 不编译它，它作为静态文件原样部署。SW 的 scope 默认等于其所在目录。
4. **GitHub Pages 子目录项目所有路径必须动态计算。** `self.location.pathname.replace(/\/sw\.js$/, '')` 是可靠做法。

**相关文件：** [public/sw.js](../public/sw.js) | [index.html](../index.html)
**Commit:** （本次提交）
