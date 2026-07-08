# 平台改善规划 — 7 项功能增强

> 日期：2026-07-08 | 状态：待实施

---

## 优先级总览

| 排序 | 功能 | 新表 | 文件数 | 工作量 | 性能风险 | 核心依赖 |
|:--:|------|:--:|:--:|:--:|:--:|------|
| 1 | 通知中心 | ✅ | 5 | 中 | 🟢 低 | Supabase Realtime |
| 2 | 公告已读确认 | ✅ | 4 | 小 | 🟢 低 | — |
| 3 | 首页工作台 | ❌ | 4 | 小-中 | 🟡 中 | 聚合查询 Promise.all |
| 4 | 任务看板 | ❌ | 4 | 中 | 🟢 低 | @dnd-kit |
| 5 | 文件上传 | ❌ | 5 | 中 | 🟢 低 | Supabase Storage |
| 6 | 数据简报 | ❌ | 3 | 小 | 🟡 中 | GROUP BY 聚合 |
| 7 | 全局搜索 | ❌ | 4 | 小-中 | 🔴 中高 | 防抖 + ilike + 远期全文索引 |

---

## 1. 通知中心

### 背景

当前平台没有任何主动通知机制。用户被指派任务、提交被审核、论坛有回复、新公告发布——全靠手动刷新页面逐个模块检查。Supabase Realtime 已经在任务模块（`subscribeToTasks`）中有成熟用例，扩展到通知场景是复制粘贴级工作量。

### 功能描述

- Header 右上角 Bell 图标 + 未读 Badge 数字
- 点击弹出下拉面板：最近 20 条通知列表
- 未读通知左侧蓝色标记，点击即已读
- 顶部"全部已读"按钮
- 通知类型：任务指派、提交审核通过/驳回、论坛回复、新公告、里程碑逾期提醒

### 触发时机

| 事件 | 通知谁 | 通知内容 |
|------|--------|---------|
| 任务被指派 | 被指派者 | "XXX 给你分配了任务「任务标题」" |
| 提交审核通过 | 提交者 | "你的任务「任务标题」审核通过" |
| 提交被驳回 | 提交者 | "你的任务「任务标题」审核驳回：驳回理由" |
| 论坛有新回复 | 帖主 | "XXX 回复了你的帖子「帖子标题」" |
| 里程碑逾期 | 任务执行人 | "任务「任务标题」有 N 个里程碑已逾期" |
| 新公告发布 | 本部门全员 | "本部门发布了新公告「公告标题」" |

### 技术方案

```
数据库：notifications 表
├─ id, user_id (接收者), type, title, content
├─ related_link (跳转路径), is_read, created_at
└─ RLS: 用户只能读自己的通知

Service:
├─ fetchNotifications(userId) → 最近 20 条
├─ markAsRead(notificationId)
├─ markAllAsRead(userId)
├─ subscribeToNotifications(userId, callback) ← Realtime
└─ createNotification({...}) ← 各模块触发时调用

组件：
├─ NotificationBell.tsx — Bell 图标 + Badge + Dropdown
└─ notification.module.css
```

### 性能考量

| 点 | 方案 | 风险 |
|----|------|------|
| 实时性 | Realtime WebSocket 推送，非轮询 | 🟢 无 |
| 查询 | `WHERE user_id = X ORDER BY created_at LIMIT 20` | 🟢 走 user_id 索引 |
| 写入 | 每个事件 INSERT 一行，分散在业务操作后 | 🟢 单行插入 <10ms |
| Badge 数字 | `SELECT count(*) WHERE user_id = X AND is_read = false` | 🟢 COUNT 走索引 |

### 改动文件

| 文件 | 改动类型 | 说明 |
|------|:--:|------|
| `supabase-migration.sql` | 追加 | notifications 表 + RLS 策略 |
| `src/modules/notification/notificationService.ts` | 新建 | CRUD + Realtime 订阅 |
| `src/modules/notification/NotificationBell.tsx` | 新建 | Bell Badge + 下拉面板 |
| `src/modules/notification/index.tsx` | 新建 | 导出 |
| `src/components/AppLayout.tsx` | 修改 | Header 中插入 `<NotificationBell>` |
| `src/modules/tasks/taskService.ts` | 修改 | createTask / reviewSubmission 后调 createNotification |
| `src/modules/tasks/TaskForm.tsx` | 修改 | 发布任务后触发通知 |
| `src/modules/tasks/TaskDetail.tsx` | 修改 | 审核操作后触发通知 |
| `src/modules/forum/PostForm.tsx` | 修改 | 发帖回复后触发通知 |
| `src/modules/forum/PostDetail.tsx` | 修改 | 回复后触发通知 |
| `src/modules/notices/NoticeForm.tsx` | 修改 | 发布公告后触发通知 |

