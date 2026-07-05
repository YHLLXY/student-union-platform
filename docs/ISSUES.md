# 问题跟踪

> 学生会线上交流平台 — 已知问题、警告、Bug 记录与修复记录

---

## 已修复

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

### #1 antd `message` 静态方法主题警告

- **日期：** 2026-07-02
- **类型：** 兼容性警告
- **严重程度：** 低（仅控制台警告，不影响功能）
- **现象：** 控制台输出 `[antd: message] Static function can not consume context like dynamic theme. Please use 'App' component instead.`
- **原因：** `message.success()` / `message.error()` 等静态方法无法访问 React Context
- **修复方案：** 引入 `<App>` 包裹根组件 + `App.useApp()` 获取 message 实例。改动面大，当前无动态主题需求，暂不处理
