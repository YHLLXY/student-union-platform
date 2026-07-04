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

## 开发流程与规范

### 全链路流程

```
提出问题 → 分析原因 → 设计方案 → 评估影响 → 征得同意 → 执行 → build验证 → 提交推送
```

**任何代码修改，无论大小，都必须走完这个流程。** 尤其是"评估影响 → 征得同意"两步，不得跳过。

### 子代理驱动开发

- **一任务一代理：** 每个独立任务分派给一个新的子代理，保持上下文清爽
- **参数：** 所有 Agent 调用使用 `effort: 'xhigh'`，`subagent_type: 'general-purpose'`
- **并行策略：** 修改不同文件的子代理可以同时运行；修改同一文件的必须串行
- **先后顺序：** Service 层函数先行 → 组件次之 → 页面集成最后
- **任务间 review：** 每批子代理完成后，检查 build 结果再进入下一批

### 模块结构规范

每个 `modules/<name>/` 目录遵循统一模式：
```
module/
├── index.tsx            # 集中导出（export { default as Xxx } from './Xxx'）
├── XxxService.ts        # 数据层：Supabase 查询、接口类型、CRUD 函数
├── XxxComponent.tsx     # 页面/组件
└── xxx.module.css       # CSS Modules 隔离样式
```

- **新组件入口：** 在 `modules/<parent>/` 下新建文件，通过 `index.tsx` 导出
- **不改路由：** 功能增强在已有页面内通过 Card / Tab / Modal 展开，不动路由配置
- **不拆模块：** 所有增强在已有 8 个模块内扩展，不新建模块目录

### 代码规范

- **诊断日志：** 所有新文件使用 `import { logger } from '../../diagnostics'` + `const log = logger.for('模块/组件名')`
- **类型定义：** 接口放在对应的 Service 文件中，组件通过 `import type` 引用
- **Supabase 查询：** 用 `.select('*, join:foreign_key(fields)')` 做联表，`.maybeSingle()` 查可能不存在的行
- **错误处理：** Service 层 catch 后 `log.error()` + 返回安全默认值（`[]` / `null` / `false`）

### 数据库变更流程

1. **先在 `supabase-migration.sql` 末尾追加 DDL**（新表/新列/新策略）
2. **代码中先写好对应的 Service 函数**（查询新表/新列的代码）
3. **提醒用户手动执行迁移**（复制 SQL → Supabase Dashboard → SQL Editor）
4. 用户确认执行后，功能才能正常使用

### 问题管理

- **发现 Bug 或警告：** 记录到 `docs/ISSUES.md`（现象、原因、影响范围、严重程度）
- **暂不修复的：** 标记为「待处理」，写清楚不修的原因
- **已修复的：** 移到「已修复」区，补充解决方案和 commit hash

### 提交规范

```bash
git add <涉及的文件>
git commit -m "类型: 中文描述"
git push origin master
```

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat:` | 新功能 | `feat(profile): add MemberDirectory component` |
| `fix:` | Bug 修复 | `fix(auth): 修复老用户登录被邀请码校验拦截` |
| `docs:` | 文档 | `docs: 添加 CLAUDE.md + ISSUES.md` |
| `style:` | 样式 | `style(tasks): add milestone panel CSS` |

### 禁止事项

- ❌ 跳过用户同意直接修改代码
- ❌ 代码中用 `TBD` / `TODO` / 占位符代替实际实现
- ❌ 新增模块目录（除非用户明确要求）
- ❌ 修改路由配置（除非用户明确要求）
- ❌ 修改已有组件的 UI 主题风格

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

## 启动命令

```bash
npm run dev      # 开发服务器 → http://localhost:5173/student-union-platform/
npm run build    # 生产构建（tsc -b && vite build）
npm run preview  # 预览生产构建
```
