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
    ├── tickets/              # 活动抢票（发布/抢票/退票/我的票券）
    ├── notification/         # 通知中心（Bell组件/Realtime推送/CRUD service）
    └── dashboard/            # 首页工作台（统计卡片/活动时间线/快捷操作）
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
提出问题 → 分析原因 → 设计方案 → 评估影响 → 征得同意 → 执行 → build验证 → 功能验证 → 更新版本号 → 提交推送
                                                                         ↑ 新增          ↑ 新增
```

**任何代码修改，无论大小，都必须走完这个流程。** 尤其是"评估影响 → 征得同意"两步，不得跳过。

### 功能验证（必须执行）

> 引用 Skill：`superpowers:verification-before-completion`

**Build 通过 ≠ 功能正确。** 每次改动完成后必须功能验证：

1. **确定验证方式：** 这个改动跑起来后，怎么观察它生效了？
2. **实际运行：** `npm run dev` 启动，打开浏览器操作一遍
3. **对照验收标准：** 逐条确认设计文档中的 checkbox
4. **禁止虚假声明：** 没有实际运行就不能说"没问题"、"应该可以"
5. **失败时如实报告：** 说清楚具体什么没通过，不要掩饰

**关键原则：** No completion claims without fresh verification evidence.

### 测试护栏（Phase 0 起，改动前先跑）

| 命令 | 内容 |
|------|------|
| `npm test` | Service 层单测（vitest + jsdom，`tests/unit/`） |
| `npm run test:watch` | 单测 watch 模式 |
| `npm run test:e2e` | 端到端冒烟（Playwright，`tests/e2e/`，真实浏览器走真实 UI） |

**Node 版本下限 `>=22.22.2`**（见 `package.json` engines）：vitest 5 要求 `^22.12 \|\| ^24`，jsdom 30 要求 `^22.22.2 \|\| ^24.15`，**Node 20 会在启动阶段直接崩**（现象是 vitest 无任何输出、exit code 1）。CI 两个 job 均用 Node 24，与本地开发一致。

**隔离铁律：测试永远不连生产 Supabase。** 三层保障，改测试基建时不要绕过——

1. 全部测试只打本地 stub（`scripts/dev-stub.mjs`）：单测 9911（vitest globalSetup 自动拉起回收）、E2E 9913（Playwright webServer 拉起），与开发用 9999 完全隔离；
2. `tests/setup.ts` 与 `tests/e2e/fixtures.ts` 各有一道硬拦截：前者校验 `VITE_SUPABASE_URL` 必须是本地 stub，后者把任何非 127.0.0.1/localhost 请求直接 abort。E2E 另有 `tests/e2e/safety.spec.ts` 专门自证这道防线有效；
3. E2E 走 `vite.e2e.config.ts`（`envDir: false`），根本不加载指向生产的根 `.env`。

**其它注意：**
- stub 是按「真实 PostgREST 线上报文形态」仿真的（`.or()`、`.contains()` → `cs.{}`、`count=exact`、`别名:users!外键列(fields)`、列默认值 `TABLE_DEFAULTS`、**`order` 排序 / `limit`·`offset`·`Range` 分页窗口 / `not.` 取反**）。新增查询写法若在测试里静默失配，先补 `scripts/dev-stub.mjs` 的对应形态，不要绕过断言；
- **stub 的响应体必须按真实协议序列化**：`send()` 早先对字符串原样输出，而真实 PostgREST 对标量 RPC（如返回 `text` 的 `ticket_qr_token`）返回的是**带引号的 JSON 字符串**。后果不是断言失败，而是 `unwrap` 解析失败后把令牌原文当 `error.message` 抛出来（v4.4.0 排查耗时最久的一项）。**遇到「解析失败」类错误先查 stub 的报文形态，别急着改业务代码**；
- **stub 的回写响应必须是「落库后的整行」**：POST 的 representation 早先只回传「请求体 + id/created_at」，缺了 `TABLE_DEFAULTS` 补上的列。后果是 `users.onboarded`（DEFAULT false）在响应里根本不存在 → 前端拿到 `undefined` → 新人引导永远不弹，而这类缺口只在「断言某个默认值生效」时才暴露。v4.5.0 已改为回传入库行（顺带修掉「多行插入时所有行共用最后一行 id」的老 bug）；
- **弹窗里的表单不要在 `afterOpenChange` / `onOpenChange` 里回填**：面板动画结束（约 300ms）后才 setFieldsValue，会覆盖用户在这段时间里输入的内容 —— v4.5.0 的资料编辑就这么丢过一次输入（E2E 抓到的），正确写法是「用 `{open && <Form/>}` 条件挂载，初值走 `initialValues`」；
- E2E 必须 `serviceWorkers: 'block'`：应用注册了 PWA service worker，而 Playwright **不拦截由 SW 处理的请求**——不屏蔽 SW，`page.route` 防线会形同虚设；
- CI：`.github/workflows/deploy.yml` 的 `test` job（oxlint + 单测 + E2E）全绿才允许 `build` → `deploy`，且该 job **不注入任何生产凭据**。

**测试测不到什么（2026-09-12 明确划界，别再白费力气）：**

- **RLS 策略的正确性测不到**。单测与 E2E 打的都是 dev-stub，而 stub **不实现 RLS**——它保证的是报文形态。策略写错（该放行的拒了、该拒的放行了）在 `npm test` / `npm run test:e2e` 里**不会有任何反应**。唯一有效的验证是拿真实角色去撞真实策略：跑 `supabase-verify-v4.6.0.sql`（事务内 `SET ROLE authenticated` 冒充三种角色逐条断言，末尾 `ROLLBACK`）。
- **无障碍的 critical 级有门禁**：`tests/e2e/a11y.spec.ts` 用 axe-core 扫 8 个页面，critical 必须为 0，并**顺带生成** `docs/a11y-audit.md`（报告是交付物，每次运行覆盖）；另有一条「登录页 Tab 顺序」用例，补 axe 查不到的焦点顺序（顺带记一笔：`继 续` 这类两字按钮被 antd 插了空格，比对前要去空白）。写这条用例时踩过一个坑：模块是懒加载的，点侧边栏后 URL 立刻变、新页面 JS 还在下载，此时 DOM 里仍是上一页 —— 不等就扫会把问题记到错误的页面名下。故每个页面都用 `page.goto('/#/xxx')` 整页加载 + 该页独有标题作为就绪锚点（**不要**用「发布任务」这类文案当锚点，工作台快捷入口里也有）。

### 代码审查（推送前必须执行）

> 引用 Skill：`superpowers:receiving-code-review`、`/code-review`

**推送前必须对 diff 做审查，从以下维度检查：**

| 检查维度 | 问题示例 |
|---------|---------|
| 次生影响 | 改了 Service 函数签名，所有调用方更新了吗？ |
| 未用引入 | 新增了 import 但没用到？（TypeScript 能拦住，但小心） |
| 边界情况 | 空数据、超长文本、权限边界 |
| 样式隔离 | CSS Module 类名是否唯一？会不会覆盖其他模块？ |
| 破坏现有功能 | 共享组件改了，其他页面受影响吗？ |

**审查方式：**
- 用 `git diff` 逐文件过一遍改动
- 或者调用 `code-review` / `simplify` Skill 自动化审查
- 发现的问题立即修复后再推送

**审查发现反馈时的处理：**
- 不表演式附和（"你说的太对了！"）
- 技术验证后直接改，用代码说话
- 如果审查建议不合本项目实际 → 用技术理由 push back

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
- **性能铁律：**
  - 所有独立查询必须 `Promise.all` 并行，禁止串行 `await`
  - 所有列表查询必须 `LIMIT`（通知 20，活动流 5，搜索 5）
  - 禁止在 `.map()` / `for` 循环内调用 `supabase.from()`（N+1 反模式）
  - 非关键操作（通知、日志）使用 fire-and-forget：`.catch(() => {})`
  - **新依赖先看包体积、且能懒加载的一律懒加载**：新增 `import` 后必须量一次首屏体积（见下）。v4.4.0 的二维码链就是这样发现的——`qrcode`/`html5-qrcode` 被 `priority: 1` 的 vendor 兜底分组吸走，而 vendor 是入口静态 import 的，等于每次进站白付 100+ KB gz
- **首屏体积的量法与预算（改动分包 / 加依赖后必跑）：**
  - `npm run build && node scripts/measure-eager.mjs` —— 口径是 `dist/index.html` 引用的**全部 .js** 的 gzip 之和；`<link rel="modulepreload">` 也要算（入口会**静态 import** 它们，是真会阻塞首屏的），只有动态 `import()` 的 chunk 不算
  - 预算 **≤340 KB gz**；历史基线：v4.3.0 = 319.5，v4.4.0 = 325.2，v4.5.0 = 325.3（新增的论坛互动 / 引导 / 资料编辑全部落在懒加载 chunk 里，首屏仅 +0.1）
  - `entriesAwareMergeThreshold`（当前 8KB）是这套分包里最敏感的旋钮：调高会把次要页面的 antd 块并进入口共享块（200KB → 首屏 535 KB gz），调低到 8KB 各入口各自成块（325 KB gz）
- **乐观更新：** 拖拽/标记已读等操作先改本地 state → 后台同步 → 失败回滚。**必须用 `setState(prev => prev.map(...))` 而非对象 mutation。**
- **组件受控模式：** 可复用组件使用标准 `value` + `onChange` 接口，与 antd Form 无缝集成
- **类型导入：** 跨模块引用类型用 `import type`，避免循环依赖

### 数据库变更流程

1. **先在 `supabase-migration.sql` 末尾追加 DDL**（新表/新列/新策略/索引）
2. **代码中先写好对应的 Service 函数**（查询新表/新列的代码）
3. **提醒用户手动执行迁移**（复制 SQL → Supabase Dashboard → SQL Editor）
4. 用户确认执行后，功能才能正常使用

**排查 SQL 报错的顺序（2026-09-11 误判一次后固化，务必按序走，别跳步）：**

1. **先确认连的是不是同一个库**：`SELECT current_database(), current_schema(), current_setting('search_path');`。报 `42P01 relation "xxx" does not exist` 时，**第一嫌疑是「SQL Editor 打开的是另一个 Supabase 项目」**（Dashboard 会记住上次打开的项目，从历史记录进来极易落到隔壁库）——正确项目是 `bbyykrgitgawqwdgcxhp`。
2. **再看限定名**：如果连表名带 `public.` 前缀都报「不存在」，那就**一定是那个库里真的没有这张表**，不要再往 `search_path` 上想（Postgres 只在表确实不存在时才对全限定名报此错）。据此可反推是连错库。
3. **可用的交叉验证**：用 `.env` 里的项目 URL 直接打 REST 接口（`curl -s -o /dev/null -w '%{http_code}' "$VITE_SUPABASE_URL/rest/v1/users?select=id&limit=1" -H "apikey: $KEY"`）；返回 **200**（哪怕 body 是 `[]`，那是 RLS 拦掉匿名行）就证明表在该库的 public schema 下。

**写 SQL 的加固（成本为零，保留）：表名一律带 `public.` 前缀，脚本开头 `SET search_path = public;` 兜底。** 函数同理写 `public.函数名()`。这覆盖的是 `search_path` 真异常的场景，不是上面那个误判的原因。

**DDL 脚本必须自带「反馈」**：建索引/建触发器成功时 SQL Editor 只显示 `Success. No rows returned`，用户会以为没生效。故每个一次性脚本**结尾都要留一条只读的验收查询**（`WITH expected AS (SELECT * FROM (VALUES …) AS e(…)) SELECT … '[OK]'/'[缺失]' …`），把「建了什么、成没成」直接打成表。

**「待用户执行」的脚本必须配一个机器可查的「就位证据」（2026-09-12 踩过，代价最大的一次）**：第十九部分（Phase 3 数据层）交付时只写了「待你在 Supabase 执行」，之后没人回头核对；前端照常发版，于是线上论坛页连着几天都是「帖子加载失败」、个人资料保存报错、新人引导落库失败——直到 Phase 4 的验收表打出 `forum_likes / forum_bookmarks` 两行 `[缺失] 只有 0 条` 才暴露，而那张表当时**读起来像「策略被人删了」**。两条经验：

- **不要靠回忆或截图判断脚本是否执行过**，用两道自检：库外 `npm run probe:db`（只读、anon key、按批次列出缺失的表与列，见下）；库内 `supabase-verify-v4.6.0.sql` 的 1.1b（连策略/触发器一起点）。**每次发版后跑一次 `probe:db`，全 `[OK]` 才算这轮数据层真的上线了。**
- **验收表要把「表不存在」与「策略缺失」分开报**：两者的排查方向完全不同（前者去执行脚本，后者去查谁删了策略）。`[缺失] 只有 0 条` 这种把两种原因混在一句话里的输出，会把人引向错误方向。

**脚本必须能重跑：`CREATE POLICY` / `CREATE TRIGGER` 之前一定要删同名对象（2026-09-12 踩过）**：这两类 DDL **没有 `IF NOT EXISTS`**，所以「改写了策略名」时最容易漏——第二十部分把 `notifications` / `platform_guides` 的策略换了新名字，却只 `DROP` 了旧名字，于是脚本第二次执行在这里报 `42710 policy "notifications_select_own" for table "notifications" already exists` 并整份中断（SQL Editor 把整段当一个事务，用户拿到的只是一句「already exists」，看不出「这个脚本不能重跑」）。**用户会重跑**（补数据层、复查、复现问题都会重跑），所以这是必答题不是加分题。`check-sql.mjs` 的可重跑检查就是这条约定的机器版，改完脚本跑一遍再交付。

**先加列，再挂约束 / 触发器 / 索引（2026-09-11 踩过）**：`CREATE TRIGGER … AFTER UPDATE OF <列>` 与 `CREATE INDEX … (<新列>)` 会在**创建对象那一刻**就校验列是否存在，把「加列」排在它们之后，整份脚本会在半途炸掉：`42703 column "checked_in_at" of relation "ticket_records" does not exist`。新列一律提到脚本最前面加。`scripts/check-sql.mjs` 已加这条顺序检查（引用早于 `ADD COLUMN` 即报错）。

**脚本工具（别再手抄 SQL，两份内容必须逐字一致）：**

- `node scripts/extract-sql-section.mjs <第N部分> <输出文件名>` —— 从 `supabase-migration.sql` 抽取某章节生成独立执行脚本（自动识别章节边界，抬头标注勿手改）。
- `node scripts/check-sql.mjs <sql 文件>` —— 静态体检四关：① 结构自检（语句切分、圆括号配平、`$$` 闭合、字符串闭合、代码区全角标点，零依赖）；② **DDL 顺序检查**（触发器 `UPDATE OF 列` / 索引列引用了本文件后面才 `ADD COLUMN` 的列即报错——42703 就是这么来的）；③ **可重跑检查**（`CREATE POLICY` / `CREATE TRIGGER` 之前没有同名的 `DROP … IF EXISTS` 即报错——这两类 DDL 没有 `IF NOT EXISTS`，缺一次就会在第二次执行时报 42710，2026-09-12 真踩过）；④ 可选 `pgsql-ast-parser` 真语法解析（装法见文件头；它不认 `GRANT`/`REVOKE`/`SECURITY DEFINER`/`CREATE POLICY` 等 Postgres 专有 DDL，脚本已按白名单跳过，只解析查询与建表建索引）。**交付前对每个 `<用途>-<版本>.sql` 都跑一遍，四关全通过再交给用户。**
- 注意 `WITH cte(a,b) AS (VALUES …)` 这种 CTE 列名列表是 pgsql-ast-parser 的盲点（Postgres 本身合法），写验收查询时用 `WITH cte AS (SELECT * FROM (VALUES …) AS e(a,b))` 才能被机器校验。
- `node scripts/backup-supabase.mjs [输出目录]` —— 全库导出（需 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 两个环境变量，**service_role key 绝不进仓库**）；
- `node scripts/restore-backup.mjs <备份目录> [--yes]` —— 恢复（不带 `--yes` 只校验不写入）。两者用法与边界见 `docs/backup-restore.md`。
- `npm run probe:db`（= `node scripts/probe-schema.mjs`）—— **数据层就位自检**：只用 `.env` 里的 anon key 做只读探测（`limit=0`，不取任何行），按批次回答「这份脚本到底执行了没有」。
  判据是 PostgREST 的响应顺序：表不存在 = 404/`PGRST205`、列不存在 = 400/`42703`、就位但 anon 已被收权 = 401/`42501`。
  **列探测之所以能在「anon 读不到的表」上生效，是因为解析先于鉴权**（这一点是它能只用 anon key 干活的根据）。
  开头有一张不存在的表作对照，避免 key/URL 错误时把所有 401 误读成「已就位」。它是运维检查、会打到 `.env` 指向的真实项目，故不进 CI、不当测试用。
- `npx playwright test tests/e2e/a11y.spec.ts` —— 无障碍扫描（同时是 critical 门禁），跑完刷新 `docs/a11y-audit.md`。

**需要用户一次性粘贴执行的大段脚本**（安全收口、性能优化、阶段迁移这类），另存为独立文件放在仓库根，命名 `<用途>-<版本>.sql`，与 `supabase-migration.sql` 里对应部分内容一致——现有五份：`supabase-security-fix-step1/2.sql`（第十六部分）、`supabase-optimize-v4.3.0.sql`（第十七部分）、`supabase-phase2-v4.4.0.sql`（第十八部分，含新表/新列/新函数）、`supabase-phase3-v4.5.0.sql`（第十九部分，含新表/新列/触发器/策略）、`supabase-verify-v4.3.0.sql`（第十七部分的只读验收）。

**交付时把「交付核对」一并给用户**：`check-sql.mjs` 结尾会打印行数 / 首行 / 末行，粘贴进 SQL Editor 后核对这两项即可确认没粘漏。2026-09-12 出现过 `42601 syntax error at end of input` + `LINE 0:`（空行）——那是「到达服务器的 SQL 只剩注释或空白」的签名；**而截断落在语句边界上时不会报错**，只会安静地少跑一段，比报错危险，所以这项核对不能省。

### 数据导出

`src/utils/export.ts` 是全站唯一的导出通道（CSV + UTF-8 BOM + 公式注入防护）。

**不要再引入 `xlsx`（SheetJS）**：npm 侧最新版停在 0.18.5（2022-03），带两个无 npm 修复路径的高危公告（原型污染、ReDoS）。需要真正的多 sheet/样式表格时，评估 `write-excel-file`（MIT）并动态 import，别进首屏包。

### Realtime 订阅登记

**每新增一个 `.channel().subscribe()` 必须在下方登记。** Supabase 免费层上限 200 并发连接。

| 模块 | 表 | 事件 | 过滤条件 |
|------|-----|------|------|
| tasks | `tasks` | INSERT, UPDATE | `assigned_department` |
| notices | `notices` | INSERT | `department` |
| notification | `notifications` | INSERT | `user_id` |
| tickets | `tickets`, `ticket_records` | * | 无 |
| school | `school_notices` | INSERT | 无 |

**规则：**
- 所有订阅必须在 `useEffect` cleanup 中取消
- 新增订阅前确认不会超出连接上限

### Phase 自检清单

**每个 Phase 完成后必须逐项检查：**

```
□ build: npm run build → 0 error
□ Promise.all: grep 连续 await → 无串行化
□ N+1: grep .map( + supabase → 无循环内查询
□ 死代码: grep export + grep 调用方 → 无孤立函数
□ 角色矩阵: 用 volunteer/dept_head/president 三视角验证数据过滤
□ Realtime: 新增订阅了吗？cleanup 正确吗？
```

### 问题管理

- **发现 Bug 或警告：** 记录到 `docs/ISSUES.md`（现象、原因、影响范围、严重程度）
- **暂不修复的：** 标记为「待处理」，写清楚不修的原因
- **已修复的：** 移到「已修复」区，补充解决方案和 commit hash

### 经验沉淀

本项目经验教训统一存放在：
```
E:\knowledge home\30-项目\学生会交流平台\
```
（2026-08-04 随源码迁入 vault）

历史记录见 `docs/lessons-learned-phase1-5.md`，新增教训直接写入统一路径。

### 问题与迭代记录

**每次审视发现的问题、功能缺口、推进计划统一记录在：**
- 统一路径：`E:\knowledge home\30-项目\学生会交流平台\2026-07-20-双视角全面审视报告.md`
- 项目本地：`docs/2026-07-20-双视角全面审视报告.md`

该报告是活文档，每次迭代后更新问题状态、新增发现、调整优先级。

### 更新版本号（PWA 版本通知）

**每次面向用户的部署必须更新版本号，否则通知铃铛不会弹更新公告。**

修改两个文件：
1. `public/version.json` — 递增 `version`，更新 `date` 和 `changelog`
2. `public/sw.js` — `CACHE_VERSION` 与 version.json 保持一致

版本号规则：`主版本.次版本.修订号`（如 `3.0.0` → `3.0.1`）

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

### 线上问题排查优先级

> 引用 Skill：`superpowers:systematic-debugging`（复杂 Bug 时调用）
>
> ⚠️ **本地正常 + 线上异常 → 先查部署，最后才怀疑代码。**

当用户反馈"线上有问题但本地正常"时，按以下顺序排查，禁止跳过前两步直接改代码：

1. **确认线上文件是否最新：**
   ```bash
   curl -sI "https://yhllxy.github.io/student-union-platform/" | grep -i last-modified
   ```
   对比 `Last-Modified` 日期是否与最新 commit 一致。不一致 → 部署没生效。

2. **确认 GitHub Pages 源配置：**
   - Settings → Pages → Source 必须为 **"GitHub Actions"**
   - 检查 Actions 标签页最新 workflow 是否绿色 ✓

3. **确认部署文件内容：**
   ```bash
   # 爬取线上 JS/CSS 文件名，与本地 dist/ 对比
   curl -s "https://yhllxy.github.io/student-union-platform/" | grep -o 'assets/[^"]*\.js'
   ```
   ⚠️ **别把「chunk 哈希逐字一致」当作唯一判据**（2026-09-12 实测踩过）：同一份源码，
   CI（Linux）与本地（Windows）构建出来的**懒加载 chunk 哈希并不一致**——实测线上入口 chunk
   与本地 diff 有 30 处不同，逐处核对后发现**全都是指向其他 chunk 的 8 位哈希名**，
   13 个入口静态引用的 chunk 名字则完全相同。也就是说产物一致、只是命名/顺序在不同环境里有差异。
   判定「线上是不是这次构建」请用：**`version.json` / `sw.js` 的版本号 + CI 该次运行的状态**
   （`curl -s https://api.github.com/repos/YHLLXY/student-union-platform/actions/runs?per_page=2`），
   chunk 名对比只作为参考。

4. **以上三步确认正常后，才排查代码问题。**

## Supabase 数据库

- **项目 URL：** `https://bbyykrgitgawqwdgcxhp.supabase.co`
- **Auth：** 邮箱 = `学号@stuunion.org`，`users` 表通过 `auth_id` 关联 `auth.users`

**核心表：**
`users` | `tasks` | `task_templates` | `task_milestones` | `task_submissions` | `notices` | `notice_reads` | `school_notices` | `forum_posts` | `forum_replies` | `tickets` | `ticket_records` | `invite_codes` | `department_guides` | `notifications` | `platform_guides` | `points_ledger`（v4.4.0）| `forum_likes` | `forum_bookmarks`（v4.5.0）

**迁移文件：** `supabase-migration.sql`（20 部分，含一期 + 二期 + Phase1-5 全部 DDL 与安全收口、性能优化、Phase 2/3/4 数据层）；大段独立脚本见根目录 `supabase-*.sql`（另有只读验收/自证脚本 `supabase-verify-v4.3.0.sql`、`supabase-verify-v4.6.0.sql`）

**数据库优化（v4.3.0，第十七部分）：** `users.auth_id` 唯一索引（RLS 策略判定热路径）、22 条外键索引、11 条复合索引、`updated_at` 触发器、两个枚举列 CHECK（NOT VALID）。执行脚本 `supabase-optimize-v4.3.0.sql`，**由用户在 Supabase 手动执行**，不执行也不影响功能。

**Phase 2 数据层（v4.4.0，第十八部分）：** 执行脚本 `supabase-phase2-v4.4.0.sql`（**用户已执行**）。三条与「前端直觉」相反的设计，改动前务必先读：

1. **积分是数据库算的，前端只读**。`points_ledger` 是唯一不套 `authenticated_full_access` 的业务表（只有 SELECT 策略，INSERT/UPDATE/DELETE 全部 `REVOKE`）。四个计分点由触发器写入：`task_submissions` 转为 `approved` 时 +2，并按「提交时间 vs `tasks.deadline`」再判按时 +1 / 逾期 -1；`ticket_records.checked_in_at` 由空变非空时 +1。幂等由 `uq_points_event(ref_type, ref_id, reason)` 唯一索引 + `ON CONFLICT DO NOTHING` 保证——**重复点审核、重复签到都不会重复加分**。
2. **签到是 RPC，前端不需要写权限**。`ticket_qr_token(record_id, ttl)` 签发 15 分钟有效的 MAC 令牌（密钥在库内 `app_secrets`，不进仓库，签名用内置 `md5` 做 keyed hash、不依赖 pgcrypto）；`check_in_ticket(token)` 在服务端依次做 令牌校验 → 组织者权限 → 时间窗（活动前 2 小时至后 6 小时）→ 防重复 → 计分，返回 `{ ok, code, message }`，**按 `code` 分流提示，不要拿 `message` 做判断**。
3. **两条防伪触发器**：`task_submissions.status` 进入 `approved`/`rejected`、`ticket_records` 的两个签到列，都必须「部门负责人及以上」（放行 `service_role` 供运维）。不加固的话任何志愿者都能给自己加分，积分排行就失去意义。

**学期键：** 形如 `2026-2027-1`（9 月~次年 1 月为第 1 学期）。数据库侧是 `public.semester_of()`，前端侧是 `src/utils/semester.ts` 的 `currentSemester()`——**两边必须同口径**，改一处要改两处。

**Phase 3 数据层（v4.5.0，第十九部分）：** 执行脚本 `supabase-phase3-v4.5.0.sql`（**需用户在 Supabase 执行**）。

> ⚠️ **状态：曾在 2026-09-12 被发现漏执行，同日已补执行**（用 `npm run probe:db` 实测：发现时
> `forum_likes` / `forum_bookmarks` 两张表与 6 个新列都不存在，而同期的第十八、二十部分都在；
> 当时线上表现是「帖子加载失败 / 资料保存报错 / 新人引导落库失败」。补执行后 `probe:db` 三批全 `[OK]`）。
> **补执行它不改变任何权限语义**（它只建新表新列，不碰第二十部分收口的那些策略），先后顺序无影响。
> 教训见 `docs/ISSUES.md` #17、迭代总结经验 14：**交付脚本后要跑 `probe:db` 确认落地，别靠回忆。**

四点设计意图，改动前务必先读：

1. **帖子列表不再 N+1**。`forum_posts` 新增 `reply_count` / `like_count` 两个**计数列**，由 `trg_forum_replies_count` / `trg_forum_likes_count` 触发器维护；回填语句在同一个脚本里。列表因此只需一条查询（`select('*, author:created_by(name)')`），原先「每个帖子各发一条 `head: true` 的 count」已删除。**这两个计数列是只读的**——客户端写它既没用也没意义。
2. **`forum_likes` / `forum_bookmarks` 是全库第一对按行 RLS 的表**（Phase 4 C2 的先行试点）：复合主键 `(post_id, user_id)` 保证一人一帖一行；SELECT 放行全体登录用户，INSERT / DELETE 一律要求 `user_id = current_app_user_id()`，**有意不建 UPDATE 策略**（点赞行没有可改字段）。前端的 `toggleLike` 把 23505 当成功处理，双击/重试都不会报错。
3. **置顶有权重，计数没有**。`forum_posts.pinned_at` 由 `trg_forum_posts_pin_guard` 守着（部门负责人及以上，放行 `service_role`）——置顶是面向全体的可见性加权；而两个计数列**有意不加守卫**（改动它拿不到任何权限、也不影响业务判断，加「守卫 + 事务内 GUC 绕行」不划算）。若哪天计数被用于考核，这条注释与代码必须同步改。
4. **`users.onboarded` 的存量回填用固定时间字面量**（`created_at < '2026-09-12 00:00:00+08'`）而不是 `now()`：脚本要能重复执行，用 `now()` 会把「上次执行之后新注册的人」误标成已引导。前端读取一律用 `onboarded === false` 判断——v4.4.0 之前的本地缓存里没有这个字段，用 `!user.onboarded` 会让全体老用户升级瞬间被弹一次引导。

**@提及（v4.5.0）不占任何 DDL**：`notifications.type` 在第十七部分特意没加 CHECK，就是为了今天能直接写 `'mention'`（当时已把原因写在注释里）。提及对象由**前端**在正文里解析——只有从成员候选面板点选过的人才会进 `mentionIds`，数据库不解析 Markdown 正文。这是有意的取舍：通知不是权限，「正文里恰好出现了某个姓名」不该误通知，而漏发的最坏后果只是少一条提醒。

**Phase 4 数据层（v4.6.0，第二十部分）：** 执行脚本 `supabase-phase4-v4.6.0.sql`（**需用户执行**），
自证脚本 `supabase-verify-v4.6.0.sql`（**改完必须跑，这是唯一能验证 RLS 的手段**，见上文「测试测不到什么」）。
六条不变量，动数据库前先读：

1. **写侧收口、读侧有意留宽**。14 张原本挂着 `authenticated_full_access FOR ALL USING(true)` 的表
   改成逐操作策略。写侧是重点：改前任何登录用户直接打 REST 就能 `PATCH users` 把自己写成 president、
   删光 tasks/notices。**读侧有 5 张表刻意保持「登录即可全量读」**——`users`（通讯录要读全员）、
   `tasks`（通讯录里的「他人任务计数」要读全校）、`tickets`/`ticket_records`（人人都要算剩余票数）、
   `school_notices`。按部门收紧它们会让页面**静默少数据而不是报错**，比不收紧更危险；
   真要收得先把那几处改成聚合 RPC（见 `docs/ISSUES.md` #14）。
   **但「读侧留宽」不等于「对 anon 开放」**：策略不写 `TO` 就是 `TO PUBLIC`（含 anon）。
   `platform_guides` 的读策略 2026-07 建时就漏了 `TO authenticated`，2026-09-12 自证脚本点名后一并收口
   （改名为 `platform_guides_select_authenticated`）。anon 本已无表权限，所以这只是把第二道门也关上。
2. **策略辅助函数一律 SECURITY DEFINER**（`my_department` / `is_admin` / `is_presidium` /
   `is_dept_head_of` / `can_view_post` / `can_manage_post` / `can_view_task` / `can_review_task`）。
   策略表达式以**当前用户**身份求值，直接写子查询会连带触发被引用表的 RLS，变成「策略依赖策略」，
   症状是「本该放行的行被判拒绝」。函数只给 `authenticated` EXECUTE——收回了它，**所有**策略会报 42501。
3. **`users` 没有 INSERT 策略，这是刻意的**。注册只能走 `register_user()`（SECURITY DEFINER）：
   它复核邀请码、**由邀请码推导 role 与 department**、建号、核销，全在一个事务里。
   留一条 `WITH CHECK (auth_id = auth.uid())` 看似只允许「写自己」，但 `role` 是请求体带来的
   ——那等于允许任何人把自己注册成 president。
4. **`role` / `department` 的变更由守卫触发器兜底**（`trg_guard_users_privilege`）：
   只有管理员能改，`auth_id` 与 `student_id` 一律不可变（可改＝可劫持）。
   策略表达不了「这次更新动了哪些列」，所以必须用 `BEFORE UPDATE OF <列>` 触发器。
5. **anon 的本事比你以为的大**。Supabase 建库时对 public schema 有
   `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO anon`——**后建的函数默认 anon 也能调**。
   2026-09-12 实测：`role_level` / `is_organizer` / `semester_of` / `check_in_ticket` / `ticket_qr_token`
   全部 anon 可调（前三个直接返回数据）。新增函数一律显式 `REVOKE … FROM PUBLIC, anon` 再 `GRANT`；
   第二十部分已对 `anon` 收回全部表级权限并取消了这条默认授权。
6. **顺序：先建新策略，后拆旧的全量放行**。策略之间是并集，两套并存时权限仍是旧的宽松状态；
   反过来先拆后建，中间会出现「一条策略都没有」的真空期，线上请求会被拒。

## v4.6.0 增强（2026-09-12）

本版**没有用户可见的新功能**，全是安全与运维（如实写在 version.json 的 changelog 里）：

1. **细粒度 RLS 收口**（C2）——14 张表的写权限逐操作收口、`users` 提权路径封死、
   RPC 的 anon 授权收回、注册搬进 `register_user()`（角色由邀请码推导、顺带修掉并发核销的竞态）
2. **每周自动备份**（D1）——全库导出 gzip JSON 提交进私有备份仓库，附恢复脚本（`docs/backup-restore.md`）
3. **外部拨测**（D2）——UptimeRobot 监控首页与 version.json 的配置步骤（`docs/uptime-monitor.md`）
4. **无障碍**（C3）——首份审计报告 `docs/a11y-audit.md`；critical 级清零（8 个 antd Select 补 `aria-label`），
   并加 axe 回归门禁

## v4.5.0 增强（2026-09-12）

1. **论坛互动** — 帖子卡与详情页可点赞 / 收藏（乐观更新 + 计数列），侧栏新增「我的收藏」筛选；部门负责人及以上可置顶，列表置顶帖排最前
2. **@提及** — 帖子与回复编辑器输入 `@` 弹出成员候选（`MentionInput`，光标定位在 mention.ts 的纯函数里），正文按名册高亮（`MentionText` / `mentionComponents`），被提及者收 `mention` 通知
3. **新人引导** — 新注册账号首次登录弹三步抽屉（看使用指南 → 认领第一个任务 → 完善个人资料），可跳过；完成或跳过后落库 `users.onboarded = true`
4. **个人资料编辑** — 个人中心「编辑资料」：显示名、头像（复用 attachments 公开 bucket，路径 `avatars/{userId}/`）、联系方式；`AuthUpdateContext` 让顶部头像与个人信息卡片即时回显，不必刷新
5. **性能** — 论坛列表的回复数/点赞数改读计数列，查询数从 1+N 降为 1（见上文第十九部分）

## v4.4.0 增强（2026-09-11）

1. **考核积分** — 个人中心「我的积分」（数字滚动总分 + 明细 + 导出）；权限管理·工作看板「本学期积分排行」（部门内/全校、构成 Tag、导出）。积分由数据库触发器记账，**前端只读**
2. **票务闭环** — 票务详情 Drawer（活动说明 / 组织者签到名单 + 导出）；「我的票券」生成 15 分钟有效的签到二维码 + 原文可复制；组织者「扫码签到」（`html5-qrcode` 动态 import 调摄像头，失败降级手输，走同一个 `check_in_ticket` RPC）
3. **批量邀请码** — 权限管理·成员管理「批量生成」（数量/角色/部门/有效期，同批共享 `batch_id`）→ 结果表 + 复制全部 + 导出 CSV
4. **依赖新增** — `qrcode`（MIT）/ `html5-qrcode`（Apache-2.0），**均动态 import**，不进首屏包

## v4.3.0 增强（2026-09-11）

1. **数据导出** — `src/utils/export.ts` + 成员名单 / 任务清单（跟随筛选）/ 数据看板汇总三处入口
2. **通知中心升级** — 分页加载（每页 20）、任务/公告/论坛/系统分栏计数、只看未读、一键已读（按栏）、同类折叠合并
3. **登录流优化** — 学号 debounce 即查 `check_student_registered`：已注册隐藏邀请码栏、按钮转「下一步：输入密码」
4. **细节打磨** — 任务详情弹窗按 id 取数（审核后状态同步）、全局搜索结果按模块分组、全站空态统一走 `EmptyState`

## 三期增强功能（2026-07-08 ~ 2026-07-09）

1. **通知中心** — NotificationBell.tsx，Realtime 推送 + Bell Badge + 5 类自动触发
2. **公告已读确认** — 阅读标记 UPSERT + 已读/未读人名弹窗
3. **首页工作台** — DashBoardPage.tsx，统计卡片 + 活动时间线 + 快捷操作
4. **任务看板** — KanbanBoard.tsx，@dnd-kit 拖拽 + 列表/看板切换 + 乐观更新
5. **文件上传** — FileUpload/FileList，Supabase Storage + 3 表单集成

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
| 逐轮总结（交付 + 经验） | `docs/<日期>-<版本>迭代总结.md`（最近的：`2026-09-12-v4.6.0迭代总结.md`） |
| 备份与恢复 | `docs/backup-restore.md` |
| 外部拨测 | `docs/uptime-monitor.md` |
| 无障碍审计报告（自动生成） | `docs/a11y-audit.md` |
| 跨轮经验教训 | `docs/lessons-learned-phase1-5.md` |

## 启动命令

```bash
npm run dev      # 开发服务器 → http://localhost:5173/student-union-platform/
npm run build    # 生产构建（tsc -b && vite build）
npm run preview  # 预览生产构建
npm test         # Service 层单测（vitest + 本地 stub）
npm run test:e2e # E2E 冒烟（Playwright + 本地 stub）
npm run lint     # oxlint
```

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