### 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| 通知遗漏 | 中 | 写入失败不影响主操作，log.error 记录 |
| Badge 数字不准 | 低 | 每次打开面板时重新 count |
| Realtime 断连 | 低 | Supabase 自动重连，断连期间无推送但不丢数据 |

---

## 2. 公告已读确认

### 背景

学生会发布重要通知后，主席/部长不知道谁看了谁没看——这是学生会管理的真实刚需。技术实现极简，一张新表搞定。

### 功能描述

- 公告详情底部显示"3/12 人已读"
- 点击数字弹出已读/未读名单
- 用户打开公告详情时自动标记已读
- 公告列表中已读公告显示为灰色标题或 ✓ 标记

### 技术方案

```
数据库：notice_reads 表
├─ id, notice_id, user_id, read_at
├─ UNIQUE(notice_id, user_id) — 防重复
└─ RLS: 同部门可读

Service:
├─ markNoticeRead(noticeId, userId) — UPSERT
├─ fetchNoticeReadStats(noticeId) → { read, unread, total }
└─ fetchNoticeReaders(noticeId) → 已读/未读用户列表

组件：NoticeDetail 打开时自动 markNoticeRead，底部显示统计
```

### 性能考量

| 点 | 方案 | 风险 |
|----|------|------|
| 标记已读 | 单行 UPSERT | 🟢 |
| 统计查询 | `SELECT count(*) FROM notice_reads WHERE notice_id = X` | 🟢 走索引 |
| 名单查询 | `SELECT users.name FROM notice_reads JOIN users …` | 🟢 |

### 改动文件

| 文件 | 改动类型 | 说明 |
|------|:--:|------|
| `supabase-migration.sql` | 追加 | notice_reads 表 + RLS |
| `src/modules/notices/noticeService.ts` | 修改 | 新增 markNoticeRead / fetchNoticeReadStats / fetchNoticeReaders |
| `src/modules/notices/NoticeList.tsx` | 修改 | 已读公告样式区分 |
| `src/modules/notices/NoticeDetail.tsx` | 新建或修改 | 自动标记已读 + 底部已读统计面板 |

### 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| 打开即标记可能误标 | 低 | 仅当前用户，不影响他人 |
| 老公告无已读数据 | 低 | 首次打开时 count=0，显示"0/N 人已读"，随查看增长 |

---

## 3. 首页工作台

### 背景

当前登录后默认跳到任务列表。用户需要主动逐个点开模块才知道有什么新消息。一个聚合首页可以一站式展示"我需要关注什么"。

### 功能描述

- 登录后默认页改为工作台（路由 `/dashboard`）
- 顶部：3 张统计卡片 — 待审核任务 + 逾期任务 + 今日截止
- 中部：最近动态时间线 — 论坛回复、公告发布、任务状态变更
- 右侧栏：快捷入口 — 发布任务 / 发布公告 / 发帖
- 5 分钟自动刷新（可选）

### 技术方案

```
无新表，纯聚合查询：

Service:
├─ fetchDashboardStats(userId, dept, role) → { reviewTasks, overdueTasks, todayDeadline }
│   └─ Promise.all([3 count queries]) — 注意并行！
├─ fetchRecentActivity(userId, dept) → ActivityItem[]
│   └─ Promise.all([notices查询, forum_replies查询, task_submissions查询])
│   └─ 各 LIMIT 5，前端 merge + sort by time
└─ 无需 Realtime，用户手动刷新或切换页面回来时重新查

路由：/dashboard → DashBoardPage（新组件）
侧边栏：加菜单项，默认跳转改 /dashboard
```

### 性能考量

| 点 | 方案 | 风险 |
|----|------|------|
| 统计查询 | 3 个 count + Promise.all 并行 | 🟡 必须并行，不能串行 await |
| 最近动态 | 3 表各 LIMIT 5 + 前端 merge | 🟡 Data 量 <15 条，<50ms |
| 首次加载 | 6 次查询并行 → ~200ms | 🟡 和 Profile 优化后同等水平 |
| 远期优化 | 数据量大后可用 PostgreSQL RPC 一次返回 | 🟢 接口不变，纯后端替换 |

### 改动文件

