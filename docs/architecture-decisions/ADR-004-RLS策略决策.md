# ADR-004: 暂缓启用全部 RLS——使用应用层权限控制

- **状态:** 已采纳（可重新讨论）
- **日期:** 2025-06（初始决策），2026-07（重新评估）
- **决策者:** 余翰林（独立开发者）

## 上下文

Supabase 推荐使用 RLS（Row Level Security）作为数据库安全层。项目早期写了 RLS 策略但全部注释掉了（见 `supabase-migration.sql` 第四部分），实际使用应用层权限模型（`hasMinRole()` + 前端查询过滤）。

2026-07 重新评估后，决定**暂缓全面启用 RLS**，但**对特定高价值表启用**。

## 决策

**分阶段启用 RLS：**

| 表 | RLS 状态 | 原因 |
|----|----------|------|
| `notifications` | 已启用 | 用户只能读自己的通知，几乎无副作用 |
| `notice_reads` | 已启用 | 用户只能创建自己的已读记录 |
| `platform_guides` | 已启用 | 只读公开，管理写受限 |
| `usage_events` | 未启用 | 只通过 `trackEvent()` 匿名写入，无读权限需求 |
| `users` / `tasks` / `notices` / `forum_posts` / `forum_replies` / `tickets` / `ticket_records` | 未启用 | 见下方理由 |

**不启用全面 RLS 的理由：**

1. **部门权限不够简单：** RLS 策略中 `department = (SELECT department FROM users WHERE auth_id = auth.uid())` 这种子查询在小数据量（50-200人）下没问题，但"主席看全校""协作部门看跨部帖子"等场景让策略迅速复杂化。

2. **单人项目，前端是唯一的数据库消费者：** 没有第三方 API 直接查数据库。所有查询都经过 service 层过滤。只要 service 层的 `hasMinRole()` 过滤正确，数据库层 RLS 就是重复的。

3. **Supabase 的 anon key 已公开在 JS bundle 中：** 即使启用 RLS，攻击者拿到 anon key 后仍能以已登录用户身份调 API。RLS 只限制"同角色的用户不能看其他部门数据"，不防"恶意用户用自己账号爬数据"。对于学生会平台，风险可接受。

4. **RLS 策略调试困难：** 策略写错 → 用户看不到数据 → 很难排查是前端 Bug 还是 RLS 拦截。Supabase Dashboard 没有 RLS 调试工具。

## 后果

### 正面
- 应用层权限逻辑集中在 `hasMinRole()` + service 函数中，一处修改全局生效
- 不受 RLS 限制，管理员可以灵活查询跨部门数据

### 负面
- 如果未来有人写了一个新的 service 函数忘记加权限过滤 → 数据可能泄露
- 如果 Supabase anon key 泄露 → 攻击者可以以任意已登录用户的身份调 API

### 缓解措施
- 所有 service 函数遵循统一模式（见 `ticketService.ts`）
- 对敏感操作（如抢票）使用 RPC + `SECURITY DEFINER` 而非直接操作表
- 如果项目将来用户量增长或向外校开放，应重新评估全面启用 RLS

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
