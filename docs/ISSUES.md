# 问题跟踪

> 学生会线上交流平台 — 已知问题、警告、Bug 记录与修复记录

---

---

## 已修复

### #17 正式库缺第十九部分（Phase 3 数据层）—— 论坛/资料/引导在线上是坏的（已修复）

- **日期：** 2026-09-12（Phase 4 验收表暴露 → `npm run probe:db` 确认 → 同日用户执行补跑）
- **类型：** 部署遗漏 / 数据层
- **严重程度：** 高（不是潜在风险，是已经发生过的功能故障）
- **现象：** 线上 `forum_likes` / `forum_bookmarks` 两张表不存在，`forum_posts.pinned_at / reply_count /
  like_count`、`users.onboarded / contact_phone / contact_email` 六个列也不存在。于是：
  | 页面 | 表现 | 原因 |
  |------|------|------|
  | 部门论坛 | 「帖子加载失败」（列表整条查询被拒） | 列表按 `pinned_at` 排序，该列不存在 → PostgREST `42703` |
  | 帖子点赞 / 收藏 | 点下去报错、计数不动 | 表不存在（`PGRST205`） |
  | 个人中心 → 编辑资料 | 保存失败 | 更新体固定带 `contact_phone / contact_email` |
  | 新人引导 | 走完落库失败、下次登录可能再弹 | `onboarded` 列不存在 |
- **根因：** 第十九部分的脚本（`supabase-phase3-v4.5.0.sql`）交付时标为「待用户执行」，之后一直没执行，
  而**当时没有任何机器可查的证据**能发现这一点。同期的第十八部分（Phase 2）、第二十部分（Phase 4）都已正确落地。
- **修复：** 用户在项目 `bbyykrgitgawqwdgcxhp` 执行了 `supabase-phase3-v4.5.0.sql`；
  `npm run probe:db` 复验：第十八 / 十九 / 二十部分全部 `[OK]`（8 项缺失已清零）。
- **防复发：** 新增只读自检 `scripts/probe-schema.mjs`（`npm run probe:db`，只用 anon key 探测表/列是否存在）；
  `supabase-verify-v4.6.0.sql` 增加 1.1b 前置对象核对，并在对象缺失时让第二段整体 `[跳过]`；
  探测撞到 `42P01/42703` 不再算作「被拒绝」；第二十部分验收表把「表不存在」与「策略缺失」分开报。
  迭代总结的经验 14 记录了这次「无证据交接」的完整教训。
- **遗留：** 策略级自证仍需跑一次 `supabase-verify-v4.6.0.sql`（见计划文档 §十一 用户动作 2）。

### #2 antd `destroyOnClose` / `Alert message` 弃用警告（已清）

- **日期：** 2026-07-02（提出）· 2026-09-11（修复）
- **类型：** 弃用警告
- **严重程度：** 低（仅控制台警告，不影响功能）
- **修复：** 两批实操——
  - `destroyOnClose` → `destroyOnHidden`：Phase 1 B5 全量替换（现 `grep -rc destroyOnClose src/` 为 0）；
  - `Alert message` → `Alert title`：v4.4.0 全量替换（IdentityForm / LoginPage / ErrorBoundary / ModuleErrorBoundary 共 4 处，均为新代码触发警告时顺手清掉的存量）。
- **备注：** 同族的 `Drawer width/height` 弃用见 #11，尚未清理。

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

**第二轮（2026-09-12，v4.6.1）—— 残留漏网点收口：**

- **现象：** 第一轮修的是「配置类」漏网（Table/Modal/断点），本轮基线发现真正的残留是三类「内容与行级」问题。375px 视口基线实测 5 个页面溢出：任务管理 446px、权限管理（邀请码行）698px、个人中心 411px、论坛长串帖子详情（弹窗内）917px、登录页 380px——其中**登录页是首轮完全未记录过的**（根因见下）。
- **根因（5 类）：**
  1. 页头控件行不换行：TaskListPage 按钮行（446px）、InviteCodeManage 筛选行（620px）、WorkOverview/PointsPanel 的 Card 头（antd `-head-title` 自带 nowrap+ellipsis，标题被截断而非溢出，门禁量不到但肉眼可见）
  2. 表格漏 `scroll.x`（3 处）：WorkOverview 积分排行、TicketDetailDrawer 签到名单、AnalyticsDashboard 最近错误
  3. 用户生成内容无断词：论坛 Markdown 正文（长 URL/无空格串/代码块 100% 撑破）、公告/校通知/活动说明 pre-wrap 容器、TaskDetail 交接备注——全库此前仅 guide.module.css 一处有 `overflow-wrap`
  4. ProfilePage `Descriptions column={2}` 未按断点降列（首轮只修了 TaskDetail）
  5. **登录页溢出 10px 的隐藏根因：本项目自定义 CSS 没有全局 `box-sizing: border-box` 重置**（antd 组件自带、普通 div 默认 content-box），`.loginCard` 的 `max-width:100%` 之后 padding+border 又叠加在外面
