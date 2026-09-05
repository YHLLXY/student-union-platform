# ADR-001: 选择 Supabase 作为后端平台

- **状态:** 已采纳
- **日期:** 2025-06（项目启动时）
- **决策者:** 余翰林（独立开发者）

## 上下文

学生会交流平台需要一个后端来存储用户数据、任务、公告、票务等信息。作为单人项目，需要选择一个能快速开发、零运维的后端方案。

评估的方案：
1. **Firebase**（Google）— Firestore 数据库 + Auth
2. **Supabase**（开源）— PostgreSQL + Auth + Storage + Realtime
3. **自建后端**（Node.js + Express + PostgreSQL）

## 决策

选择 **Supabase**。

## 理由

| 维度 | Supabase | Firebase | 自建 |
|------|----------|----------|------|
| 数据库 | PostgreSQL（关系型，SQL） | Firestore（NoSQL） | 自己搭 |
| 免费额度 | 500MB 数据库 + 50K 月活 | 有免费层 | 需要服务器 |
| 实时通知 | Realtime（WebSocket） | Firestore 自带 | 需要 WebSocket 服务 |
| 学习成本 | 会 SQL 就行 | 需要学 Firestore 查询语法 | 需要学 DevOps |
| 迁移成本 | 标准 PostgreSQL，随时导出 | 被 Google 锁定 | 完全控制 |

核心考量：
- 本项目数据模型是**典型的关系型**（用户-部门-任务-公告），PostgreSQL 天然适合，NoSQL 反而别扭
- 单人项目没有运维能力，BaaS（Backend as a Service）是唯一现实选择
- Supabase 的 Realtime 功能（WebSocket 订阅数据库变更）让通知系统几乎零代码实现
- PostgreSQL 是行业标准，即使未来不用 Supabase，数据迁移到其他 PG 服务也简单

## 后果

### 正面
- 数据库 + 认证 + 存储 + 实时通知，一个平台全搞定
- 免费额度对 50-200 人的学生会完全够用
- SQL 让复杂查询（如工作看板聚合统计）变得简单

### 负面
- 网络延迟：Supabase 免费版服务器在海外（美西/新加坡），国内访问偶尔慢
- 冷启动：免费版数据库 7 天不活动会休眠，首次请求需要约 2 秒唤醒
- RLS（行级安全）配置不正确可能导致数据泄露——需要仔细验证

### 缓解措施
- PWA Service Worker 缓存策略（network-first）掩盖部分延迟
- 数据看板页面定期访问保持数据库活跃

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
