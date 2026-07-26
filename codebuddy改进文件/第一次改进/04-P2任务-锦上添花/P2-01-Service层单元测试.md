# P2-01 — Service 层单元测试

## 📋 任务元信息

| 项 | 值 |
|----|----|
| 优先级 | 🟢 P2 锦上添花 |
| 预估工时 | 2 天 |
| 依赖任务 | 建议 P1 全部完成后做 |
| 涉及文件 | 新建 `vitest.config.ts`、`src/utils/__tests__/`、`package.json` |
| 风险等级 | 低 |
| 需要数据库迁移 | ❌ 否 |

---

## 🎯 任务背景

单人项目写 E2E 测试性价比低，但 **service 层单元测试**成本低、收益高——防止改 A 模块时悄悄弄坏 B 模块的纯逻辑函数。

**测试范围：** 只测纯逻辑函数（`hasMinRole`、`isAdmin`、`validatePasswordStrength`、`formatDate`、`formatFileSize` 等），不测 Supabase 查询（需要 mock，成本高）。

## ✅ 完成目标

1. 引入 Vitest（Vite 原生测试框架，零配置）。
2. 为 `utils/` 下的纯函数写测试。
3. 为 `ticketService` 的 `grabTicket` 逻辑写测试（mock supabase）。
4. `npm test` 一键运行。

---

## 🚧 硬约束（违反即返工）

1. **只引入 `vitest`，不引入 jest/playwright**。
2. **只测纯逻辑，不测组件渲染**（React 组件测试成本高，单人项目不值得）。
3. **Supabase 查询用 mock，不连真实数据库**。
4. 不改现有业务代码（只加测试文件 + 配置）。
5. 测试覆盖率不设硬指标（能覆盖核心逻辑即可）。

---

## 🔧 执行步骤

1. 安装 vitest：`npm i -D vitest`。
2. 新建 `vitest.config.ts`。
3. 写 `utils/__tests__/helpers.test.ts`、`utils/__tests__/safeQuery.test.ts`。
4. `package.json` 加 `"test": "vitest"` 脚本。

---

## 💬 喂给 DeepSeek 的 Prompt

````markdown
# 任务：Service 层单元测试

## 角色与上下文

你是资深前端工程师，维护一个 React 19 + TypeScript + Vite 的学生会平台。
需要为纯逻辑函数写单元测试，防止重构时回归。

## 任务目标

1. 引入 Vitest。
2. 为 utils/ 下的纯函数写测试。
3. 为 ticketService 的 grabTicket 写测试（mock supabase）。

## 硬约束

1. 只引入 vitest，不引入其他测试框架。
2. 只测纯逻辑，不测组件渲染。
3. Supabase 查询用 vi.mock。
4. 不改现有业务代码。
5. 测试文件放 `src/**/__tests__/` 目录。

## 输入：需要测试的函数

### utils/dateUtils.ts
- formatDate(date) → 'YYYY-MM-DD'
- formatDateTime(date) → 'YYYY-MM-DD HH:mm'

### utils/roleUtils.ts
- hasMinRole(userRole, requiredRole) → boolean
- isAdmin(role) → boolean
- getDepartmentLabel(key) → string
- getRoleLabel(key) → string

### utils/fileUtils.ts
- formatFileSize(bytes) → string
- getFileIcon(type) → string

### modules/auth/authService.ts
- validatePasswordStrength(password) → { valid, message }

## 输出要求

### 1. 修改的文件清单
- 修改 `package.json`（加 vitest 依赖 + test 脚本）
- 新建 `vitest.config.ts`
- 新建 `src/utils/__tests__/dateUtils.test.ts`
- 新建 `src/utils/__tests__/roleUtils.test.ts`
- 新建 `src/utils/__tests__/fileUtils.test.ts`
- 新建 `src/modules/auth/__tests__/authService.test.ts`

### 2. vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

### 3. 测试用例要求

#### dateUtils.test.ts
- formatDate('2026-07-26T14:30:00+08:00') === '2026-07-26'
- formatDate(new Date(2026, 6, 26)) === '2026-07-26'  // 注意月份 0-indexed
- formatDateTime('2026-07-26T14:30:00+08:00') === '2026-07-26 14:30'
- formatDateTime(null as any) → 不崩溃（测试边界）

#### roleUtils.test.ts
- hasMinRole('volunteer', 'volunteer') === true
- hasMinRole('volunteer', 'dept_head') === false
- hasMinRole('president', 'volunteer') === true
- hasMinRole('unknown', 'volunteer') === false
- isAdmin('president') === true
- isAdmin('teacher') === true
- isAdmin('developer') === true
- isAdmin('volunteer') === false
- getDepartmentLabel('') === '—'
- getDepartmentLabel('sports') === '体育部'  // 看 constants.ts 实际值
- getDepartmentLabel('unknown') === 'unknown'

#### fileUtils.test.ts
- formatFileSize(0) === '0 B'
- formatFileSize(1024) === '1.0 KB'
- formatFileSize(1048576) === '1.0 MB'
- getFileIcon('image/png') === '🖼️'
- getFileIcon('application/pdf') === '📕'
- getFileIcon('unknown/type') === '📄'

#### authService.test.ts
- validatePasswordStrength('123') → { valid: false }
- validatePasswordStrength('abcdefgh') → { valid: false, message 含'数字' }
- validatePasswordStrength('12345678') → { valid: false, message 含'字母' }
- validatePasswordStrength('abc12345') → { valid: true }

### 4. package.json 改动

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

### 5. 自检清单
- [ ] 只引入 vitest
- [ ] 测试文件在 __tests__ 目录
- [ ] 不改业务代码
- [ ] 测试覆盖边界情况（空值、未知类型）
- [ ] npm test 全部通过
````

---

## 📝 验收标准

- [ ] `vitest.config.ts` 已创建
- [ ] 4 个测试文件已创建
- [ ] `npm test` 全部通过
- [ ] `npm run build` 仍 0 error

---

## 🧪 验证步骤

```bash
npm i -D vitest
npm test
# 应显示所有测试通过
```

---

## 📦 Commit Message

```
test: 新增 service 层单元测试

[P2-01] 引入 Vitest，为 dateUtils/roleUtils/fileUtils/authService
的纯逻辑函数写单元测试，覆盖正常值和边界情况。
```
