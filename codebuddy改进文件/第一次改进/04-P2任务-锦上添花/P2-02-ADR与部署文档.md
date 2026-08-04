# P2-02 — ADR 与部署文档

## 📋 任务元信息

| 项 | 值 |
|----|----|
| 优先级 | 🟢 P2 锦上添花（换届交接刚需） |
| 预估工时 | 1 天 |
| 依赖任务 | 无（随时可做，建议尽早） |
| 涉及文件 | 新建 `docs/adr/`、`docs/deploy.md` |
| 风险等级 | 无 |
| 需要数据库迁移 | ❌ 否 |

---

## 🎯 任务背景

**问题：** 你毕业了，下一任开发者接手。目前没有完整的部署文档和设计决策记录，继任者根本起不来环境。

**这是单人项目最严重的可持续性问题。** 技术债务可以慢慢还，但"知识只在一个人脑子里"是最大的风险。

## ✅ 完成目标

1. 编写 `docs/deploy.md`：从零部署的完整步骤。
2. 编写 `docs/adr/`（Architecture Decision Records）：记录关键设计决策。
3. 导出 Supabase 配置说明。

---

## 🚧 硬约束

1. **只新建文档文件，不改代码**。
2. **文档要能让"完全没接触过这个项目的人"按步骤操作**。
3. 不写"理论上可以"的内容，每一步都要实际验证过。

---

## 🔧 执行步骤

这个任务**不需要 DeepSeek 写代码**，主要是整理知识。可以：
1. 自己写（推荐，你最懂项目）。
2. 让 DeepSeek 根据你提供的项目信息生成草稿，你再校对补充。

---

## 💬 喂给 DeepSeek 的 Prompt

````markdown
# 任务：编写部署文档和 ADR

## 角色与上下文

你是技术文档工程师，为一个 React 19 + Supabase 的学生会平台编写交接文档。
项目作者即将毕业，需要让继任者能独立部署和维护。

## 任务目标

1. 编写 docs/deploy.md：完整部署步骤。
2. 编写 docs/adr/*.md：关键设计决策记录。

## 输入：项目信息

- 仓库：github.com/YHLLXY/student-union-platform
- 部署：GitHub Pages（HashRouter，base /student-union-platform/）
- 后端：Supabase（项目 bbyykrgitgawqwdgcxhp）
- 技术栈：React 19 / TS 6 / Vite 8 / Ant Design 6 / Supabase JS
- 启动命令：npm run dev / npm run build
- 环境变量：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（GitHub Secrets）
- 数据库迁移：supabase-migration.sql（手动在 Dashboard 执行）
- PWA：sw.js + version.json + manifest.json

## 输出要求

### 1. docs/deploy.md 结构

```markdown
# 部署指南

## 一、前置准备
- Node.js 20+
- npm
- GitHub 账号
- Supabase 账号

## 二、克隆项目
git clone ...

## 三、安装依赖
npm install

## 四、配置 Supabase
1. 创建 Supabase 项目
2. 执行 supabase-migration.sql（完整复制到 SQL Editor）
3. 创建 Storage bucket "attachments"
4. 获取 URL 和 anon key

## 五、配置环境变量
- 本地：创建 .env 文件
- GitHub：Settings → Secrets

## 六、本地开发
npm run dev

## 七、部署到 GitHub Pages
1. push 到 master
2. GitHub Actions 自动 build + deploy
3. 确认 Pages source = GitHub Actions

## 八、更新版本号
- public/version.json
- public/sw.js 的 CACHE_VERSION

## 九、常见问题
- SPA 路由 404 → 用 HashRouter
- SW 不更新 → 改 CACHE_VERSION
- Storage 上传失败 → 检查 bucket 策略
```

### 2. docs/adr/ 目录结构

```
docs/adr/
├── 0001-use-supabase-as-backend.md
├── 0002-invite-code-registration.md
├── 0003-dual-permission-model.md
├── 0004-fire-and-forget-analytics.md
├── 0005-task-submission-review-flow.md
└── 0006-github-pages-hosting.md
```

每个 ADR 文件格式：
```markdown
# ADR-000X: 决策标题

## 状态
已采纳 / 已废弃 / 已替代

## 日期
2026-XX-XX

## 背景
为什么需要做这个决策？面临什么问题？

## 决策
选择了什么方案？

## 理由
为什么选这个方案？考虑过哪些替代方案？

## 后果
这个决策带来的影响（正面+负面）
```

### 3. 具体要写的 ADR

请根据项目审查材料，为以下决策各写一个 ADR：

1. **ADR-0001: 使用 Supabase 作为后端**
   - 背景：单人维护，不写后端代码
   - 决策：用 Supabase BaaS
   - 理由：零中间服务，免费档够用
   - 后果：被 Supabase 绑定，免费档有限制

2. **ADR-0002: 邀请码注册（无邮箱/手机）**
   - 背景：学生会没有成员邮箱数据库
   - 决策：邀请码 + 虚拟邮箱（学号@stuunion.org）
   - 后果：学号可枚举，需配合密码强度+限流（P0-05）

3. **ADR-0003: 双重权限模型（前端 hasMinRole + RLS）**
   - 背景：前端权限可被绕过
   - 决策：前端做 UX 优化，RLS 做数据保护
   - 后果：两处维护，但安全性有保障

4. **ADR-0004: 埋点 fire-and-forget 无重试**
   - 背景：用户量小，数据不关键
   - 决策：不引入队列+重试
   - 后果：可能丢少量埋点，但系统简单

5. **ADR-0005: 任务提交审批流**
   - 背景：仿企业 OA
   - 决策：先提交 → 部长审核 → 通过/打回
   - 后果：比"标记完成"复杂，但流程更规范

6. **ADR-0006: GitHub Pages 托管**
   - 背景：免费、自动部署
   - 决策：GitHub Pages + Actions
   - 后果：不支持自定义响应头，SW 受限

### 4. 自检清单
- [ ] deploy.md 每一步可操作
- [ ] ADR 每篇结构完整
- [ ] 环境变量名正确
- [] 命令可直接复制执行
````

---

## 📝 验收标准

- [ ] `docs/deploy.md` 已创建
- [ ] `docs/adr/` 下至少 6 个 ADR 文件
- [ ] 找一个不了解项目的人（或假装自己是继任者）按 deploy.md 操作，能跑起来

---

## 🧪 验证步骤

1. 按 `deploy.md` 从零克隆 + 部署，确认每一步无误。
2. 检查 ADR 是否覆盖了项目所有关键决策。

---

## 📦 Commit Message

```
docs: 新增部署指南和 ADR

[P2-02] 编写 docs/deploy.md 完整部署步骤，docs/adr/ 记录 6 个
关键设计决策（Supabase/邀请码/双重权限/埋点/审批流/托管），
为换届交接做准备。
```

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
