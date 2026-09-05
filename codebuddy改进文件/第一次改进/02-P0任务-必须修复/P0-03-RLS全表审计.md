# P0-03 — RLS 全表审计与补全

## 📋 任务元信息

| 项 | 值 |
|----|----|
| 优先级 | 🔴 P0 必须修复 |
| 预估工时 | 1 天 |
| 依赖任务 | 建议 P0-04 之后做（invite_codes 表结构变了） |
| 涉及文件 | `supabase-migration.sql`、新建 `docs/rls-audit.md` |
| 风险等级 | 高（越权访问风险） |
| 需要数据库迁移 | ✅ 是（启用 RLS + 创建策略） |

---

## 🎯 任务背景

**重大发现：** 审查 `supabase-migration.sql` 发现，**核心表的 RLS 策略全部是注释状态**！

```
第四部分 RLS 策略：
- users 表 RLS          ← 全部注释
- tasks 表 RLS          ← 全部注释
- notices 表 RLS        ← 全部注释
- forum_posts 表 RLS    ← 全部注释
- ticket_records 表 RLS ← 全部注释
- invite_codes 表       ← 无 RLS
- tickets 表            ← 无 RLS
- task_submissions 表   ← 无 RLS
- task_templates 表     ← 无 RLS
- task_milestones 表    ← 无 RLS
- school_notices 表     ← 无 RLS
- forum_replies 表      ← 无 RLS
- feedbacks 表          ← 无 RLS
- usage_events 表       ← 无 RLS

已启用的 RLS（仅 4 张表）：
- platform_guides       ← 已启用 + 策略
- notifications         ← 已启用 + 策略
- notice_reads          ← 已启用 + 策略
- storage.objects       ← 已启用 + 策略
```

**这意味着：** 用 anon key 任何人都能查询/修改 users、tasks、invite_codes 等表的数据（只要知道项目 URL 和 anon key，这两个本来就公开在前端代码里）。

## ✅ 完成目标

1. 编写审计脚本，列出所有表的 RLS 启用状态和策略。
2. 为所有核心表启用 RLS 并创建策略。
3. 策略遵循项目现有权限模型（部门隔离 + 角色分级）。
4. 写一份审计报告 `docs/rls-audit.md`，记录每张表的策略。

---

## 🚧 硬约束（违反即返工）

1. **只改 `supabase-migration.sql`，新建 `docs/rls-audit.md`**。
2. **不破坏现有功能**：启用 RLS 后，现有用户操作必须仍能正常工作。
3. **策略用 `DO $$ ... END $$` 包裹**，带 `IF NOT EXISTS` 检查，可重复执行。
4. **角色判断参考现有代码**：`role IN ('president', 'teacher', 'developer')` 为管理员。
5. **部门隔离参考现有代码**：`department = (SELECT department FROM users WHERE auth_id = auth.uid())`。
6. **不修改已启用的 4 张表策略**（platform_guides / notifications / notice_reads / storage.objects）。

---

## 📂 需要阅读的上下文文件

| 文件 | 用途 |
|------|------|
| `supabase-migration.sql` | 完整 schema + 现有 RLS 策略 |
| `src/utils/constants.ts` | 角色定义（ROLE_LEVEL） |
| `src/utils/helpers.ts` | `isAdmin` 判断逻辑 |

---

## 🔧 执行步骤

1. 先跑审计脚本，确认当前 RLS 状态。
2. 让 DeepSeek 生成所有表的 RLS 策略 SQL。
3. **先在 Supabase Dashboard 的 SQL Editor 里逐表执行**，每执行一张表就测试对应功能。
4. 全部通过后追加到 `supabase-migration.sql`。
5. 写审计报告。

**⚠️ 强烈建议：不要一次执行所有策略，逐表执行 + 逐表测试，出问题好定位。**

---

## 💬 喂给 DeepSeek 的 Prompt

````markdown
# 任务：RLS 全表审计与策略补全

## 角色与上下文

你是资深数据库安全工程师，维护一个 Supabase + PostgreSQL 的学生会平台。
当前核心表的 RLS 策略全部是注释状态（未启用），存在越权访问风险。需要为所有表启用 RLS 并创建符合权限模型的策略。

## 任务目标

1. 输出审计 SQL（查询当前 RLS 状态）。
2. 为以下 14 张表生成 RLS 策略：
   users, invite_codes, tasks, task_submissions, task_milestones, task_templates,
   notices, school_notices, forum_posts, forum_replies, tickets, ticket_records,
   feedbacks, usage_events
