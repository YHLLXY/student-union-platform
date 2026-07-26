# Storage DELETE 策略修正 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `storage.objects` 的 DELETE 策略从"任何已登录用户都能删除任何附件"修正为"只有文件上传者本人才能删除"，防止恶意或误删。

**Architecture:** 利用 Supabase Storage 的 `owner` 字段（`storage.objects` 表自带 `owner` 列，存储上传者的 `auth.uid()`），DELETE 策略改为 `auth.uid() = owner`。上传时确保 `owner` 字段自动填充（Supabase Storage 在上传时已自动设置 `owner = auth.uid()`，但 RLS 策略需要显式引用它）。

**Tech Stack:** PostgreSQL RLS policy + Supabase Storage

---

## 改动文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `supabase-migration.sql:473-479` | 替换 DELETE policy |
| 修改 | `src/components/FileUpload.tsx:99-104` | 上传时传入 `metadata.owner`（兜底，Supabase 自带 owner 但显式声明更安全） |

**注意：** 本计划不改 `FileUpload.tsx` 的 `handleRemove`，只是改上传 metadata 做兜底。

---

## 当前问题

```sql
-- 当前 DELETE 策略（supabase-migration.sql:473-479）
CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');
```

**问题：** `auth.role() = 'authenticated'` 意味着任何已登录用户都能删除任何附件，不管是谁上传的。这在内部工具中虽然滥用概率低，但安全设计不合理。

---

## 风险评估与危险预案

| 风险 | 严重度 | 预案 |
|------|--------|------|
| **旧文件没有 owner 记录** | 🔴 高 | Supabase Storage **自动**设置 `owner = auth.uid()`（在 Storage API 层面，不是 SQL 层面）。除非文件是通过 Supabase Dashboard 手动上传的，否则都有 owner。如果确实有旧文件是 Dashboard 上传的（owner 为空），这些文件将无法被任何人通过前端删除。**处理方案：** DDL 中加一条 UPDATE 回填无 owner 的文件——但 storage.owner 不能随便填。实际上，Dashboard 手动上传的文件 owner 是上传时登录的 Supabase 账号，不太可能为空。如果为空，这些文件应该在 Dashboard 手动清理 |
| **RLS 策略变更需 Storage 权限** | 🟡 中 | `storage.objects` 的策略修改需要 Supabase Dashboard → SQL Editor 执行（与普通 public schema 一样），无需额外权限 |
| **策略替换后旧策略仍存在** | 🟢 低 | 我们用 `DROP POLICY IF EXISTS` + 重新 `CREATE POLICY` 的方式替换，避免重复策略 |
| **前端删除旧文件（策略变更前上传的）会失败** | 🟢 低 | Supabase Storage 在上传时自动设置 `owner = auth.uid()`，旧文件也有 owner。策略变更后，只要 `owner = auth.uid()` 匹配，删除仍正常。**但如果旧文件是别人上传的附件出现在你的帖子/任务里**，只有上传者能删除，非上传者不能删——这是**预期行为**，也是本次修正的目标 |

---

### Task 1: 修正 Storage DELETE 策略

**Files:**
- Modify: `supabase-migration.sql:473-479`

- [ ] **Step 1: 替换 DELETE policy**

将 [supabase-migration.sql:465-480](supabase-migration.sql#L465-L480) 的整个 DO 块中的 DELETE policy 部分替换。具体是将第 473-479 行：

```sql
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own attachments' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can delete own attachments"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');
  END IF;
```

替换为：

```sql
  -- 删除旧策略（如果存在）
  DROP POLICY IF EXISTS "Users can delete own attachments" ON storage.objects;

  -- 重建：只有文件上传者本人可以删除
  CREATE POLICY "Users can delete own attachments"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'attachments' AND auth.uid() = owner);
```

**关键变更：** `auth.role() = 'authenticated'` → `auth.uid() = owner`

`owner` 是 `storage.objects` 表的系统列，存储上传者的 `auth.uid()`。Supabase Storage API 在上传时自动填充此字段。

- [ ] **Step 2: 在 Supabase Dashboard SQL Editor 执行**

先检查现有策略：
```sql
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%delete%';
```
期望：看到旧的 "Users can delete own attachments" 策略。

然后执行 Step 1 中的 SQL（DROP + CREATE）。

再确认策略已更新：
```sql
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can delete own attachments';
```
期望：`qual` 中包含 `(auth.uid() = owner)`。

- [ ] **Step 3: Commit**

```bash
git add supabase-migration.sql
git commit -m "fix(db): Storage DELETE 策略改为仅文件上传者本人可删除"
```

---

### Task 2: 上传时显式传递 owner metadata（兜底）

**Files:**
- Modify: `src/components/FileUpload.tsx:99-104`

- [ ] **Step 1: 检查当前上传代码**

当前 [FileUpload.tsx:99-104](src/components/FileUpload.tsx#L99-L104)：

```typescript
const { data, error } = await supabase.storage
  .from('attachments')
  .upload(path, uploadFile, {
    cacheControl: '3600',
    upsert: false,
  });
```

Supabase Storage 的 `upload()` 方法在上传时自动以当前登录用户的 `auth.uid()` 作为 owner。不需要显式传递 `metadata`。但为了**安全兜底**（万一 Supabase 版本变更行为），在 upload options 中显式声明。不过 Supabase Storage JS SDK 的 `upload` 不支持直接设 owner——owner 是从 auth token 自动取的。

**结论：不需要修改 `FileUpload.tsx`。** 当前上传逻辑已正确使用 `supabase.storage.from('attachments').upload()`，它会自动从当前 session 提取 `auth.uid()` 并设为 owner。只需修正数据库的 DELETE policy 即可。

- [ ] **Step 2: 验证删除功能**

```bash
npm run dev
```

- [ ] 上传一个测试文件 → 刷新页面 → 点击删除 → 删除成功
- [ ] 检查 Supabase Dashboard → Storage → attachments → 文件已不存在
- [ ] 换个账号登录 → 如果能看到别人上传的文件（公开读策略允许），尝试调用删除 → 应失败（但前端 `handleRemove` 只删自己的文件，UI 上不会出现别人文件的删除按钮）

- [ ] **Step 3: Commit**

```bash
git add supabase-migration.sql
git commit -m "docs: 备注 Storage DELETE 策略变更说明"
```

---

## 实现完成后自检

```
□ DROP POLICY + CREATE POLICY 已执行
□ 新策略包含 auth.uid() = owner 条件
□ 上传者可以删除自己上传的文件
□ 非上传者不可以删除他人文件（前端 UI 本就不允许，后端策略是最后防线）
□ FileUpload 组件上传/删除功能正常
□ npm run build 0 error（前端无改动，一定通过）
```
