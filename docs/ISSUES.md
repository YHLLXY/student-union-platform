# 问题跟踪

> 学生会线上交流平台 — 已知问题、警告、Bug 记录与修复记录

---

---

## 已修复

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

### #5 大部分数据表未启用 RLS 行级安全

- **日期：** 2026-07-08
- **类型：** 安全隐患
- **严重程度：** 中（仅当攻击者知道 Supabase 项目 URL 且有技术能力直接调 REST API 时才可被利用）
- **现象：** 16 张数据表中，仅 `platform_guides` 启用了 RLS。其余 15 张表（`users`、`tasks`、`task_submissions`、`notices`、`school_notices`、`forum_posts`、`forum_replies`、`tickets`、`ticket_records`、`invite_codes`、`task_templates`、`task_milestones`、`department_guides`）均未启用 RLS
- **风险：** 前端 JS bundle 中暴露了 Supabase anon key，任何人拿到后可绕过 UI 层权限判断，直接通过 REST API 读写所有未启用 RLS 的表
- **当前缓解措施：** 前端 `hasMinRole()` 在 UI 层做了权限控制，普通用户的操作入口已被阻挡。且攻击者需具备一定的技术能力才能利用此漏洞，对于当前学生会内部平台场景实际风险较低
- **修复方案：** 为全部 16 张表设计完整 RLS 策略（SELECT / INSERT / UPDATE / DELETE），按角色权限逐表定义。参考 `supabase-migration.sql` Part 4 中已注释的初版策略。注意：启用 RLS 后需全功能回归测试，部分联表查询可能因 `auth.uid()` 不匹配而静默失败
- **暂不处理原因：** 工作量较大（16 张表 × 4 种操作 = 60+ 条策略），当前阶段功能完善优先级更高。后续平台面向公网或存储敏感数据时再处理

### #1 antd `message` 静态方法主题警告

- **日期：** 2026-07-02
- **类型：** 兼容性警告
- **严重程度：** 低（仅控制台警告，不影响功能）
- **现象：** 控制台输出 `[antd: message] Static function can not consume context like dynamic theme. Please use 'App' component instead.`
- **原因：** `message.success()` / `message.error()` 等静态方法无法访问 React Context
- **修复方案：** 引入 `<App>` 包裹根组件 + `App.useApp()` 获取 message 实例。改动面大，当前无动态主题需求，暂不处理
