# helpers 拆分 + dayjs 替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 52 行的 `helpers.ts` 按职责拆分为 3 个独立文件（date/role/file），将 `formatDate`/`formatDateTime` 中的 dayjs 替换为原生 `Intl.DateTimeFormat`，保持 barrel export 向后兼容。

**Architecture:** 新建 `dateUtils.ts`（日期）、`roleUtils.ts`（角色权限）、`fileUtils.ts`（文件工具），各文件零外部依赖。`helpers.ts` 改为纯 re-export 文件，所有 30 个现有 import 无需修改。

**Tech Stack:** TypeScript + `Intl.DateTimeFormat`（零依赖日期格式化）

---

## 改动文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/utils/dateUtils.ts` | `formatDate` / `formatDateTime`（Intl 实现） |
| 新建 | `src/utils/roleUtils.ts` | `hasMinRole` / `isAdmin` / `getDepartmentLabel` / `getRoleLabel` |
| 新建 | `src/utils/fileUtils.ts` | `formatFileSize` / `getFileIcon` |
| 修改 | `src/utils/helpers.ts` | 删除所有实现，改为 re-export |

**不修改 30 个 import 文件。** 这是本计划最关键的兼容性设计：所有 `import ... from '../utils/helpers'` 或 `import ... from '../../utils/helpers'` 保持不变，barrel export 让他们无感升级。

---

## 风险评估与危险预案

| 风险 | 严重度 | 预案 |
|------|--------|------|
| `Intl.DateTimeFormat` 浏览器兼容性 | 🟢 低 | `Intl.DateTimeFormat` 在 2016+ 所有浏览器可用（包括 iOS Safari 10+、Android Chrome 54+）。项目目标用户（大学生）的手机系统版本远高于此。如果莫名报错，格式会返回 fallback 字符串 |
| dayjs 仍被 `dashboardService.ts`、`MilestonePanel.tsx`、`TaskDetail.tsx` 引用 | 🟢 低 | dayjs 不会从 `package.json` 移除，bundle 中 dayjs 仍存在。这是**渐进式迁移**第一步，不是一次性全部替换。`dashboardService.ts` 使用了 `isoWeek` 插件，替换成本高，不在本次范围 |
| `TaskForm.tsx` 引用 `import type { Dayjs } from 'dayjs'` | 🟢 无影响 | 类型导入，不影响运行时 |
| 拆分后函数签名变化导致调用方类型错误 | 🔴 高 | **保持不变。** 函数名、参数类型、返回值类型完全一致。barrel re-export 确保 import 路径不变 |

---

### Task 1: 新建 `dateUtils.ts`（零依赖日期格式化）

**Files:**
- Create: `src/utils/dateUtils.ts`

- [ ] **Step 1: 创建文件**

```typescript
/**
 * 日期工具函数 — 零外部依赖，使用原生 Intl.DateTimeFormat
 *
 * 为什么不用 dayjs？
 *   - dayjs 引入 ~7KB gzipped，本项目 helpers.ts 被 30+ 文件引用
 *   - formatDate / formatDateTime 只需要简单的格式化，不需要日期计算
 *   - Intl.DateTimeFormat 是 ECMAScript 标准，2016+ 浏览器全支持
 *   - 注意：dayjs 仍被 dashboardService/MilestonePanel 使用（复杂计算），
 *     全局替换是后续工作，不在本次范围
 */

/** 格式化日期 YYYY-MM-DD */
export function formatDate(date: string | Date): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '—';
  }
}

/** 格式化日期时间 YYYY-MM-DD HH:mm */
export function formatDateTime(date: string | Date): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch {
    return '—';
  }
}
```

**关键设计决策：** 不使用 `Intl.DateTimeFormat('zh-CN', ...).format()` 方式，因为手写 `padStart` 比 `Intl.DateTimeFormat` 生成的 `2026/7/26` 更可控（保证 `-` 分隔符 + 补零）。并且手写方式避免了 `Intl.DateTimeFormat` 的 locale 不确定性问题（某些旧 iOS 版本对 `zh-CN` 的 `hour12` 处理不一致）。

- [ ] **Step 2: Commit**

```bash
git add src/utils/dateUtils.ts
git commit -m "feat(utils): 新建 dateUtils.ts，零依赖日期格式化"
```

---

### Task 2: 新建 `roleUtils.ts`（角色权限工具）

**Files:**
- Create: `src/utils/roleUtils.ts`

- [ ] **Step 1: 创建文件**

