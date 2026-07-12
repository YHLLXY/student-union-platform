# 邀请码状态修正与删除功能 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复停用邀请码显示"已使用"的 bug，新增高权限者删除未使用邀请码功能

**Architecture:** 纯前端 + Service 层修正，不改数据库。用 `used_by` 字段区分"已使用"（有值）和"已停用"（null），新增 `deleteInviteCode()` 函数

**Tech Stack:** React + TypeScript + Ant Design + Supabase

---

### Task 1: adminService.ts — 新增 deleteInviteCode 函数

**Files:**
- Modify: `src/modules/admin/adminService.ts`

- [ ] **Step 1: 在 deactivateInviteCode 之后添加 deleteInviteCode 函数**

```typescript
/** 删除邀请码（仅限未被使用的） */
export async function deleteInviteCode(codeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('invite_codes')
    .delete()
    .eq('id', codeId);

  if (error) { log.error('deleteInviteCode 删除失败', error); return false; }
  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/admin/adminService.ts
git commit -m "feat: adminService 新增 deleteInviteCode 函数"
```

---

### Task 2: InviteCodeManage.tsx — 状态三态判定 + 删除按钮

**Files:**
- Modify: `src/modules/admin/InviteCodeManage.tsx`

- [ ] **Step 1: 修改 import，加入 Popconfirm 和 deleteInviteCode**

将第 1 行的 `Popconfirm` 加入 antd import（当前未导入），将第 6 行的 `deactivateInviteCode` 改为 `deactivateInviteCode, deleteInviteCode`。

- [ ] **Step 2: 修改状态列 render 函数（替换原 77-81 行）**

原代码：
```typescript
{
  title: '状态', dataIndex: 'is_used', key: 'is_used',
  render: (used: boolean) => used
    ? <Tag color="default">已使用</Tag>
    : <Tag color="green">可用</Tag>,
},
```

改为：
```typescript
{
  title: '状态', dataIndex: 'is_used', key: 'status',
  render: (_: boolean, record: InviteCode) => {
    if (!record.is_used) return <Tag color="green">可用</Tag>;
    if (record.used_by) return <Tag color="default">已使用</Tag>;
    return <Tag color="red">已停用</Tag>;
  },
},
```

- [ ] **Step 3: 新增 handleDelete 函数（在 handleDeactivate 之后）**

```typescript
const handleDelete = async (id: string) => {
  const ok = await deleteInviteCode(id);
  if (ok) {
    message.success('已删除');
    loadCodes();
  } else {
    message.error('删除失败');
  }
};
```

- [ ] **Step 4: 新增权限判断变量（在 isDeptHead 之后）**

```typescript
const canDelete = hasMinRole(userRole, 'presidium');
const isGlobalAdmin = hasMinRole(userRole, 'president');
```

- [ ] **Step 5: 替换操作列 render 函数（替换原 122-139 行）**

原代码中 `Popconfirm` 已导入但在此处未使用过。新的操作列 logic：

```typescript
{
  title: '操作', key: 'actions',
  render: (_: unknown, record: InviteCode) => {
    const isAvailable = !record.is_used;
    const isDeactivated = record.is_used && !record.used_by;
    const canDeleteThis = (isAvailable || isDeactivated)
      && (isGlobalAdmin || (canDelete && record.department === userDept));

    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {isAvailable && (
          <>
            <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(record.code)}>
              复制
            </Button>
            <Button size="small" danger onClick={() => handleDeactivate(record.id)}>
              停用
            </Button>
          </>
        )}
        {canDeleteThis && (
          <Popconfirm
            title="确认删除该邀请码？删除后不可恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        )}
      </div>
    );
  },
},
```

- [ ] **Step 6: 确认移动端兼容性**

表格已有 `scroll={{ x: 'max-content' }}`，操作按钮均为 `size="small"`。无需额外 CSS 改动。

- [ ] **Step 7: Build 验证**

```bash
npm run build
```
预期：0 error

- [ ] **Step 8: Commit**

```bash
git add src/modules/admin/InviteCodeManage.tsx
git commit -m "fix: 邀请码状态三态修正 + 新增删除功能"
```

---

### Task 3: 文档更新

**Files:**
- Modify: `docs/ISSUES.md` — 记录此 bug
- Modify: `README.md` — 更新日志 v2.7

- [ ] **Step 1: ISSUES.md 新增 #8 记录**

- [ ] **Step 2: README 更新日志追加 v2.7**

- [ ] **Step 3: Commit**

```bash
git add docs/ISSUES.md README.md
git commit -m "docs: 记录邀请码状态修正 #8 + README v2.7"
```
