# 问题跟踪

> 学生会线上交流平台 — 已知问题、警告、Bug 记录与修复记录

---

---

## 已修复

### #10 index.html 注释中的 `%VITE_*%` 触发 Vite 变量缺失警告

- **日期：** 2026-09-11（发现）
- **类型：** 构建期提示噪音
- **严重程度：** 极低（不影响构建产物与功能）
- **现象：** 启动 dev server 时输出 `(!) %VITE_*% is not defined in env variables found in /index.html. Is the variable mistyped?`
- **原因：** [index.html:14](index.html#L14) 的说明性 HTML 注释里写了字面量 `%VITE_*%`，Vite 的 HTML 常量替换会扫描注释内容，找不到名为 `VITE_*` 的环境变量于是告警
- **解决方案：** 把注释里的通配写法改成「双百分号包裹的 VITE_ 变量名」的文字描述，不再出现可被扫描的 `%...%` 字面量；并补一句「注释里不要写裸通配形式」防止复发
- **修改位置：** [index.html](index.html)
- **修复版本：** v4.3.0

### #9 任务详情弹窗内的任务状态不随审核操作刷新

- **日期：** 2026-09-11（发现）
- **类型：** UX 瑕疵（前端状态快照）
- **严重程度：** 低（不影响数据正确性，刷新列表后状态正确）
- **发现方式：** Phase 0 编写 E2E 冒烟② 时暴露（原以为断言写错，实为产品行为）
- **现象：** 部长在任务详情弹窗里点「通过」后，提交记录正确标记「已通过」，但同弹窗顶部 Descriptions 里的任务状态仍显示「待审核」，要关闭弹窗回到列表才看到「已完成」
- **原因：** [TaskListPage.tsx:33](src/modules/tasks/TaskListPage.tsx#L33) 用 `detailTask` state 持有点击时的任务快照传给 `TaskDetail`；`refresh()` 只重取列表查询，不会更新这个快照对象
- **解决方案：** 弹窗状态从「持有任务对象」改为「只持有 `detailTaskId`」，渲染时用 `useMemo` 从最新列表数据里按 id 取——列表刷新后弹窗内容自动同步，且不额外增加网络往返
- **修改位置：** [TaskListPage.tsx](src/modules/tasks/TaskListPage.tsx)
- **回归保障：** E2E 冒烟② 增加「审核通过后弹窗内也显示已完成」断言（此前只能在关闭弹窗后验证）
- **修复版本：** v4.3.0

### #6 Supabase Realtime channel 名冲突导致全局渲染崩溃

- **日期：** 2026-07-12
- **类型：** Bug（Realtime 冲突）
- **严重程度：** 高（全局 ErrorBoundary 拦截，白屏不可用）
- **现象：** 桌面端（PC）打开页面即崩溃，控制台报 `cannot add postgres_changes callbacks for realtime:notifications-changes after subscribe()`
- **原因：** v2.3 侧边栏徽标功能中，`AppLayout.tsx` 和 `NotificationBell.tsx` 都调用了 `subscribeToNotifications()`，但该函数硬编码了 channel 名 `notifications-changes`。Supabase Realtime 禁止在 `subscribe()` 后对同一 channel 追加回调——第一个组件 subscribe 后第二个再 `.on()` 就抛异常
- **解决方案：** `subscribeToNotifications` 增加可选 `channelSuffix` 参数。默认行为不变（NotificationBell 无后缀 → `notifications-changes`），AppLayout 传入 `'sidebar'` → `notifications-sidebar`。两个独立 channel 各管各的
- **修改位置：** [notificationService.ts:162](src/modules/notification/notificationService.ts#L162) + [AppLayout.tsx:75](src/components/AppLayout.tsx#L75)
- **Commit:** `69ab3af6`
- **教训：** Supabase Realtime 的 channel 名是全局唯一的——不要在同一会话中对同一 channel 名调两次 `.subscribe()`。如需多个消费者，要么共享 channel 回调（通过 Context），要么用不同 channel 名

### #8 停用邀请码后状态显示"已使用"而非"已停用"

- **日期：** 2026-07-12
- **类型：** Bug（数据模型语义过载）
- **严重程度：** 低（不影响功能正确性，仅展示有歧义）
- **现象：** 管理员点击"停用"后，邀请码状态列显示"已使用"而非"已停用"，且无法删除已停用和无用的邀请码
- **原因：** `is_used`（布尔值）一个字段承载了两种语义——"被用户注册使用"（`used_by` 有值）和"被管理员手动停用"（`used_by` 为 null）。`deactivateInviteCode` 设置 `is_used = true`（阻止注册），但前端渲染用 `is_used` 单一判断导致两种状态都显示"已使用"
- **解决方案：** 
  1. 状态列改用 `is_used + used_by` 三态判定：`!is_used` → 🟢 可用，`is_used && used_by` → ⚪ 已使用，`is_used && !used_by` → 🔴 已停用
  2. 新增 `deleteInviteCode()` 函数（DELETE 行），presidium+ 可删除 `used_by IS NULL` 的邀请码（含可用的和已停用的），president/teacher 可跨部门删除
  3. 操作列增加删除按钮（Popconfirm 二次确认），权限守卫：`isGlobalAdmin || (canDelete && 本部门)`
- **修改位置：** [adminService.ts](src/modules/admin/adminService.ts) + [InviteCodeManage.tsx](src/modules/admin/InviteCodeManage.tsx)
- **Commit:** `ab2cd87f`

### #7 全局移动端横向溢出 — 多个模块 Table/Modal/flex 导致页面撑破

- **日期：** 2026-07-12
- **类型：** 响应式缺陷（CSS + 组件配置）
- **严重程度：** 中（移动端体验差，需左右滑动才能看到完整内容，但不影响功能可用）
- **现象：** 权限管理、任务管理、论坛、学校信息、个人中心等多个模块在 768px 以下屏幕出现横向滚动条，页面内容超出视口宽度
- **根因：**
  1. **Table 缺 `scroll.x`**（3 处）：Ant Design Table 未设 `scroll.x`，在窄屏下无法启用内部横向滚动，表格直接撑破外层容器
  2. **Modal 固定 `width`**（11 处）：`width={600/640/700/720}` 等硬编码值超出手机屏宽 375px
  3. **CSS flex 容器缺 `flex-wrap`**（8 处）：pageHeader、cardHeader、postMeta、replyInput、layout 等 flex 行没有折行机制
  4. **固定宽度 Select**（1 处）：PostDetail 协作部门 Select `width: 360` 硬编码
  5. **Descriptions `column` 硬编码**（1 处）：TaskDetail `column={2}` 在小屏上挤扁内容
- **修复方案：**
  - Table：加 `scroll={{ x: 'max-content' }}`
  - Modal：引入 `Grid.useBreakpoint()`，`width={md ? N : undefined}`
  - CSS：为 `@media (max-width: 768px)` 添加 `flex-wrap: wrap` + `flex-direction: column`
  - Select：`style={{ width: md ? 360 : '100%' }}`
  - Descriptions：`column={md ? 2 : 1}`
- **修改位置：** 15 个文件，涉及 admin/tasks/forum/school/profile 五个模块
- **Commits:** `54169010` + `d5b92a03` + `0462b3b9`

### #3 老用户登录被邀请码校验拦截

- **日期：** 2026-07-02
- **类型：** Bug（逻辑错误）
- **严重程度：** 高（所有老用户无法登录）
- **现象：** 老用户登录时提示"邀请码无效或已被使用"，无法进入密码输入步骤
- **原因：** `handleStudentCheck()` 和 `handleTeacherCheck()` 先校验邀请码 `is_used = false`，再查学号是否存在。老用户的邀请码在注册时已标记为使用，直接被拦截
- **解决方案：** 调整逻辑顺序——先查学号是否存在，已注册用户跳过邀请码校验直接进入登录步骤。同样修复 `handleForgotVerify()`。
- **修改位置：** [src/modules/auth/LoginPage.tsx](src/modules/auth/LoginPage.tsx) — `handleStudentCheck`、`handleTeacherCheck`、`handleForgotVerify` 三个函数
- **Commit:** `4dc2212`

---

### #4 线上侧边栏不显示 + 部署不更新（重大教训）

- **日期：** 2026-07-05
- **类型：** 部署配置错误 + 问题定位经验教训
- **严重程度：** 高（线上功能完全不可用，持续多日）
- **现象：**
  1. 线上页面左侧栏消失，菜单不可见
  2. 所有代码推送后线上无变化
  3. 本地 `npm run dev` 完全正常
- **排查过程（走弯路）：**
  1. 反复修改 `AppLayout.tsx`：加 `hasSider` → 加 `flexDirection:'row'` → 改用 CSS Module
  2. 花了大量 token 检查权限逻辑、菜单过滤、CSS-in-JS、Ant Design 版本兼容性
  3. 代码改动全部正确，但线上始终不生效
- **真正根因：**
  1. GitHub Pages 源配置（Settings → Pages → Source）未正确指向 `gh-pages` 分支，导致无论 Actions 怎么构建推送，站点永远返回 6月25日的旧文件
  2. 旧版 `peaceiris/actions-gh-pages@v4` 工作流推送到 gh-pages 分支，但 GitHub Pages 根本没读那个分支
- **最终解决方案：**
  1. 改用 GitHub 官方部署方式：`actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`
  2. GitHub Pages Source 切换为 "GitHub Actions"
- **修改位置：** [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — 完全重写
- **Commits:** `62a5cdf` + `431baf6`
- **核心教训：**
  > ⚠️ **本地正常 + 线上异常 ≠ 代码有 bug。先查 CI/CD 是否真的部署成功了，再改代码。**
  >
  > 排查优先级：① 确认线上文件是否最新（检查 Last-Modified / JS 文件名） → ② 检查部署流水线 → ③ 最后才怀疑代码

---

## 待处理

### #2 antd Modal `destroyOnClose` 弃用警告

- **日期：** 2026-07-02
- **类型：** 弃用警告
- **严重程度：** 低（仅控制台警告，不影响功能）
- **现象：** 控制台输出 `[antd: Modal] destroyOnClose is deprecated. Please use destroyOnHidden instead.`
- **影响范围：** 14 个文件，14 处 `destroyOnClose`
- **修复方案：** 全局替换 `destroyOnClose` → `destroyOnHidden`

### #5 数据表 RLS 仍是「登录即全量放行」，缺细粒度策略

- **日期：** 2026-07-08（提出）· 2026-09-11（更新现状）
- **类型：** 安全隐患
- **严重程度：** 中（仅当攻击者知道 Supabase 项目 URL 且有技术能力直接调 REST API 时才可被利用）
- **现状（2026-09-05 安全加固后）：** 原来「16 张表仅 1 张启用 RLS」的问题**已解决第一层**——`supabase-migration.sql` 第十六部分已对全部业务表启用 RLS，`anon` 一律拒绝、`authenticated` 全量放行，登录前必需的 3 条匿名查询改走 `SECURITY DEFINER` 最小暴露函数。即：**拿到 anon key 已无法匿名读写任何业务数据**。
- **仍然存在的缺口：** 已登录用户之间没有行级隔离——任何登录用户直接调 REST API 仍可读写全部表（前端 `hasMinRole()` 只是 UI 层拦截，不构成边界）。数据库侧目前只有 `auth.role()` 粒度的策略。
- **修复方案（Phase 4 C2 细粒度 RLS）：** 引入辅助函数 `is_admin()` / `is_dept_head_of(dept)`，逐表按 SELECT/INSERT/UPDATE/DELETE 定义策略；兼容 `created_by IS NULL` 的历史数据；分两批（先读后写）上线，每批执行后跑全量 E2E + 三角色矩阵回归。
- **排期：** Phase 4（详见 `docs/plans/2026-09-06-全方位升级实施计划-v4.3至v4.6.md`），不在 v4.3.0 处理。

### #1 antd `message` 静态方法主题警告

- **日期：** 2026-07-02
- **类型：** 兼容性警告
- **严重程度：** 低（仅控制台警告，不影响功能）
- **现象：** 控制台输出 `[antd: message] Static function can not consume context like dynamic theme. Please use 'App' component instead.`
- **原因：** `message.success()` / `message.error()` 等静态方法无法访问 React Context
- **修复方案：** 引入 `<App>` 包裹根组件 + `App.useApp()` 获取 message 实例。改动面大，当前无动态主题需求，暂不处理

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
> 🔗 关联：[[2026-07-20-双视角全面审视报告]]（问题来源审视）