```typescript
import { ROLE_LEVEL, DEPARTMENTS, ROLES } from './constants';

/** 判断用户是否满足最低角色要求 */
export function hasMinRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_LEVEL[userRole] ?? -1) >= (ROLE_LEVEL[requiredRole] ?? 99);
}

/** 判断是否为最高权限（主席/老师/开发者） */
export function isAdmin(role: string): boolean {
  return role === 'president' || role === 'teacher' || role === 'developer';
}

/** 根据英文 key 获取部门中文名 */
export function getDepartmentLabel(key: string): string {
  if (!key) return '—';
  return DEPARTMENTS[key] ?? key;
}

/** 根据英文 key 获取角色中文名 */
export function getRoleLabel(key: string): string {
  return ROLES[key] ?? key;
}
```

**函数签名完全复制自 `helpers.ts`，无任何改动。**

- [ ] **Step 2: Commit**

```bash
git add src/utils/roleUtils.ts
git commit -m "feat(utils): 新建 roleUtils.ts，角色/部门/权限判断"
```

---

### Task 3: 新建 `fileUtils.ts`（文件工具）

**Files:**
- Create: `src/utils/fileUtils.ts`

- [ ] **Step 1: 创建文件**

```typescript
/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 根据 MIME 类型返回文件图标 */
export function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('excel') || type.includes('sheet')) return '📊';
  if (type.includes('powerpoint') || type.includes('presentation')) return '📽️';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z') || type.includes('tar') || type.includes('gzip')) return '📦';
  return '📄';
}
```

**函数签名完全复制自 `helpers.ts`，无任何改动。**

- [ ] **Step 2: Commit**

```bash
git add src/utils/fileUtils.ts
git commit -m "feat(utils): 新建 fileUtils.ts，文件大小/图标工具"
```

---

### Task 4: 重写 `helpers.ts` 为纯 re-export

**Files:**
- Modify: `src/utils/helpers.ts`（全量替换）

- [ ] **Step 1: 替换文件内容**

将 [helpers.ts](src/utils/helpers.ts) 全部内容替换为：

```typescript
/**
 * 工具函数 barrel export
 *
 * 实际实现已按职责拆分到：
 *   - dateUtils.ts — 日期格式化
 *   - roleUtils.ts — 角色/权限/部门/标签
 *   - fileUtils.ts — 文件大小/图标
 *
 * 此文件保留 re-export，所有现有 import 无需修改。
 */

export { formatDate, formatDateTime } from './dateUtils';
export { hasMinRole, isAdmin, getDepartmentLabel, getRoleLabel } from './roleUtils';
export { formatFileSize, getFileIcon } from './fileUtils';
```

**关键：** 删除 `import dayjs from 'dayjs'` —— 这是本次优化的核心收益。helpers.ts 不再引用 dayjs，所有通过 helpers.ts 间接触发 dayjs 加载的 30 个文件不再依赖 dayjs。

- [ ] **Step 2: Build 验证**

```bash
npm run build
```
期望：0 error，0 warning。

TypeScript 会检查所有 30 个 import 文件的类型兼容性——如果 re-export 类型不匹配，build 会报错。这是自动的回归测试。

- [ ] **Step 3: 手动抽查 2-3 个页面**

```bash
npm run dev
```

验证：
- [ ] 仪表盘页 → 日期正常显示（`formatDateTime`、`formatDate` 被 `DashBoardPage`、`KanbanCard`、`TaskDetail` 使用）
- [ ] 成员管理页 → 角色/部门标签正常（`getDepartmentLabel`、`getRoleLabel` 被 `MemberManage` 使用）
- [ ] 文件上传 → 文件大小/图标正常（`formatFileSize`、`getFileIcon` 被 `FileUpload`、`FileList` 使用）
- [ ] 抢票页 → 抢票按钮正常（`hasMinRole` 被 `TicketList` 使用）

- [ ] **Step 4: Commit**

```bash
git add src/utils/helpers.ts
git commit -m "refactor(utils): helpers.ts 拆分为 dateUtils/roleUtils/fileUtils，移除 dayjs 引用"
```

---

## 实现完成后自检

```
□ npm run build 0 error
□ 30 个 import 文件的类型检查全部通过（build 通过即验证）
□ helpers.ts 中不再有 dayjs import
□ formatDate / formatDateTime 使用原生实现，无外部依赖
□ 日期显示格式与原 dayjs 一致（YYYY-MM-DD / YYYY-MM-DD HH:mm）
□ hasMinRole / isAdmin 逻辑不变
□ getDepartmentLabel / getRoleLabel 逻辑不变
□ formatFileSize / getFileIcon 逻辑不变
□ 仪表盘 / 任务 / 公告 / 票务 / 论坛 / 成员管理 / 通知页面正常
```

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
> 🔗 关联：[[2026-07-26-barrel-export向后兼容拆分]]
