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
