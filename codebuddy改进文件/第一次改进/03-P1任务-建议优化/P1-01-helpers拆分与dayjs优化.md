# P1-01 — helpers 拆分与 dayjs 优化

## 📋 任务元信息

| 项 | 值 |
|----|----|
| 优先级 | 🟡 P1 建议优化 |
| 预估工时 | 1 天 |
| 依赖任务 | 无 |
| 涉及文件 | `src/utils/helpers.ts`（拆分）、所有 import helpers 的文件 |
| 风险等级 | 中（影响面广，需全面回归测试） |
| 需要数据库迁移 | ❌ 否 |

---

## 🎯 任务背景

**问题：** `helpers.ts` 打包后 778KB，是首屏加载的最大瓶颈。原因是 `import dayjs from 'dayjs'` 全量引入了 dayjs（含 locale + 插件），而 helpers.ts 被几乎所有组件引用。

**当前 helpers.ts 只有 52 行**，包含：
- `hasMinRole` / `isAdmin` — 角色判断（纯逻辑，无依赖）
- `formatDate` / `formatDateTime` — 日期格式化（依赖 dayjs）
- `getDepartmentLabel` / `getRoleLabel` — 标签转换（纯查表）
- `formatFileSize` — 文件大小（纯计算）
- `getFileIcon` — 文件图标（纯查表）

**优化思路：**
1. 把 dayjs 换成原生 `Intl.DateTimeFormat`（简单格式化不需要 dayjs）。
2. 把 helpers.ts 拆成按职责的独立文件，利于 tree-shaking。
3. 如果某些场景确实需要 dayjs（如相对时间"3 小时前"），按需引入插件。

## ✅ 完成目标

1. 去掉 `dayjs` 依赖（或改为按需引入），打包体积显著下降。
2. helpers 拆分为 `dateUtils.ts` / `roleUtils.ts` / `fileUtils.ts`。
3. 保留 `helpers.ts` 作为 barrel export（re-export），**避免破坏现有 import**。
4. build 通过，所有功能正常。

---

## 🚧 硬约束（违反即返工）

1. **保留 `src/utils/helpers.ts`** 作为 barrel export（`export * from './dateUtils'` 等），**现有 import 路径不变**。
2. **不删除 `dayjs` 依赖**（package.json 不改），只是 helpers 不再全量引入。如果其他文件直接用了 dayjs，保持不变。
3. **不改函数签名和返回值**。
4. **不改任何组件的 import 路径**（除非新建文件需要新 import）。
5. 日期格式化结果必须与 dayjs **完全一致**（`YYYY-MM-DD` → `2026-07-26`，`YYYY-MM-DD HH:mm` → `2026-07-26 14:30`）。

---

## 📂 需要阅读的上下文文件

| 文件 | 用途 |
|------|------|
| `src/utils/helpers.ts` | 当前实现，要拆分 |
| `src/utils/constants.ts` | `ROLE_LEVEL` / `DEPARTMENTS` / `ROLES` 定义 |
| `grep "from.*helpers"` 的结果 | 看哪些文件 import 了 helpers |

---

## 🔧 执行步骤

1. 新建 `src/utils/dateUtils.ts`、`roleUtils.ts`、`fileUtils.ts`。
2. `helpers.ts` 改为 barrel export。
3. build + 全面回归测试。

---

## 💬 喂给 DeepSeek 的 Prompt

````markdown
# 任务：helpers 拆分 + 去除 dayjs 全量依赖

## 角色与上下文

你是资深前端工程师，维护一个 React 19 + TypeScript 的学生会平台。
`helpers.ts` 打包 778KB（dayjs 全量引入），是首屏瓶颈。需要拆分并替换 dayjs。

## 任务目标

1. 新建 dateUtils.ts / roleUtils.ts / fileUtils.ts 三个文件。
2. dateUtils 用原生 Intl.DateTimeFormat 替代 dayjs。
3. helpers.ts 改为 barrel export，保持现有 import 路径不变。
4. 不改任何函数签名和返回值。

## 硬约束（违反即返工）

1. 保留 `src/utils/helpers.ts` 作为 barrel export。
2. 不改 package.json（不删 dayjs 依赖）。
3. 不改函数签名和返回值。
4. 不改任何组件的 import 路径。
5. 日期格式化结果必须与 dayjs 完全一致。
6. 不引入新依赖。

## 输入：当前代码

### 文件 1：src/utils/helpers.ts（完整）

```typescript
import dayjs from 'dayjs';
import { ROLE_LEVEL, DEPARTMENTS, ROLES } from './constants';

/** 判断用户是否满足最低角色要求 */
export function hasMinRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_LEVEL[userRole] ?? -1) >= (ROLE_LEVEL[requiredRole] ?? 99);
}

/** 判断是否为最高权限（主席或老师） */
export function isAdmin(role: string): boolean {
  return role === 'president' || role === 'teacher' || role === 'developer';
}

/** 格式化日期 YYYY-MM-DD */
export function formatDate(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/** 格式化日期时间 YYYY-MM-DD HH:mm */
export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm');
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

## 输出要求

### 1. 修改的文件清单
- 新建 `src/utils/dateUtils.ts`
- 新建 `src/utils/roleUtils.ts`
- 新建 `src/utils/fileUtils.ts`
- 修改 `src/utils/helpers.ts`（改为 barrel export）

### 2. dateUtils.ts 实现

用原生 Intl.DateTimeFormat 替代 dayjs。**注意时区问题**：dayjs 默认本地时区，Intl 也默认本地时区，一致。

```typescript
/** 格式化日期 YYYY-MM-DD（本地时区） */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 格式化日期时间 YYYY-MM-DD HH:mm（本地时区） */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dateStr = formatDate(d);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dateStr} ${h}:${min}`;
}
```