3. 已启用 RLS 的 4 张表（platform_guides, notifications, notice_reads, storage.objects）不动。

## 权限模型（来自项目代码）

角色层级：
- volunteer (0): 常驻志愿者，只能看本部门数据
- dept_head (1): 部门负责人，管理本部门
- presidium (2): 主席团，跨部门
- president (3): 主席，最高权限
- teacher (3): 老师，最高权限
- developer (3): 开发者，最高权限

管理员判断：`role IN ('president', 'teacher', 'developer')`
部门隔离：`department = (SELECT department FROM users WHERE auth_id = auth.uid())`

## 硬约束（违反即返工）

1. 只输出 SQL，不碰前端代码。
2. 策略用 `DO $$ ... END $$` 包裹，带 `IF NOT EXISTS` 检查。
3. 不修改已启用的 4 张表策略。
4. 所有策略用 `EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND ...)` 判断角色。
5. usage_events 表：用户只能 INSERT 自己的，不能 SELECT（管理员除外）。
6. invite_codes 表：普通用户只能 SELECT 自己使用的那个（不能浏览所有码）。
7. feedbacks 表：用户只能看自己的反馈，管理员可看全部。

## 输入：完整 Schema

【把 supabase-migration.sql 完整内容粘贴到这里】

## 输出要求

### 1. 审计 SQL（先跑这个，看当前状态）

```sql
-- RLS 审计脚本
SELECT 
  t.tablename AS table_name,
  t.rowsecurity AS rls_enabled,
  COALESCE(
    array_agg(p.policyname ORDER BY p.policyname) FILTER (WHERE p.policyname IS NOT NULL),
    ARRAY[]::TEXT[]
  ) AS policies
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public'
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;
```

### 2. 各表 RLS 策略

请按以下表格为每张表设计策略：

| 表 | SELECT | INSERT | UPDATE | DELETE |
|----|--------|--------|--------|--------|
| users | 自己 + 管理员 | 通过注册流程（见下） | 自己 + 管理员 | 管理员 |
| invite_codes | 不能直接查（通过 RPC）| 管理员 | 管理员（撤销用）| 管理员 |
| tasks | 本部门 + 管理员 | dept_head+ | 创建者 + dept_head+ + 管理员 | 创建者 + 管理员 |
| task_submissions | 自己的 + 部门负责人 + 管理员 | 自己 | 部门负责人（审核）| 管理员 |
| task_milestones | 能看任务的人 | dept_head+ | dept_head+ | 创建者 + 管理员 |
| task_templates | 本部门 + 管理员 | dept_head+ | 创建者 + 管理员 | 创建者 + 管理员 |
| notices | 本部门 + 管理员 | dept_head+ | 创建者 + 管理员 | 创建者 + 管理员 |
| school_notices | 所有人（已登录） | 管理员 | 创建者 + 管理员 | 管理员 |
| forum_posts | 本部门 + 协作部门 + 管理员 | 已登录用户 | 创建者 | 创建者 + 管理员 |
| forum_replies | 能看帖的人 | 已登录用户 | 创建者 | 创建者 + 管理员 |
| tickets | 所有人（已登录） | 管理员 | 创建者 + 管理员 | 管理员 |
| ticket_records | 自己的 + 票务创建者 + 管理员 | 通过 RPC（P0-01）| 管理员 | 自己（退票）+ 管理员 |
| feedbacks | 自己的 + 管理员 | 已登录用户 | 自己 | 自己 + 管理员 |
| usage_events | 管理员（聚合查询） | 已登录用户（只能写自己的 user_id）| 管理员 | 管理员 |

### 3. users 表的特殊处理

users 表的 INSERT 不能简单"自己插自己"——因为注册时用户还没登录（用 anon key）。
方案：允许已认证用户 INSERT（`auth.role() = 'authenticated'`），但在应用层用邀请码控制。
或者：用 `auth.role() = 'anon'` 允许注册时 INSERT，但加约束 `student_id` 唯一（已有 UNIQUE）。

**推荐：** 允许 `auth.role() IN ('authenticated', 'anon')` INSERT，业务逻辑由前端邀请码控制。

### 4. 输出格式

对每张表，输出：

```sql
-- ============================================================
-- 表名 RLS 策略（P0-03）
-- ============================================================
ALTER TABLE 表名 ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '策略名' AND tablename = '表名') THEN
    CREATE POLICY "策略名" ON 表名 FOR SELECT
      USING (...);
  END IF;
  -- ... 其他策略
END $$;
```

