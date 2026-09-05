# 学生会线上交流平台

> 重庆邮电大学学生会内部办公与交流平台 —— 集任务管理、部门公告、论坛、活动抢票、数据分析于一体的 PWA 应用。

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8_(Rolldown)-646cff?logo=vite&logoColor=white)
![Ant Design](https://img.shields.io/badge/antd-6-1677ff?logo=antdesign&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_Auth_+_Realtime-3fcf8e?logo=supabase&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-ff4154)
![PWA](https://img.shields.io/badge/PWA-可安装_·_离线可用-5a0fc8?logo=pwa&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 目录

- [项目简介](#项目简介)
- [功能总览](#功能总览)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [Supabase 后端配置](#supabase-后端配置)
- [部署](#部署)
- [PWA 与发版流程](#pwa-与发版流程)
- [角色与权限体系](#角色与权限体系)
- [设计亮点](#设计亮点)
- [文档索引](#文档索引)
- [版本历史](#版本历史)

---

## 项目简介

这是一个为高校学生会量身打造的内部协作平台，解决学生会日常运营中的几个核心痛点：

| 痛点 | 平台方案 |
|------|---------|
| 任务靠群聊派发，进度无人追踪 | 看板式任务管理 + 提交/审核流 + 逾期自动标记 + 首页待办聚合 |
| 公告发完石沉大海，不知道谁没看 | 公告已读确认机制（notice_reads），发布者可查看已读名单 |
| 校级通知散落在 QQ 群 / 邮件 | 学校信息模块统一聚合校级通知 |
| 活动抢票靠接龙，先到先得全凭手速 | 数据库 RPC 原子扣票，并发安全，杜绝超卖 |
| 部门经验无法沉淀 | 部门论坛（Markdown）+ 部门工作指南 + 平台使用指南 |
| 干事积极性难量化 | 活跃热力图、积分排行榜、使用数据埋点分析 |

平台以 **PWA** 形态交付：手机可安装到桌面、静态资源离线可用、发版后自动提示更新。全站支持**亮 / 暗 / 跟随系统**三种主题模式。

> ⚠️ 本平台仅限学生会内部成员使用，注册需要部门管理员发放的邀请码。

---

## 功能总览

### 核心模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 🏠 **首页工作台** | `/dashboard` | 统计卡（数字滚动动效）、待办聚合（待审核 + 已逾期任务直达处理）、部门最近动态、个人周简报 |
| ✅ **任务管理** | `/tasks` | 看板视图拖拽流转（@dnd-kit，乐观更新）、任务模板一键创建、里程碑跟踪、成果提交与审核、逾期红标、Realtime 实时同步 |
| 🔔 **部门公告** | `/notices` | 部门公告发布（支持附件、关联任务）、已读确认、置顶 |
| 🏛 **学校信息** | `/school` | 校级通知聚合浏览与发布 |
| 💬 **部门论坛** | `/forum` | Markdown 帖子与回复、分类浏览、全局搜索覆盖 |
| 🎫 **活动抢票** | `/tickets` | RPC 原子抢票（并发安全）、个人持票记录、管理员放票 |
| ⚙️ **权限管理** | `/admin` | 成员管理（角色/部门调整）、邀请码生成与回收、使用数据看板（AnalyticsDashboard）、工作总览 |
| 👤 **个人中心** | `/profile` | 活跃热力图、积分排行榜、成员通讯录、任务日历、密码修改 |

### 全局能力

| 能力 | 说明 |
|------|------|
| **通知中心** | 站内通知铃铛（Popover + 抽屉双形态，移动端自适应）、Realtime 推送、未读角标 |
| **全局搜索** | 顶栏搜索，聚合检索公告 / 任务 / 帖子 / 校级通知（单源失败静默降级） |
| **文件上传** | Supabase Storage 托管，类型白名单校验 + 图标着色预览 |
| **平台指南** | 平台使用指南 + 部门工作指南（Markdown 渲染，抽屉阅读） |
| **暗色模式** | 亮 / 暗 / 跟随系统三态切换，首帧防闪烁，全模块适配 |
| **PWA** | 可安装、离线缓存（静态资源 cache-first / HTML network-first / API 仅网络）、新版本更新提示、安装引导按钮 |

---

## 技术栈

| 分类 | 选型 | 版本 | 备注 |
|------|------|------|------|
| UI 框架 | React | 19 | 函数组件 + Hooks |
| 语言 | TypeScript | 6.0 | `strict`，Supabase 全链路端到端类型 |
| 构建工具 | Vite (Rolldown) | 8 | `output.codeSplitting.groups` 语义化分包 |
| 组件库 | Ant Design | 6 | Design Token 主题体系 + `darkAlgorithm` |
| 服务端状态 | TanStack Query | 5 | 统一缓存 / 失效 / 乐观更新 |
| 后端 | Supabase | — | Postgres + Auth + Realtime + Storage，零自建服务 |
| 动效 | motion | 13 | `LazyMotion` 按需加载，封装层统一出口 |
| 拖拽 | @dnd-kit | 6 | 任务看板 |
| Markdown | react-markdown | 10 | 论坛与指南 |
| 路由 | react-router-dom | 7 | 懒加载 + 模块级错误边界 |
| 代码规范 | oxlint | 1.x | 0 warnings 0 errors |
| PWA | 手写 Service Worker | — | 版本化缓存策略，不依赖生成器 |

---

## 系统架构

### 目录结构

```
student-union-platform/
├── public/
│   ├── manifest.json        # PWA 清单
│   ├── sw.js                # 手写 Service Worker（版本化缓存）
│   ├── version.json         # 发版版本号 + 更新公告文案
│   └── icon-*.svg           # PWA 图标
├── supabase-migration.sql   # 全量数据库迁移脚本（17 张表 + RLS + RPC）
├── src/
│   ├── main.tsx             # 应用入口：Providers 装配（RQ / 主题 / 动效）
│   ├── App.tsx              # 路由表 + 会话管理（onAuthStateChange）
│   ├── supabaseClient.ts    # Supabase 客户端（createClient<Database>）
│   ├── theme.ts             # antd 双主题构建器（亮/暗算法）
│   ├── types/
│   │   └── database.ts      # 手写 17 表 Database 类型（Row/Insert/Update/Relationships）
│   ├── lib/
│   │   ├── sb.ts            # 服务层错误约定：unwrap / unwrapMaybe / unwrapCount
│   │   └── queryClient.ts   # TanStack Query 全局配置
│   ├── components/
│   │   ├── common/          # 通用 UI 组件（StatCard / EmptyState / PageHeader）
│   │   ├── motion/          # 动效封装层（唯一出口：FadeIn / StaggerGroup / CountUpNumber）
│   │   ├── AppLayout.tsx    # 应用骨架（侧边栏 / 顶栏 / 搜索 / 通知 / 主题切换）
│   │   └── ...              # 全局搜索 / 文件上传 / 骨架屏库 / 错误边界 / PWA 按钮
│   ├── theme/
│   │   └── ThemeModeProvider.tsx  # 亮/暗/跟随系统三态管理
│   ├── modules/             # ★ 按业务域划分的功能模块
│   │   ├── auth/            # 登录 / 注册 / 忘记密码 / 开发者入口
│   │   ├── dashboard/       # 首页工作台
│   │   ├── tasks/           # 任务管理（看板）
│   │   ├── notices/         # 部门公告
│   │   ├── school/          # 学校信息
│   │   ├── forum/           # 部门论坛
│   │   ├── tickets/         # 活动抢票
│   │   ├── admin/           # 权限管理 / 数据分析
│   │   ├── profile/         # 个人中心
│   │   ├── notification/    # 通知中心
│   │   └── guide/           # 平台与部门指南
│   ├── utils/               # constants / roleUtils / fileUtils / helpers
│   └── styles/              # CSS 变量（含 [data-theme='dark'] 全量覆盖）
└── docs/
    ├── plans/               # 迭代实施计划
    ├── research/            # 技术调研沉淀（7 篇 + 索引）
    └── *-迭代总结.md         # 各版本交付总结
```

### 数据分层约定

```
组件（useQuery / useMutation）
        │  queryKey 缓存 · invalidateQueries · setQueryData 乐观更新
        ▼
服务层（*Service.ts）
        │  读函数：失败即抛 SbError（unwrap 系列封装，终结静默空列表）
        │  写函数：返回 boolean / null，错误交给 UI 层提示
        ▼
Supabase 客户端（createClient<Database>）
        │  端到端类型检查：表 / 列 / 嵌套查询全部类型安全
        ▼
PostgreSQL（RLS 行级安全 + Realtime + RPC）
```

分层规则（成文于 `docs/research/06`）：

- **路由级读数据必须走 TanStack Query**，禁止组件内裸 `useEffect + setState` 拉取；
- **Realtime 订阅只做失效**（`invalidateQueries`），不手工拼装数据；
- **弹窗数据允许命令式获取**，但必须 `.catch` 兜底；
- **聚合搜索允许单源降级**（全局搜索某源失败不影响其余结果）。

---

## 快速开始

### 环境要求

- Node.js ≥ 20
- npm ≥ 10
- 一个 Supabase 项目（免费套餐即可）

### 1. 克隆与安装

```bash
git clone https://github.com/YHLLXY/student-union-platform.git
cd student-union-platform
npm install
```

### 2. 配置 Supabase 后端

1. 在 [Supabase](https://supabase.com) 创建项目；
2. 打开 Dashboard → **SQL Editor**，将 [`supabase-migration.sql`](./supabase-migration.sql) **逐段**复制执行（脚本内含 14 个带注释的部分：建表 → 存储过程 → 种子数据 → RLS → 历次增强）；
3. 在 **Authentication → URL Configuration** 中将站点地址加入 Redirect URLs；
4. （可选）开启 Storage Bucket 用于公告附件上传。

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填入：

```bash
VITE_SUPABASE_URL=https://<your-project>.supabase.co   # Supabase 项目地址
VITE_SUPABASE_ANON_KEY=<your-anon-key>                  # Supabase 匿名密钥
VITE_DEV_KEY=<自定义开发者入口密钥>                       # 登录页开发者快捷入口，可不配
```

> 前两者均为客户端公开变量（anon key 受 RLS 策略保护），但仍建议不要提交真实值。

### 4. 启动

```bash
npm run dev       # 开发服务器
npm run build     # 类型检查 + 生产构建
npm run lint      # oxlint 代码检查
npm run preview   # 本地预览生产构建
```

首次使用：在 Supabase SQL Editor 中向 `invite_codes` 表插入若干邀请码（迁移脚本第三部分含示例种子数据），然后用邀请码在登录页注册账号。管理员可将某成员角色提升为 `teacher` / `president` 以获得最高权限。

---

## 部署

项目通过 GitHub Actions 自动部署到 **GitHub Pages**（工作流：[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）：

1. push 到 `master` 分支触发；
2. `npm ci && npm run build`（Supabase 密钥从仓库 Secrets 注入，需配置 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`）；
3. 构建产物上传并发布到 Pages。

注意事项：

- 应用 base path 为 `/student-union-platform/`（`vite.config.ts` 与 `manifest.json` 的 `start_url` / `scope` 保持一致），如部署到自有域名根路径需同步修改；
- SPA 路由由 Service Worker 的 HTML 网络优先策略兜底，刷新不 404。

---

## PWA 与发版流程

Service Worker 采用**版本化缓存**策略：

| 请求类型 | 策略 |
|----------|------|
| HTML（导航请求） | 网络优先，失败回退缓存 |
| 静态资源（JS/CSS/图片） | 缓存优先，离线可用 |
| Supabase API | 仅网络，不缓存 |

**发版铁律**：每次发版必须同步更新三处版本号，否则线上用户收不到更新提示：

```
package.json "version"     ←→     public/version.json (version + changelog)     ←→     public/sw.js CACHE_VERSION
```

更新后：新 SW 安装 → `skipWaiting` → 激活并清理旧缓存 → 前端检测到 `version.json` 变化 → 弹出更新公告（`useVersionNotification`）。

---

## 角色与权限体系

四级角色层级（`src/utils/constants.ts` → `ROLE_LEVEL`），权限判断统一走 `hasMinRole()`：

| 角色 | 等级 | 能力 |
|------|------|------|
| `volunteer` 干事 | 0 | 浏览全部内容、认领任务、提交成果、抢票、论坛发言 |
| `dept_head` 部长 | 1 | 发布公告/任务、审核提交、生成部门邀请码、进入权限管理 |
| `presidium` 主席主任团 | 2 | 跨部门管理、全校性通知发布 |
| `president` / `teacher` / `developer` | 3 | 最高权限：成员角色调整、数据看板、系统级配置 |

- 注册身份由**邀请码**决定部门与角色（学生走部门邀请码，教师走教师邀请码）；
- 数据安全依赖 Supabase **RLS 行级安全策略**，前端权限控制仅负责 UI 隐藏，越权请求在数据库层被拒绝；
- 抢票使用 Postgres **RPC 存储过程**原子扣减库存，天然防并发超卖。

---

## 设计亮点

### 1. 语义化分包（Vite 8 / Rolldown）

通过 sourcemap 字节审计定位到"伪 vendor"问题（801KB 大杂烩 chunk 位于首屏关键路径）后，使用 Rolldown 取代 `manualChunks` 的新 API `output.codeSplitting.groups` 实现六组语义化分包（react-core / supabase / antd / motion / markdown / vendor），antd 组开启 `entriesAware` 让页面专属重型组件按需裂解。**入口业务代码 448KB → 65KB**，最大 chunk 降至 386KB 且哈希稳定可长缓存。

### 2. 端到端类型安全（不依赖 CLI 的手写 Database 类型）

手工编写 17 张表的 `Row / Insert / Update` 与字面量外键 `Relationships`，`createClient<Database>` 后所有查询（含嵌套关联查询）全部类型检查，服务层清零 `as unknown as` 强转。关键经验：**双外键关联表必须用 `别名:目标表!列名()` 语法提示**（FK 名提示反而不被支持），过程记录见 [docs/research/06](docs/research/06-Supabase类型与TanStackQuery实践.md)。

### 3. 服务层错误约定 + TanStack Query 数据层

读函数"失败即抛"（`unwrap / unwrapMaybe / unwrapCount` 三件套），终结"接口失败但页面显示空列表"的静默错误；全部路由级读数据迁移至 `useQuery`，看板拖拽与通知已读走 `setQueryData` 乐观更新，Realtime 订阅只负责失效缓存。迁移过程中顺带修复了两个真实存量 bug（个人页统计恒为 0 等）。

### 4. 暗色模式双轨同步

antd `theme.darkAlgorithm`（暗色主色提亮为 `#2f6db3` 保证对比度）+ CSS 变量 `[data-theme='dark']` 全量覆盖双轨同步；`index.html` 头部内联脚本在首帧渲染前应用主题，杜绝暗色用户白闪。

### 5. 动效封装层唯一出口

全项目 JS 动效只允许经由 `src/components/motion/`（`FadeIn / StaggerGroup / CountUpNumber`），业务代码禁止直接 import motion —— 将来更换动效库业务零改动；`prefers-reduced-motion` 全局降级，桌面 ≥1024px 布局与触摸目标 ≥44px 为不可破坏红线。

---

## 文档索引

深入设计与踩坑记录均在 `docs/` 目录：

| 文档 | 内容 |
|------|------|
| [docs/research/](docs/research/README.md) | 7 篇技术调研：动效选型、antd6 令牌与反馈态、微交互参数清单、同类开源项目分析、构建分包、Supabase 类型与 RQ 实践、暗色模式与仪表盘 UI |
| [docs/plans/](docs/plans/) | 各迭代实施计划 |
| [docs/2026-09-03-v4迭代总结.md](docs/2026-09-03-v4迭代总结.md) | v4.0 架构现代化 + UI 升级完整交付记录 |
| [docs/2026-08-26-v3.6迭代总结.md](docs/2026-08-26-v3.6迭代总结.md) | v3.6 UI 精致化 + 动效升级交付记录 |

---

## 版本历史

| 版本 | 主题 | 主要内容 |
|------|------|---------|
| **v4.0.0** | 架构现代化 + UI 升级 | Rolldown 语义化分包（入口 448KB→65KB）、手写 Database 类型端到端类型安全、TanStack Query 数据层全量迁移、`@/` 路径别名、会话过期监听、暗色模式全套、登录页双栏重构拆分、Dashboard 信息架构 v2、通用组件库（StatCard/EmptyState/PageHeader）、全站 emoji 图标清理 |
| v3.6 | UI 精致化 + 动效升级 | motion 动效体系、骨架屏反馈态、设计令牌统一收敛、antd6 弃用 API 迁移 |
| v3.2 及以前 | 功能建设 | 抢票并发安全 RPC、文件上传安全、RLS 全表审计、通知中心、使用埋点等（详见 `supabase-migration.sql` 各部分注释与 docs 历史总结） |

---

## 许可证

[MIT](./LICENSE)