**为什么不用 Intl.DateTimeFormat：** 对于 `YYYY-MM-DD` 这种简单格式，手动 padStart 更直观且性能更好。Intl 适合本地化场景（如"2026年7月26日"），这里不需要。

### 3. roleUtils.ts 实现

```typescript
import { ROLE_LEVEL, DEPARTMENTS, ROLES } from './constants';

/** 判断用户是否满足最低角色要求 */
export function hasMinRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_LEVEL[userRole] ?? -1) >= (ROLE_LEVEL[requiredRole] ?? 99);
}

/** 判断是否为最高权限（主席或老师） */
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

### 4. fileUtils.ts 实现

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

### 5. helpers.ts 改为 barrel export

```typescript
// Barrel export — 保持现有 import 路径不变
// 新代码请直接从具体文件 import（如 `import { formatDate } from './utils/dateUtils'`）
export * from './dateUtils';
export * from './roleUtils';
export * from './fileUtils';
```

### 6. 自检清单
- [ ] 三个新文件函数签名与原 helpers.ts 完全一致
- [ ] helpers.ts 只有 re-export，无逻辑
- [ ] dateUtils 不 import dayjs
- [ ] 日期格式化结果与 dayjs 一致（本地时区）
- [ ] 无 TODO / 占位符
````

---

## 📝 验收标准

- [ ] 新建 `dateUtils.ts` / `roleUtils.ts` / `fileUtils.ts`
- [ ] `helpers.ts` 改为 barrel export
- [ ] `dateUtils.ts` 不 import dayjs
- [ ] `npm run build` 0 error
- [ ] 打包体积对比（应明显减小）

---

## 🧪 验证步骤

### 1. Build + 体积对比

```bash
# 改之前先记录体积
npm run build
# 记下 dist/assets/*.js 的总大小

# 改之后
npm run build
# 对比体积，helpers 相关 chunk 应从 778KB 降到 < 10KB
```

### 2. 功能回归测试（关键）

`helpers.ts` 被几乎所有组件引用，必须全面测试：

```bash
npm run dev
```

- [ ] 登录页：角色判断正常
- [ ] 仪表盘：日期显示正常（`YYYY-MM-DD HH:mm`）
- [ ] 任务列表：截止日期格式正确
- [ ] 公告列表：创建时间格式正确
- [ ] 论坛：发帖时间格式正确
- [ ] 票务：活动时间格式正确
- [ ] 文件上传：文件大小显示正确（`1.5 MB`）
- [ ] 文件上传：文件图标正确
- [ ] 通讯录：部门中文名显示正确
- [ ] 个人中心：角色中文名显示正确

### 3. 时区测试（关键）

dayjs 和原生 Date 都用本地时区，但需确认 Supabase 返回的 ISO 字符串解析一致：

```javascript
// 在浏览器 Console 验证
const iso = '2026-07-26T14:30:00+08:00';
console.log(formatDate(iso));      // 应为 '2026-07-26'
console.log(formatDateTime(iso));  // 应为 '2026-07-26 14:30'

const utc = '2026-07-26T06:30:00Z';
console.log(formatDateTime(utc));  // 北京时区应为 '2026-07-26 14:30'
```

---

## ⚠️ 风险与回滚

**风险 1：** 时区不一致（dayjs 和原生 Date 对 ISO 字符串的解析可能有差异）。

**应对：** Supabase 返回的是 `TIMESTAMPTZ`，序列化为带时区的 ISO 字符串。`new Date(iso)` 会解析为本地时区，与 dayjs 一致。上面的时区测试验证这一点。

**风险 2：** 某些组件直接 import 了 dayjs（不只是通过 helpers），拆分后 tree-shaking 仍把 dayjs 打进去。

**应对：** build 后用 `npx vite-bundle-visualizer` 看打包图，确认 dayjs 是否还在。如果还有其他文件 import dayjs，那是单独的优化点（不在本任务范围）。

**回滚：**
```bash
git checkout HEAD -- src/utils/helpers.ts
# 删除新建的三个文件
rm src/utils/dateUtils.ts src/utils/roleUtils.ts src/utils/fileUtils.ts
```

---

## 📦 Commit Message

```
perf(utils): helpers 拆分 + 去除 dayjs 全量依赖

[P1-01] 将 helpers.ts 拆分为 dateUtils/roleUtils/fileUtils 三个文件，
dateUtils 用原生 Date 替代 dayjs，helpers.ts 改为 barrel export
保持向后兼容。打包体积从 778KB 降至 < 10KB。
```

---

> 📎 项目归属：[[学生会交流平台 - 门户口]]
> 🔗 关联：[[2026-07-26-barrel-export向后兼容拆分]]
