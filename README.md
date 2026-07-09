# 🏛 学生会线上交流平台

> 为重庆邮电大学学生会（12 部门）构建的内部办公与交流平台

**🌐 线上地址：[yhllxy.github.io/student-union-platform](https://yhllxy.github.io/student-union-platform/)**

[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.1-646cff?logo=vite)](https://vite.dev/)
[![Ant Design](https://img.shields.io/badge/Ant_Design-6.4-0170fe?logo=antdesign)](https://ant.design/)
[![Supabase](https://img.shields.io/badge/Supabase-2.108-3ecf8e?logo=supabase)](https://supabase.com/)
---

## 📋 功能模块

| 模块 | 功能 | 亮点 |
|------|------|------|
| 🔐 **登录认证** | 学号 + 密码 + 部门邀请码注册，学生/教师双入口 | Supabase Auth，`users` 表关联 `auth.users` |
| ✅ **任务管理** | 发布/提交/审核/模板/里程碑/公告关联 | 看板拖拽（@dnd-kit）、乐观更新、Realtime 推送 |
| 📢 **部门公告** | 发布/置顶/关联任务/一键转任务 | 已读确认 UPSERT、已读/未读人名单 |
| 📊 **首页工作台** | 统计卡片 + 活动时间线 + 快捷操作 | Promise.all 并行查询、数据简报、月度报告 |
| 🏫 **学校信息** | 全校公告，独立于部门公告 | 校级范围广播 |
| 💬 **部门论坛** | 分类浏览/Markdown 发帖/知识库模板 | 实时讨论、文件附件 |
| 🎫 **活动抢票** | 发布/抢票/退票/我的票券 | 先到先得、自动反馈 |
| 👤 **个人中心** | 统计/热力图/排行榜/日历/通讯录 | 新人指南、成员目录 |
| ⚙️ **权限管理** | 成员角色/邀请码/工作看板 | 四级角色体系、细粒度权限 |
| 🔔 **通知中心** | Realtime 推送 + Bell Badge | 5 类自动触发、火后不理模式 |
| 📎 **文件上传** | Supabase Storage，拖拽上传 | 3 模块共享组件、类型白名单、10MB 限制 |
| 🔍 **全局搜索** | Ctrl+K 唤起，4 表并行搜索 | 300ms 防抖、关键词高亮、键盘导航 |

---

## 🧩 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.2 | 前端框架 |
| TypeScript | ~6.0 | 类型安全 |
| Vite | ^8.1 | 构建工具 |
| Ant Design | ^6.4 | UI 组件库 |
| Supabase | ^2.108 | PostgreSQL + Auth + Storage + Realtime |
| React Router | ^7.18 | 客户端路由（HashRouter） |
| dayjs | ^1.11 | 日期处理 |
| @dnd-kit/core | ^6.3 | 拖拽排序 |
| react-markdown | ^10.1 | Markdown 渲染 |

- **样式方案：** CSS Modules（`.module.css`）
- **部署：** GitHub Pages（HashRouter，base `/student-union-platform/`）

---

## 🏗 项目结构

```
src/
├── App.tsx                     # 根组件：auth 状态 + 懒加载路由
├── supabaseClient.ts           # Supabase 客户端初始化
├── components/                 # 全局组件
│   ├── AuthContext.tsx          #   AuthContext + useAuth() hook
│   ├── AppLayout.tsx            #   整体布局（侧边栏 + 内容区 + 全局搜索）
│   ├── GlobalSearch.tsx         #   全局搜索（Ctrl+K）
│   ├── globalSearchService.ts   #   搜索服务（4 表并行 ilike）
│   ├── FileUpload.tsx           #   文件上传（拖拽 + Supabase Storage）
│   ├── FileList.tsx             #   附件列表展示
│   ├── ErrorBoundary.tsx        #   全局错误边界
│   ├── ModuleErrorBoundary.tsx  #   模块级错误边界
│   └── FeedbackModal.tsx        #   反馈与建议
├── utils/
│   ├── constants.ts             # 12 部门、5 角色、任务状态等常量
│   └── helpers.ts               # hasMinRole()、formatDateTime() 等工具
├── diagnostics/                 # 诊断日志系统
└── modules/
    ├── auth/                    # 登录/注册/密码重置
    ├── dashboard/               # 首页工作台（统计/简报/时间线）
    ├── tasks/                   # 任务管理（看板/审核/里程碑）
    ├── notices/                 # 部门公告（已读确认/转任务）
    ├── school/                  # 学校信息
    ├── forum/                   # 部门论坛
    ├── profile/                 # 个人中心（通讯录/热力图/排行榜）
    ├── admin/                   # 权限管理
    ├── tickets/                 # 活动抢票
    └── notification/            # 通知中心
```

---

## 👥 角色权限体系

| 角色 | 等级 | 说明 |
|------|:--:|------|
| 常驻志愿者 `volunteer` | 0 | 执行任务、看公告帖子、看不含联系方式的通讯录 |
| 部门负责人 `dept_head` | 1 | 发布任务/公告、审核、编辑本部门指南、看联系方式 |
| 主席团成员 `presidium` | 2 | 跨部门管理、看全校数据 |
| 主席 `president` | 3 | 最高权限（同老师） |
| 老师 `teacher` | 3 | 最高权限、教师入口登录 |

- **权限判断：** `hasMinRole(user.role, 'dept_head')` 检查是否满足最低角色
- **管理员：** `isAdmin(role)` → `president || teacher`

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量（复制 .env.example 为 .env，填入 Supabase 项目信息）
cp .env.example .env

# 启动开发服务器
npm run dev        # → http://localhost:5173/student-union-platform/

# 生产构建
npm run build      # tsc -b && vite build

# 预览生产构建
npm run preview
```

### 环境变量

```env
VITE_SUPABASE_URL=https://bbyykrgitgawqwdgcxhp.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## 🗄 数据库

- **数据库：** Supabase PostgreSQL
- **Auth：** 邮箱 = `学号@stuunion.org`
- **Storage：** `attachments` bucket（公开读、认证写）
- **核心表：** `users` | `tasks` | `notices` | `forum_posts` | `tickets` | `notifications` | `platform_guides` 等 16 张
- **迁移文件：** [`supabase-migration.sql`](./supabase-migration.sql)（包含全部 DDL + RLS 策略）

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [开发规范](./开发规范.md) | 代码规范、模块结构、提交约定 |
| [CLAUDE.md](./CLAUDE.md) | AI 辅助开发上下文（全链路流程 + 性能铁律） |
| [技术设计文档](./docs/superpowers/specs/2026-06-24-学生会交流平台-技术设计文档.md) | 完整技术方案 |
| [实施计划](./docs/superpowers/plans/2026-06-24-学生会交流平台-实施计划.md) | 分阶段实施计划 |
| [经验教训](./docs/lessons-learned-phase1-5.md) | Phase 1-7 开发经验总结（12 条教训） |
| [问题跟踪](./docs/ISSUES.md) | 已知问题与修复记录 |
| [数据库迁移](./supabase-migration.sql) | 全部 SQL DDL + RLS 策略 |
| [邀请码参考](./docs/邀请码参考表.md) | 各部门邀请码（开发用） |
| [诊断指南](./docs/学生会交流平台-诊断系统操作指南.md) | 诊断日志系统使用方法 |

---

## 🔄 开发规范

### 性能铁律
- 所有独立查询必须 `Promise.all` 并行，禁止串行 `await`
- 所有列表查询必须带 `LIMIT`
- 禁止在 `.map()` / `for` 循环内调用 `supabase.from()`（N+1 反模式）
- 非关键操作（通知、日志）使用 fire-and-forget：`.catch(() => {})`

### 乐观更新
拖拽/标记已读等操作先改本地 state → 后台同步 → 失败回滚。必须用 `setState(prev => prev.map(...))`，禁止对象 mutation。

### Phase 自检清单
```
□ build: npm run build → 0 error
□ Promise.all: 无串行化 await
□ N+1: 无循环内查询
□ 角色矩阵: volunteer/dept_head/president 三视角验证
□ Realtime: cleanup 正确
```

---

## 📦 部署

推送 `master` 分支 → GitHub Actions 自动构建并部署到 GitHub Pages。

需确保仓库 Settings → Pages → Source 设置为 **GitHub Actions**。

---

## 📋 更新日志

| 日期 | 版本 | 内容 |
|------|------|------|
| 2026-07-09 | v2.2 | **性能优化** — Promise.all 并行化 4 处串行 await、React.memo 看板组件、useMemo 优化、N+1 批量重构 admin 工作摘要 |
| 2026-07-09 | v2.1 | **性能优化** — useMemo 优化列表筛选 + 提取 FileUpload/FileList 重复工具函数 |
| 2026-07-08 | v2.0 | **7 项功能增强** — 通知中心、公告已读确认、首页工作台、任务看板、文件上传、数据简报、全局搜索 |
| 2026-07-02 | v1.1 | **4 项增强** — 智能通讯录、任务里程碑、部门新人指南、公告一键转任务 |
| 2026-06-24 | v1.0 | **初始版本** — 登录认证、任务管理、部门公告、部门论坛、活动抢票、权限管理、个人中心 |

---

## 📝 License

MIT
