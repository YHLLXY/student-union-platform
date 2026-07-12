# 邀请码状态修正与删除功能 — 设计文档

> 2026-07-12 | 设计决策：纯前端逻辑修正（方案 A），零数据库迁移

## 问题背景

1. **停用邀请码显示"已使用"**：`deactivateInviteCode` 通过设置 `is_used = true` 来停用，但前端渲染把 `is_used = true` 统一显示为"已使用"——一个布尔字段承载了两种不同语义
2. **无法删除无用邀请码**：未被使用的邀请码无法删除，数据只会越积越多

## 根因分析

`is_used` 布尔字段的语义过载：

| 场景 | `is_used` | `used_by` | 期望显示 | 实际显示 |
|------|:--:|:--:|------|------|
| 未被使用 | `false` | `null` | 可用 | ✅ 可用 |
| 被注册使用 | `true` | 有 UUID | 已使用 | ✅ 已使用 |
| 管理员停用 | `true` | `null` | 已停用 | ❌ 已使用 |

`used_by` 字段天然能区分"被使用"和"被停用"——被注册使用时 `used_by` 一定有值，管理员停用时 `used_by` 为 `null`。不需要新增数据库字段。

## 方案：纯前端 + Service 层逻辑修正

**不改数据库 schema，不改注册/登录流程。**

### 状态判定逻辑

```typescript
function getCodeStatus(record: InviteCode): 'available' | 'used' | 'deactivated' {
  if (!record.is_used) return 'available';
  if (record.used_by) return 'used';
  return 'deactivated';
}
```

| `is_used` | `used_by` | 状态 | Tag |
|:--:|:--:|------|------|
| `false` | — | `available` | 🟢 `可用` |
| `true` | 有值 | `used` | ⚪ `已使用` |
| `true` | `null` | `deactivated` | 🔴 `已停用` |

### 注册兼容性

- 注册校验方 `authService.ts` 查询条件为 `is_used = false`
- 停用操作不改，仍设置 `is_used = true`
- 已停用码 `is_used = true`，自然被注册拦截——零改动

### 删除功能

#### 权限矩阵

| 角色 | 可删除范围 |
|------|------|
| `president` / `teacher` | 所有 `used_by IS NULL` 的邀请码 |
| `presidium` | 本部门 + `used_by IS NULL` 的邀请码 |
| `dept_head` 及以下 | 不可删除 |

#### 删除条件

同时满足：`used_by IS NULL`（未被实际使用）+ 角色权限匹配

已使用的码（`used_by` 有值）不可删除——保留审计追溯。

#### 交互

- 删除按钮：`danger` 类型，`size="small"`，仅对满足条件的行显示
- 确认：`Popconfirm` 二次确认："确认删除该邀请码？删除后不可恢复"
- 回调：成功后 `message.success` + 刷新列表

### 操作列按钮矩阵

| 状态 | 可用 | 已停用 | 已使用 |
|------|------|------|------|
| 复制按钮 | ✅ | — | — |
| 停用按钮 | ✅ | — | — |
| 删除按钮 | ✅（有权限） | ✅（有权限） | — |

## 改动范围

### 文件清单

| 文件 | 改动内容 |
|------|------|
| `src/modules/admin/adminService.ts` | 新增 `deleteInviteCode()` 函数；`InviteCode` 类型保持不变 |
| `src/modules/admin/InviteCodeManage.tsx` | 状态列 render 三态判定；操作列增加删除按钮 + Popconfirm；权限守卫逻辑 |
| `src/modules/admin/admin.module.css` | 如有需要，补充移动端 @media 规则（当前已有 `flex-wrap` 和 `overflow-x` 处理） |

### 不改动的文件

- `authService.ts`：注册校验逻辑不变
- `supabase-migration.sql`：数据库结构不变
- 其他任何文件

## 边界情况

1. **重复操作**：已在某行触发删除但列表刷新前再次点击 → Popconfirm 的 `onConfirm` 调用 `deleteInviteCode`，后端 DELETE 对不存在的行返回 success（Supabase 不会抛错），前端正常刷新列表
2. **权限边界**：presidium 仅看到本部门的数据（`fetchInviteCodes` 已做部门过滤），删除权限自然限定在本部门
3. **已使用码保护**：`used_by` 有值即不渲染删除按钮，无法触发删除

## 移动端兼容

- 表格已有 `scroll={{ x: 'max-content' }}`，确保横向滚动
- 操作按钮最多 3 个（复制/停用/删除均已 `size="small"`），768px 以下不溢出
- `@media (max-width: 768px)` 规则已覆盖 header 的 `flex-wrap`
- 本次改动不引入任何新的固定宽度或 flex 布局