| 文件 | 改动类型 | 说明 |
|------|:--:|------|
| `src/modules/dashboard/DashBoardPage.tsx` | 新建 | 页面组件 |
| `src/modules/dashboard/dashboardService.ts` | 新建 | 聚合查询 |
| `src/modules/dashboard/index.tsx` | 新建 | 导出 |
| `src/modules/dashboard/dashboard.module.css` | 新建 | 样式 |
| `src/App.tsx` | 修改 | 加路由 + lazy import |
| `src/utils/constants.ts` | 修改 | MENU_ITEMS 加 dashboard |
| `src/components/AppLayout.tsx` | 修改 | 默认跳转改 /dashboard |

### 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| 查询串行化 | 中 | 强制 Promise.all，code review 重点检查 |
| 三表合并排序逻辑 | 低 | 各表返回 created_at，前端 sort 统一 |
| 首页信息过多 | 低 | 先做 3 卡片 + 动态流，不加右侧栏保持简洁 |

---

## 4. 任务看板

### 背景

当前任务列表只有 Tab 筛选（全部/待开始/进行中/待审核/已完成），想知道"有哪些卡在待审核"需要点两次。看板视图一屏展示所有状态列，拖拽改状态——视觉效果和操作效率都提升。

### 功能描述

- TaskListPage 顶部加"列表 / 看板"切换
- 看板模式：4 列（待开始 / 进行中 / 待审核 / 已完成）
- 任务卡片显示：标题、优先级色条、负责人头像、截止日期
- 拖拽卡片到另一列 → 自动更新状态
- 卡片点击 → 打开 TaskDetail 弹窗（复用现有）

### 技术方案

```
依赖：@dnd-kit/core + @dnd-kit/sortable（轻量、TypeScript 友好）

组件：
├─ KanbanBoard.tsx — 4 列容器 + 拖拽上下文
├─ KanbanColumn.tsx — 单列（标题 + 任务计数 + 卡片列表）
├─ KanbanCard.tsx — 任务卡片
└─ kanban.module.css

Service：复用现有 fetchTasks + updateTaskStatus
├─ 拖拽后调 updateTaskStatus(taskId, newStatus)
└─ 乐观更新：先改本地 state → 后台 sync → 失败回滚

TaskListPage 改动：
├─ viewMode state: 'list' | 'kanban'
├─ 根据 viewMode 渲染不同组件
└─ 查询逻辑不变
```

### 性能考量

| 点 | 方案 | 风险 |
|----|------|------|
| 查询 | 同现有 fetchTasks，不变 | 🟢 无 |
| 拖拽 | @dnd-kit 使用 CSS transform，GPU 加速 | 🟢 |
| 乐观更新 | 本地改 state + 后台 update，失败时 message.error | 🟢 |

### 改动文件

| 文件 | 改动类型 | 说明 |
|------|:--:|------|
| `src/modules/tasks/KanbanBoard.tsx` | 新建 | 看板容器 |
| `src/modules/tasks/KanbanColumn.tsx` | 新建 | 列组件 |
| `src/modules/tasks/KanbanCard.tsx` | 新建 | 卡片组件 |
| `src/modules/tasks/kanban.module.css` | 新建 | 看板样式 |
| `src/modules/tasks/taskService.ts` | 修改 | 新增 updateTaskStatus(id, status) |
| `src/modules/tasks/TaskListPage.tsx` | 修改 | 加 viewMode 切换 |
| `package.json` | 修改 | 加 @dnd-kit/core, @dnd-kit/sortable |

### 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| 拖拽库体积 | 低 | @dnd-kit tree-shakable，实际增量 ~15KB gzip |
| 拖拽后同步失败 | 低 | 乐观更新 + 错误回滚 + message 提示 |
| 移动端拖拽体验差 | 低 | 看板仅在桌面端显示拖拽，移动端回退到列表 |

---

## 5. 文件上传

### 背景

学生会日常工作需要传活动照片、策划文档、Excel 表格。目前平台完全没有文件能力，同学只能通过微信群传文件——和平台的"一站式办公"目标矛盾。Supabase Storage 免费层 1GB，开箱即用。

### 功能描述

- 可复用上传组件 `FileUpload`：拖拽/点击上传 + 进度条 + 文件列表
- 集成到 TaskForm（任务附件）、PostForm（帖子附件）、NoticeForm（公告附件）
- 支持格式：图片、PDF、Word、Excel、PPT、压缩包
- 单文件限制 10MB
- 在任务详情/帖子详情/公告详情中列出附件，可下载

### 技术方案