### 5. 自检清单
- [ ] 14 张表都启用 RLS
- [ ] 每张表至少有 SELECT 策略
- [ ] 策略用 EXISTS 子查询判断角色
- [ ] 部门隔离正确
- [ ] users 表 INSERT 允许注册流程
- [ ] usage_events 用户不能 SELECT（管理员除外）
- [ ] invite_codes 普通用户不能浏览
- [ ] 策略用 DO $$ 包裹可重复执行
````

---

## 📝 验收标准

- [ ] 审计脚本已运行，确认 14 张表 RLS 未启用
- [ ] `supabase-migration.sql` 追加了所有表的 RLS 策略
- [ ] `docs/rls-audit.md` 记录了每张表的策略
- [ ] 所有 SQL 在 Supabase Dashboard 执行成功
- [ ] 启用后现有功能全部正常（逐模块测试）

---

## 🧪 验证步骤

### 1. 审计（执行前）

在 Supabase Dashboard → SQL Editor 运行审计脚本，截图保存当前状态（大部分表 `rls_enabled = false`）。

### 2. 逐表执行（关键）

**不要一次执行所有策略！** 按以下顺序逐表执行 + 测试：

```
1. users 表          → 测试：登录、查看通讯录、修改个人信息
2. tasks 表          → 测试：查看任务列表、发布任务、编辑任务
3. task_submissions  → 测试：提交任务、部长审核
4. notices 表        → 测试：查看公告、发布公告
5. forum_posts       → 测试：发帖、回帖
6. tickets 表        → 测试：查看票务、抢票
7. ticket_records    → 测试：抢票、查看我的票
8. invite_codes      → 测试：注册流程
9. 其余表            → 逐个执行
```

每张表执行后：
- [ ] `npm run dev` 打开应用
- [ ] 用 volunteer 账号测试对应功能
- [ ] 用 dept_head 账号测试对应功能
- [ ] 用 president 账号测试对应功能
- [ ] 全部正常 → 执行下一张表
- [ ] 出问题 → DROP POLICY 回退该表，调整后再试

### 3. 越权测试（关键）

用 volunteer 账号登录后，在浏览器 Console 执行：
```javascript
// 假设 supabase 客户端已全局可用，或从 app 上下文获取
// 尝试查询其他部门任务（应被拒）
const { data, error } = await supabase.from('tasks').select('*');
console.log('能看到任务数:', data?.length, '错误:', error?.message);

// 尝试查询所有用户（应只返回自己）
const { data: users } = await supabase.from('users').select('*');
console.log('能看到用户数:', users?.length);

// 尝试查询邀请码（应被拒或只返回自己用的）
const { data: codes } = await supabase.from('invite_codes').select('*');
console.log('能看到邀请码数:', codes?.length);
```

### 4. 审计（执行后）

再次运行审计脚本，确认所有表 `rls_enabled = true` 且有策略。

---

## ⚠️ 风险与回滚

**风险 1：** 启用 RLS 后现有功能失效（策略写错，用户查不到数据）。

**应对：** 逐表执行（见验证步骤），每张表执行后立即测试。出问题立即：
```sql
ALTER TABLE 表名 DISABLE ROW LEVEL SECURITY;
-- 或删除有问题的策略
DROP POLICY IF EXISTS "策略名" ON 表名;
```

**风险 2：** users 表 INSERT 策略阻止注册。

**应对：** 策略允许 `auth.role() IN ('authenticated', 'anon')` INSERT。

**风险 3：** 抢票 RPC（P0-01）受 RLS 影响。

**应对：** P0-01 的 `grab_ticket` RPC 用 `SECURITY DEFINER`，绕过 RLS。确保该 RPC 在 RLS 启用后仍能工作。

**回滚（全局）：**
```sql
-- 紧急情况：禁用所有表的 RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'ALTER TABLE ' || t || ' DISABLE ROW LEVEL SECURITY';
  END LOOP;
END $$;
```

---

## 📦 Commit Message

```
feat(db): RLS 全表审计与策略补全

[P0-03] 审计发现 14 张核心表 RLS 未启用，存在越权风险。
为 users/invite_codes/tasks/task_submissions/task_milestones/
task_templates/notices/school_notices/forum_posts/forum_replies/
tickets/ticket_records/feedbacks/usage_events 启用 RLS 并创建
符合权限模型的策略。新增 docs/rls-audit.md 审计报告。
```

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