- **修复：** 页头/控件行 `flexWrap:'wrap'`（3 处）+ 两张积分卡头折行（`:global(.ant-card-head-wrapper/-head-title)`）；3 表补 `scroll.x`；正文容器补 `overflow-wrap:anywhere`（forum/notices/school/tickets/TaskDetail，代码块与表格保留内部横滚）；`column={md?2:1}`；`.loginCard` 补 `box-sizing:border-box`。**全部零 DDL、零 Service、零路由、零新依赖。**
- **防回归：** 新增 `tests/e2e/mobile-overflow.spec.ts` 门禁——375px 视口遍历 8 高频页 + 长串样例帖详情，断言 document/contentArea/弹窗遮罩三层 `scrollWidth <= clientWidth+1`，已进 CI test job；每次运行生成 `docs/mobile-overflow-report.md`。首轮基线 5 页溢出 → 本轮全绿。
- **Commits:** 代码 `15f0c236e` + 文档（本条）

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

### #12 antd `List` 组件弃用警告

- **日期：** 2026-09-12（v4.5.0 E2E 控制台实测发现）
- **类型：** 弃用警告
- **严重程度：** 低（仅控制台警告，不影响功能）
- **现象：** 控制台输出 `Warning: [antd: List] The List component is deprecated. And will be removed in next major version.`
- **影响范围：** 1 处——[DashBoardPage.tsx:2](src/modules/dashboard/DashBoardPage.tsx#L2) 引入并使用了 antd `List`
- **修复方案：** 该处是简单的竖向条目列表，直接换成 `<div>` + flex（或复用项目已有骨架/空态组件），不必引入替代库
- **排期：** 与其余 antd 6 清理（#1、#11）合并做一轮，不影响功能

### #11 antd Drawer `width` / `height` 弃用警告

- **日期：** 2026-09-11（v4.4.0 开发中实测发现）
- **类型：** 弃用警告
- **严重程度：** 低（仅控制台警告，不影响功能）
- **现象：** 控制台输出 `[antd: Drawer] width is deprecated. Please use size instead.`（`height` 同理）
- **影响范围：** 存量各处 `<Drawer width={n}>`（GuideDrawer、NotificationBell、AppLayout 等）；**v4.4.0 新增的票务详情 Drawer 已直接用 `size={480}`**，未新增该警告
- **修复方案：** 存量的 `width` / `height` → `size`（antd 6 的 `size` 接受 `number | string`，语义等价）
- **排期：** 与其余 antd 6 清理（#1）合并做一轮，不影响功能

### #5 数据表 RLS 仍是「登录即全量放行」，缺细粒度策略

- **日期：** 2026-07-08（提出）· 2026-09-05（第一层）· 2026-09-12（**收口完成**）
- **类型：** 安全隐患
- **严重程度：** 原为「中」，现已降为「低」
- **进展（2026-09-12，v4.6.0 第二十部分）：** 已落地细粒度 RLS——14 张原本挂着
  `authenticated_full_access FOR ALL USING(true)` 的表全部改为逐操作策略（17 张表共 50+ 条），
  并新增 8 个策略辅助函数（`my_department` / `is_admin` / `is_presidium` / `is_dept_head_of` /
  `can_view_post` / `can_manage_post` / `can_view_task` / `can_review_task`）。
  **写侧是这次的重点**：改前任何登录用户直接打 REST 就能 `PATCH users` 把自己写成 president、
  删光 tasks/notices；现在 `role`/`department` 的变更被守卫触发器锁到管理员、
  `users` 表**没有 INSERT 策略**（注册只能走 `register_user()`，角色由邀请码推导）。
  顺带审计了 RPC 的 EXECUTE 授权：实测 anon 能调 `role_level`/`is_organizer`/`semester_of`/
  `check_in_ticket`/`ticket_qr_token`（Supabase 的默认授权），已逐个 REVOKE。
- **仍然存在的两类缺口（**有意保留**，见第二十部分注释）：**
  1. **5 张表读侧仍全量**：`users`（通讯录要读全员）、`tasks`（通讯录里「他人任务计数」要读全校）、
     `tickets`/`ticket_records`（人人都要算剩余票数）、`school_notices`（本就是全员可见）。
     按部门收紧会让这些页面**静默少数据**而不是报错，比不收紧更危险。
     → 真收的落法：把「他人任务计数」改成聚合 RPC `member_task_counts()`，
     剩余票数改成 `ticket_remaining(p_ticket)`，票券名单改成 `ticket_roster(p_ticket)`（见 #14）。
  2. **`users` 的 SELECT 无法按列可见**：`contact_phone` / `contact_email` 现在仍对全体登录用户可读
     （前端靠页面级权限规则不显示）。列级 RLS 在 Postgres 里不存在；列级 `GRANT` 又会让现有的
     `select('*')` 直接报权限错。要收得改成「视图 + 只暴露非敏感列」。
- **验收方式：** `supabase-verify-v4.6.0.sql`（角色冒充自证：结构核对 + allow/deny 矩阵，
  在事务里 `SET ROLE authenticated` 逐条撞策略，末尾 `ROLLBACK`）。

### #16 部署产物缺少「构建来源」标识（建议下轮做）

- **日期：** 2026-09-12（Phase 4 线上复测时发现）
- **类型：** 工程效率
- **严重程度：** 低
- **现象：** 想确认「线上跑的到底是哪次提交」时，只能靠 `version.json` 的版本号 + CI 运行状态推断。
  而同一个版本号可能对应多次提交（本轮就推了 1 次，历史上一个版本也常有多个 commit），
  另外**跨平台构建的 chunk 哈希并不一致**（实测 CI/Linux 与本地/Windows 的懒加载 chunk 名不同，
  入口静态引用的 13 个则一致），所以「对比 chunk 哈希」这条老办法会给出假的「部署不是最新的」警报。
- **建议落法（约 10 行）：** 在 `deploy.yml` 的 build 步之后生成一个 `dist/build-info.json`
  （`commit` / `built_at` / `chunk_count`），线上 `curl .../build-info.json` 即可一句话确认来源；
  或退一步，把 `version.json` 的 `date` 后面带上 commit 短哈希（前端读版本时一并展示）。
- **排期：** 下轮（与 antd 6 清理合并做也行）

### #13 忘记密码 = 「知道姓名 + 学号即可改密码」（高危，需产品决策）

- **日期：** 2026-09-12（Phase 4 C2 审计中发现）
- **类型：** 安全隐患
- **严重程度：** **高**（可匿名接管任意账号，含主席 / 老师）
- **现象：** 登录页「忘记密码」的身份证明只有「姓名 + 学号」两项，链路是
  `verify_user_identity(name, student_id)`（anon 可调，返回该用户的 `auth_id`）→
  `reset_user_password(auth_id, new_password)`（anon 可调）→ 密码被改。
  学号是可在通讯录里查到的半公开信息，因此**未登录的攻击者知道一个人的姓名与学号即可改其密码**。
- **为什么本轮没改：** 这不是 RLS 能解决的问题（是 RPC 授权 + 产品流程），
  且收紧会**直接让「忘记密码」这个功能不可用**——属于必须由你决定的产品取舍，不擅自改。
- **可选修法（按代价从低到高）：**
  1. **加第二因子**：重置时除姓名/学号外再要求该账号的**邀请码**（或任一未使用的邀请码）；
  2. **改为一次性重置码**：用户申请后由部门负责人线下告知一个 6 位码，码有时效、一次性；
  3. **改用真实邮箱**：目前登录邮箱是合成的 `学号@stuunion.org`（无真实收件箱），
     改真实邮箱才能走 Supabase 自带的邮件重置。
- **附带结论：** 无论如何，`reset_user_password` 都值得加一条审计记录（谁在什么时候重置了谁），
  这样异常重置（例如一晚上重置 30 个账号）能被发现。

### #14 读侧 RLS 收紧的前置改造（三处聚合 RPC）

- **日期：** 2026-09-12（Phase 4 C2 记录，**下轮候选**）
- **类型：** 安全增强 / 性能
- **严重程度：** 低（现状不构成越权：这些数据本就是内部成员可读的）
- **要做的事：** 把三处「为了算一个数而读全表」的前端查询改成数据库聚合函数，随后才能收紧读策略：
  | 现状 | 改成 | 收益 |
  |------|------|------|
  | `profileService.fetchAllMembers` 里 `.in('assigned_to', 全员id)` 数每个人的任务 | `member_task_counts()` 返回 (user_id, total, overdue) | 通讯录少读上千行 + 可按部门收紧 `tasks` 的 SELECT |
  | `ticketService.fetchTickets` 对每个活动做 `ticket_records` 的 head count | `ticket_remaining(p_ticket uuid)` | 剩余票数不再依赖「读得到全部票券行」 |
  | `ticketService.fetchTicketRoster` 读某活动的全部持票人（含姓名+学号） | `ticket_roster(p_ticket uuid)` 内做组织者校验 | 学号姓名不再对全体登录用户可读 |
- **顺带：** `users.contact_phone` / `contact_email` 的「按列可见」需要视图方案（见 #5 缺口 2）。

### #15 无障碍：对比度问题的批量修复（serious 级，需你点头）

- **日期：** 2026-09-12（Phase 4 C3 审计产出）
- **类型：** 无障碍 / 视觉
- **严重程度：** 中（读屏可用；但低视力用户在浅色主题下读小字吃力）
- **现状：** `critical` 级已清零（8 个 antd Select 缺可访问名，已用 `aria-label` 修掉，
  见 `tests/e2e/a11y.spec.ts` 门禁）；**`serious` 级尚有 5 页命中 color-contrast，共约 129 个节点**，
  最集中在个人中心（81）、任务管理（16）、工作台（15）。
- **根因：** `src/styles/variables.css` 的浅色主题令牌取值低于 WCAG AA 4.5:1：
  `--text-secondary: #7f8c8d`（约 3.5:1）、`--text-tertiary: #95a5a6`（约 2.5:1）、
  `--text-disabled: #bdc3c7`（约 1.8:1）。另有 antd 自身的 `ant-statistic-title` /
  `ant-select-placeholder` / `ant-tag` / `ant-btn-dangerous` 配色。
- **需要你决定：** 修它要动**全局次要文字颜色**（把上面三个令牌调深，例如
  `#5f6b6d` / `#6b7477` / `#8b9295`），这会让全站「次要文字」都变深一点——
  属于可见的视觉变更，按项目禁令不擅自改。
- **不动的代价：** 只影响低视力/强光环境下的可读性，不影响功能；
  报告随每轮自动生成在 `docs/a11y-audit.md`，可直接对着改。

### #1 antd `message` 静态方法主题警告

- **日期：** 2026-07-02
- **类型：** 兼容性警告
- **严重程度：** 低（仅控制台警告，不影响功能）
- **现象：** 控制台输出 `[antd: message] Static function can not consume context like dynamic theme. Please use 'App' component instead.`
- **原因：** `message.success()` / `message.error()` 等静态方法无法访问 React Context
- **修复方案：** 引入 `<App>` 包裹根组件 + `App.useApp()` 获取 message 实例。改动面大，当前无动态主题需求，暂不处理

### #18 年度热力图：月份标签与格子是两个独立滚动容器，横滑会错位

- **日期：** 2026-09-12（v4.6.1 移动端排查中发现，属体验问题而非溢出，故本轮不修）
- **严重程度：** 低（功能可用，仅横滑时月份对不上格子）
- **现象/原因：** `TaskCalendar.tsx` 的月份标签行与格子行各自套了 `overflow-x:auto`（`profile.module.css` 两处），滑一条另一条不动。
- **修法建议：** 把两行放进同一个滚动容器（或 onScroll 互相同步）。改动集中在 profile 模块，动前先跑 375px 门禁与热力图相关 E2E。

### #19 自定义 CSS 无全局 `box-sizing: border-box` 重置（v4.6.1 登录页溢出的隐藏根因）

- **日期：** 2026-09-12
- **严重程度：** 中（潜伏类：每个自定义固定宽度 + padding 的元素都是潜在溢出点）
- **背景：** antd 组件自带 border-box 重置，但项目自定义样式（`.module.css` 里的普通 div）默认 content-box——`.loginCard` 的 `max-width:100%` 之后 padding+border 叠加在外面，375px 屏溢出 10px（v4.6.1 已对该元素点状补 `box-sizing`）。
- **为什么不本轮全局重置：** `*,::before,::after{box-sizing:border-box}` 会改变全部既有自定义盒子的尺寸语义，桌面端可能出现肉眼可见的布局位移，与「不破坏现有布局」红线冲突。
- **建议做法：** 下轮专项：全局加重置 → 桌面 1280/平板 768/手机 375 三档截图对比 → 逐处修正位移；有 mobile-overflow 门禁兜底，回归风险可控。

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
> 🔗 关联：[[2026-07-20-双视角全面审视报告]]（问题来源审视）