```
Supabase Storage：
├─ Bucket: "attachments"（公开读，登录上传）
├─ 路径策略：{module}/{entityId}/{timestamp}_{filename}
└─ RLS: SELECT 所有人，INSERT 登录用户

组件：
├─ FileUpload.tsx — 可复用上传组件
│   ├─ antd Upload + Dragger
│   ├─ 上传到 Supabase Storage
│   └─ 返回 file_url + file_name 列表
├─ FileList.tsx — 只读附件列表（展示 + 下载）
└─ file-upload.module.css

Service：
├─ uploadFile(file, bucket, path) → url
├─ deleteFile(bucket, path)
└─ listFiles(bucket, prefix) → 文件列表

集成点：
├─ TaskForm: 加 <FileUpload>，提交时 file_urls 存入 tasks 表 JSON 字段
├─ PostForm: 加 <FileUpload>
├─ NoticeForm: 加 <FileUpload>
├─ TaskDetail / PostDetail / NoticeDetail: 加 <FileList>
└─ tasks 表加 ALTER COLUMN attachments JSONB DEFAULT '[]'
```

### 性能考量

| 点 | 方案 | 风险 |
|----|------|------|
| 上传 | 直传 Supabase Storage，不经应用服务器 | 🟢 |
| 下载 | Supabase CDN 分发 | 🟢 |
| 存储上限 | 免费 1GB，学生会场景够用数年 | 🟢 |
| 并发上传 | 浏览器限制同域 6 连接，大文件时分片上传 | 🟡 当前不需要分片，10MB 直传足够 |

### 改动文件

| 文件 | 改动类型 | 说明 |
|------|:--:|------|
| `supabase-migration.sql` | 追加 | Storage bucket 创建语句 |
| `src/components/FileUpload.tsx` | 新建 | 可复用上传组件 |
| `src/components/FileList.tsx` | 新建 | 附件列表组件 |
| `src/components/file-upload.module.css` | 新建 | 样式 |
| `src/modules/tasks/TaskForm.tsx` | 修改 | 嵌入 `<FileUpload>` |
| `src/modules/tasks/TaskDetail.tsx` | 修改 | 嵌入 `<FileList>` |
| `src/modules/forum/PostForm.tsx` | 修改 | 嵌入 `<FileUpload>` |
| `src/modules/forum/PostDetail.tsx` | 修改 | 嵌入 `<FileList>` |
| `src/modules/notices/NoticeForm.tsx` | 修改 | 嵌入 `<FileUpload>` |
| `src/modules/notices/NoticeList.tsx` | 修改 | 公告详情嵌入 `<FileList>` |

### 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| Storage 免费额度耗尽 | 低 | 1GB 在学生会场景可用数年 |
| 文件类型安全 | 低 | 前端 + Storage Policy 双重限制 MIME |
| 上传失败用户体验 | 低 | antd Upload 自带进度条 + 重试 |

---

## 6. 数据简报

### 背景

学期末工作总结是学生会的固定流程。目前需要手动翻任务列表手工统计。自动生成简报可以直接复制粘贴到工作总结里。

### 功能描述

- 首页工作台底部嵌入"本周简报"卡片
- 展示：
  - 本周完成 N 个任务（环比 ↑↓）
  - 最活跃部门（按完成数）
  - 逾期率（逾期任务 / 总任务）
- "生成完整简报"按钮 → 弹窗显示更详细的数据（按月/按部门/按人）
- 仅负责人及以上可见

### 技术方案

```
Service：
├─ fetchWeeklyBrief(department) → { totalCompleted, totalOverdue, topDept, … }
│   └─ 1 次聚合查询（GROUP BY + COUNT + WHERE deadline BETWEEN）
├─ fetchMonthlyReport(department) → 更详细的月报数据
└─ 注意使用 Promise.all，不要串行

组件：
├─ WeeklyBriefCard.tsx — 简报卡片
├─ ReportModal.tsx — 详细报告弹窗
└─ brief.module.css

嵌入位置：首页工作台底部 or Profile 页新卡片
```

### 性能考量

| 点 | 方案 | 风险 |
|----|------|------|
| 聚合查询 | GROUP BY assigned_department + COUNT | 🟡 数据量 <1000 行 → <50ms；远期可能需要物化视图 |
| 环比计算 | 客户端计算（本周 vs 上周） | 🟢 |
| 月报查询 | 范围更大但数据量同级 | 🟢 |

### 改动文件

