# 数据库备份与恢复（Phase 4 · D1）

> 建立于 2026-09-12（v4.6.0）。一句话：**每周自动把 public 全表导出成 gzip JSON，提交进一个专用私有仓库；恢复用一条命令。**

## 为什么做这件事

Supabase 免费版项目在 2026-09-05 被自动暂停过一次（详见 `.github/workflows/supabase-keepalive.yml` 的事故复盘）。保活解决了「被暂停」，但解决不了另一半风险：**误删数据、误改策略、误执行 SQL 之后没有第二个副本可回**。平台数据（成员、任务、帖子、积分流水）目前只存在于一处，没有冗余。

## 备份是怎么跑的

`.github/workflows/backup.yml`，每周日 02:30 UTC（北京时间 10:30）自动执行，也可在 Actions 页手动 `Run workflow`。

```
scripts/backup-supabase.mjs  →  backup/<时间戳>/*.json.gz + manifest.json
                             →  提交到私有备份仓库的 latest/ 目录（git 历史 = 版本化快照）
                             →  同时作为 CI 产物留存 30 天（第二份副本）
```

脚本里三件关键的事，改动前请先读懂：

| 设计 | 为什么 |
|------|--------|
| **分页取数**（`Range` 头，每页 1000 行） | PostgREST 单次最多返回 1000 行。不分页的备份会「成功」地只备下前 1000 行——**这是最危险的失败，因为它看起来是成功的**。 |
| **行数自检**（用 `Prefer: count=exact` 拿到的总数与实抓行数比对） | 分页逻辑写错的唯一暴露点就是这里。对不上直接非 0 退出、不生成 manifest。 |
| **按主键稳定排序** | 翻页期间若有并发写入，不稳定排序会漏行或重复。 |

`app_secrets`（二维码签名密钥）**刻意不备份**：把密钥写进 git 历史等于长期泄露，而灾难恢复时重新生成一次密钥的代价仅仅是「已签发的签到二维码失效」。

## 一次性配置（需要你操作，约 5 分钟）

1. **建私有备份仓库**：GitHub 新建仓库，例如 `student-union-platform-backup`，**Visibility 必须选 Private**（里面有全员名单、联系方式、学号）。
2. **建细粒度 PAT**：Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   - Repository access：只勾选上面那个备份仓库；
   - Permissions → Repository permissions → **Contents: Read and write**；
   - 有效期建议 1 年（到期后备份会失败并邮件提醒，届时续期即可）。
3. **在平台仓库加三个 Secrets**（Settings → Secrets and variables → Actions → New repository secret）：
   | Secret | 值 |
   |--------|-----|
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role` key |
   | `BACKUP_REPO` | `你的用户名/student-union-platform-backup` |
   | `BACKUP_REPO_TOKEN` | 第 2 步生成的 PAT |
4. 到 Actions 页手动跑一次 `Supabase 每周备份`，确认绿灯 + 备份仓库里出现 `latest/`。

> ⚠️ **service_role key 的风险边界**：它绕过全部 RLS，等于数据库的万能钥匙。它只存在于 GitHub Secrets 与你的本地临时环境变量里，**不要写进 `.env` 提交、不要贴进任何聊天或文档**。若怀疑泄露，立刻在 Supabase Dashboard 轮换该 key。

## 本地手工备份（不依赖 CI）

```bash
# service_role key 只放在命令行环境变量里，别写进 .env
SUPABASE_URL="https://bbyykrgitgawqwdgcxhp.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role key>" \
node scripts/backup-supabase.mjs backup
```
输出形如：

```
  ✓ users                     18 行  0.9 KB gz
  ✓ tasks                      8 行  1.4 KB gz
  ...
表 20 张 · 共 89 行 · 0.01 MB gz
```

## 恢复流程

```bash
# 1. 先只校验，不写任何东西（默认行为，会打印目标库与行数）
SUPABASE_URL="https://bbyykrgitgawqwdgcxhp.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role key>" \
node scripts/restore-backup.mjs backup/20260913_030000

# 2. 核对「目标库」那一行确实是你要写的那台，再加 --yes 落地
SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
node scripts/restore-backup.mjs backup/20260913_030000 --yes

# 3. 只恢复某几张表
... node scripts/restore-backup.mjs backup/20260913_030000 --yes --table=users,tasks
```

脚本的几条硬约定：

- **必须 `--yes`**：不加只打印计划。这个脚本用 service_role 全库写入，误连生产会直接改数据，不能靠「小心点」来防。
- **先校验 sha256**：备份文件坏一位都拒绝写入（已实测：篡改一个字节 → 退出码 1、零写入）。
- **按依赖顺序写入**：父表先落（users → tasks → submissions → …），外键不是延迟约束。
- **幂等**：全程 `Prefer: resolution=merge-duplicates`（按主键 upsert），同一份备份重放多次不会产生重复行（已实测：2500 行重放后仍是 2500 行、id 全唯一）。
- **不会删除目标库里多出来的行**：备份之后新写入的数据会保留。要「完全回到备份时点」必须手工清表——本脚本刻意不做这件事，避免一个手滑把线上清空。

## 恢复之后建议做两件事

1. 跑一遍 `supabase-verify-v4.6.0.sql`（Phase 4 的权限自证）：确认 RLS 策略与函数授权都在位（表数据回来了不代表策略回来了）。
2. 抽查三张关键表与备份的行数是否一致（脚本每张表都打印写入行数）。

## 已知边界（不是 bug，是范围）

| 项 | 现状 | 说明 |
|----|------|------|
| **Storage 文件** | **不在备份内** | 头像与任务/公告/帖子的附件存在 `attachments` bucket。表里的 `attachments` 列只是路径数组，文件本体没备。真要备需另加 Storage 列举 + 下载流程（列入下轮候选）。 |
| `app_secrets` | 刻意排除 | 见上文。恢复后重新生成即可。 |
| RPO（可容忍的数据丢失窗口） | **最长 7 天** | 每周一次。若需要更短，把 cron 改成每天一次即可（备份体积很小，成本可忽略）。 |
| RTO（恢复耗时） | 分钟级 | 数据量在百 KB 级，实测 2589 行的往返是秒级。 |
