# 学生会线上交流平台

> 为重庆邮电大学学生会（12 部门）构建的内部办公与交流平台

## 技术栈

| 技术 | 版本 |
|------|------|
| React | ^19.2 |
| TypeScript | ~6.0 |
| Vite | ^8.1 |
| Ant Design | ^6.4 |
| Supabase (PostgreSQL + Auth + Realtime) | ^2.108 |
| React Router | ^7.18 |
| dayjs | ^1.11 |

- **样式方案：** CSS Modules（每个模块 `.module.css`）
- **部署：** GitHub Pages（HashRouter，base `/student-union-platform/`）
- **仓库：** `git@github.com:YHLLXY/student-union-platform.git`（master 分支，46 commits）

## 目录结构

```
src/
├── App.tsx                  # 根组件：auth 状态 + 懒加载路由
├── supabaseClient.ts        # Supabase 客户端初始化
├── components/              # 全局组件
│   ├── AuthContext.tsx       #   AuthContext + useAuth() hook
│   ├── AppLayout.tsx         #   整体布局（侧边栏 + 内容区）
│   ├── ErrorBoundary.tsx     #   全局错误边界
│   ├── ModuleErrorBoundary.tsx # 模块级错误边界
│   └── FeedbackModal.tsx     #   联系开发者反馈
├── utils/
│   ├── constants.ts          # DEPARTMENTS(12), ROLES(5), ROLE_LEVEL, TASK_PRIORITIES, TASK_STATUSES, NOTICE_TYPES, FORUM_CATEGORIES
│   └── helpers.ts            # hasMinRole(), isAdmin(), getDepartmentLabel(), getRoleLabel(), formatDateTime()
├── diagnostics/              # 诊断日志系统
│   └── index.ts              # 统一导出：logger, trace, initErrorReporter, getRecentErrors
└── modules/
    ├── auth/                 # 登录/注册/密码重置（学生+教师双入口）
    ├── tasks/                # 任务管理（发布/提交/审核/模板/里程碑/公告关联）
    ├── notices/              # 部门公告（发布/置顶/关联任务/一键转任务）
    ├── school/               # 学校信息（全校公告）
    ├── forum/                # 部门论坛（分类浏览/Markdown发帖/知识库模板）
    ├── profile/              # 个人中心（统计/热力图/排行榜/日历/通讯录/新人指南）
    ├── admin/                # 权限管理（成员角色/邀请码/工作看板）
    └── tickets/              # 活动抢票（发布/抢票/退票/我的票券）
```

## 角色权限体系

| 角色 | key | 权限等级 | 说明 |
|------|-----|---------|------|
| 常驻志愿者 | `volunteer` | 0 | 执行任务、看公告帖子、看不含联系方式的通讯录 |
| 部门负责人 | `dept_head` | 1 | 发布任务/公告、审核、编辑本部门指南、看联系方式 |
| 主席团成员 | `presidium` | 2 | 跨部门管理、看全校数据 |
| 主席 | `president` | 3 | 最高权限（同老师） |
| 老师 | `teacher` | 3 | 最高权限、看全校数据、教师入口登录 |

- **权限判断：** `hasMinRole(user.role, 'dept_head')` 检查是否满足最低角色要求
- **管理员判断：** `isAdmin(role)` → `president || teacher`

## 开发约定

1. **模块隔离：** 每个模块目录有 `index.tsx` 集中导出，组件通过 CSS Modules 隔离样式
2. **诊断日志：** 所有新代码使用 `import { logger } from '../../diagnostics'` + `logger.for('模块/组件名')`
3. **子代理 xhigh：** 所有 Agent/Workflow 子代理使用 `effort: 'xhigh'`
4. **先问后改：** 任何代码修改前必须先分析问题、提出方案、评估影响、征得用户同意
5. **每阶段验证：** 每阶段完成后 `npm run build`（`tsc -b && vite build`），0 错误才能继续
6. **提交规范：** feat/fix/docs/style 前缀 + 中文描述

## Supabase 数据库

- **项目 URL：** `https://bbyykrgitgawqwdgcxhp.supabase.co`
- **Auth：** 邮箱 = `学号@stuunion.org`，`users` 表通过 `auth_id` 关联 `auth.users`

**核心表：**
`users` | `tasks` | `task_templates` | `task_milestones` | `task_submissions` | `notices` | `school_notices` | `forum_posts` | `tickets` | `ticket_records` | `invite_codes` | `department_guides`

**迁移文件：** `supabase-migration.sql`（6 部分，含一期 + 二期所有 DDL）

## 二期增强功能（2026-07-02）

1. **智能通讯录** — MemberDirectory.tsx，全员搜索 + 部门 Tag 筛选 + 任务计数
2. **任务里程碑** — MilestonePanel.tsx，进度条 + 逾期/临近高亮 + 自动提醒 Badge
3. **部门新人指南** — DeptGuide.tsx + DeptGuideForm.tsx，基本信息/常用模板/FAQ
4. **公告一键转任务** — NoticeList 内 Modal，自动关联

## 参考文档

| 文档 | 位置 |
|------|------|
| 问题跟踪 | `docs/ISSUES.md` |
| 设计文档 | `docs/superpowers/specs/` |
| 实施计划 | `docs/superpowers/plans/` |
| 数据库迁移 | `supabase-migration.sql` |
| 开发规范 | `.claude/settings.json` |

## 启动命令

```bash
npm run dev      # 开发服务器 → http://localhost:5173/student-union-platform/
npm run build    # 生产构建（tsc -b && vite build）
npm run preview  # 预览生产构建
```