| 文件 | 改动类型 | 说明 |
|------|:--:|------|
| `src/modules/dashboard/dashboardService.ts` | 新增函数 | fetchWeeklyBrief + fetchMonthlyReport |
| `src/modules/dashboard/WeeklyBriefCard.tsx` | 新建 | 简报卡片 |
| `src/modules/dashboard/ReportModal.tsx` | 新建 | 详细报告弹窗 |
| `src/modules/dashboard/brief.module.css` | 新建 | 样式 |

### 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| GROUP BY 性能退化 | 低 | 当前数据量完全无感 |
| 简报数据不准 | 中 | 需明确"本周"定义（周一-周日 vs 最近7天），设计时固定为周一-周日 |

---

## 7. 全局搜索

### 背景

平台 8 个模块各自独立。用户想找一个叫"迎新晚会"的东西——是任务？公告？帖子？——需要逐个模块去搜索。一个 Header 搜索框可以跨模块定位。

### 功能描述

- Header 中间或右侧搜索框（Ctrl+K 快捷键）
- 输入后 300ms 防抖，并行搜索 4 表：tasks(title)、notices(title)、forum_posts(title)、platform_guides(title+content)
- 搜索结果下拉面板，按模块分组展示
- 点击结果跳转到对应页面
- 匹配关键词高亮

### 技术方案

```
无新表，纯前端 + 现有查询：

Service：
├─ globalSearch(keyword) → { tasks[], notices[], posts[], guides[] }
│   └─ Promise.all([
│       supabase.from('tasks').select('id,title').ilike('title', `%${kw}%`).limit(5),
│       supabase.from('notices').select('id,title').ilike('title', `%${kw}%`).limit(5),
│       ...
│     ])
└─ 防抖 300ms，空字符串不查询

组件：
├─ GlobalSearch.tsx — 搜索框 + 下拉面板
└─ global-search.module.css

性能关键：
├─ 防抖是必须的 ← 否则每敲一个字发 4 次查询
├─ ilike 不走索引 ← 数据 <1000 行时完全无感
└─ 远期方案：数据 >5000 行时改用 PostgreSQL Full Text Search
    └─ CREATE INDEX … ON tasks USING GIN (to_tsvector('simple', title));
    └─ 查询改为：WHERE to_tsvector('simple', title) @@ plainto_tsquery('simple', keyword)
    └─ 届时仅改 Service 层 1 行，组件无感
```

### 性能考量

| 点 | 方案 | 风险 |
|----|------|------|
| 防抖 | 300ms debounce | 🟢 必须，否则打字过程狂发查询 |
| ilike 全表扫描 | 当前 500 行 → <30ms | 🟡 远期 >5000 行需迁移 Full Text Search |
| 4 表并行 | Promise.all | 🟢 总时间 = 最慢那表 |
| 空查询 | keyword.trim() === '' → return empty | 🟢 避免无效查询 |

### 改动文件

| 文件 | 改动类型 | 说明 |
|------|:--:|------|
| `src/components/GlobalSearch.tsx` | 新建 | 搜索框 + 下拉面板 |
| `src/components/global-search.module.css` | 新建 | 样式 |
| `src/components/globalSearchService.ts` | 新建 | globalSearch 函数 |
| `src/components/AppLayout.tsx` | 修改 | Header 中插入 `<GlobalSearch>` |

### 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| 全表扫描性能退化 | 🔴 中高 | 加防抖；数据量 <1000 完全无感；远期迁移 Full Text Search |
| 4 表并发压垮数据库 | 低 | 各 LIMIT 5，总共最多 20 行 |
| 键盘快捷键冲突 | 低 | Ctrl+K 在浏览器中被占用时降级为仅点击 |
| 搜索结果权限泄露 | 中 | 搜索时需加部门过滤，否则可能看到其他部门的任务/公告标题 |

---

## 实施约定

### 开发流程

```
每项功能独立走完整流程：
提出问题 → 分析原因 → 设计方案 → 评估影响 → 征得同意 → 执行 → build验证 → 功能验证 → 代码审查 → 提交推送
```

### 性能铁律

```
1. 所有独立查询必须 Promise.all 并行，禁止串行 await
2. 所有输入搜索必须 300ms 防抖
3. 所有列表查询必须 LIMIT
4. Service 函数签名优先设计为一次返回所有需要的数据
```

### 数据库变更

```
1. 先在 supabase-migration.sql 末尾追加，标注分区注释
2. 代码中先写好 Service 函数
3. 提醒用户手动执行迁移
4. 用户确认后功能才能正常使用
```

---

## 参考

- 问题跟踪：`docs/ISSUES.md`
- 数据库迁移：`supabase-migration.sql`
- 已实施设计：`docs/superpowers/specs/2026-07-05-platform-guide-design.md`
