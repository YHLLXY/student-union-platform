# 移动端适配（第二阶段）设计文档

> 2026-07-12 | 学生会线上交流平台
> 包含：工作台（Dashboard）页面 + 抢票（Tickets）模块响应式适配

---

## 一、概述

在 Phase 1（AppLayout Sider→Drawer + 公告模块）基础上，完成剩余两个核心模块的移动端适配。

**设计原则：**
- 断点 768px（Ant Design `md`），与 Phase 1 一致
- 所有 CSS 修改在 `@media` 块内，桌面端零影响
- 不改数据流、不改路由、不改组件逻辑
- Tickets 模块已有部分 @media 规则（grid 3→2→1 列），本次仅补充缺失部分

---

## 二、Dashboard：工作台页面

### 2.1 DashBoardPage.tsx 改动

**新增 import：**
```typescript
import { Grid } from 'antd';  // 追加到现有 antd import
const { md } = Grid.useBreakpoint();
```

**待审核任务 Modal — 宽度响应式：**
```tsx
// 修改前
<Modal width={500} ... >
// 修改后
<Modal width={md ? 500 : undefined} ... >
```

### 2.2 ReportModal.tsx 改动

**新增 import：**
```typescript
import { Grid } from 'antd';  // 追加到现有 antd import
const { md } = Grid.useBreakpoint();
```

**Modal 宽度：**
```tsx
// 修改前
<Modal width={720} ... >
// 修改后
<Modal width={md ? 720 : undefined} ... >
```

**Descriptions — column 响应式：**
```tsx
// 修改前
<Descriptions bordered size="small" column={3} ... >
// 修改后
<Descriptions bordered size="small" column={md ? 3 : 2} ... >
```
> 注：手机端 2 列足够展示 6 项概览（3 行 × 2 列），无需再减到 1 列。横屏或 480px+ 设备上 column=2 仍然舒适。

**两个 Table — 横向滚动：**
```tsx
// 按部门统计 Table
<Table scroll={{ x: 'max-content' }} ... />

// 月度完成榜 Table
<Table scroll={{ x: 'max-content' }} ... />
```
> `max-content` 按内容宽度自动计算，列少时不滚、列多时可滚。无需 hardcode 像素值。

### 2.3 dashboard.module.css 新增

```css
@media (max-width: 768px) {
  .welcome {
    font-size: 18px;
  }

  .welcomeSub {
    font-size: 12px;
    margin-bottom: 16px;
  }

  /* 快捷入口：全宽单列 */
  .quickActions {
    flex-direction: column;
    gap: 8px;
  }

  /* 统计卡片：2 列网格 */
  .statsRow {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .statValue {
    font-size: 22px;
  }

  .statLabel {
    font-size: 11px;
  }

  /* 时间线：时间自然换行到内容下方 */
  .timelineItem {
    flex-wrap: wrap;
  }

  .timelineTime {
    width: 100%;
    /* 无 padding-left — 时间在第二行自然左对齐 */
  }
}
```

### 2.4 brief.module.css 新增

```css
@media (max-width: 768px) {
  .briefBody {
    flex-direction: column;
    gap: 12px;
  }

  .briefStat {
    min-width: unset;
  }

  .briefStatValue {
    font-size: 15px;
  }
}
```

---

## 三、Tickets：活动抢票模块

### 3.1 已有适配（不重复工作）

`tickets.module.css` 已有以下规则，本次不动：

```css
@media (max-width: 1200px) {
  .ticketGrid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .ticketGrid { grid-template-columns: 1fr; }
}
```

### 3.2 TicketList.tsx 改动

**新增 import：**
```typescript
import { Grid } from 'antd';  // 追加到现有 antd import
const { md } = Grid.useBreakpoint();
```

**发布票务 Modal — 宽度响应式：**
```tsx
// 修改前
<Modal width={600} ... >
// 修改后
<Modal width={md ? 600 : undefined} ... >
```

### 3.3 TicketForm.tsx 改动

**并排字段加 CSS class：**
```tsx
// 修改前
<div style={{ display: 'flex', gap: 16 }}>
// 修改后
<div className={styles.formRow}>
```

### 3.4 tickets.module.css 新增

```css
@media (max-width: 768px) {
  /* pageHeader：与公告模块保持一致的折行逻辑 */
  .pageHeader {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .pageHeader h2 {
    font-size: 16px !important;
  }

  /* 卡片封面缩小 */
  .cardCover {
    height: 100px;
  }

  .cardTitle {
    font-size: 14px;
  }

  .cardMeta {
    font-size: 12px;
  }

  .remaining {
    font-size: 15px;
  }

  /* 表单并排字段堆叠 */
  .formRow {
    flex-direction: column;
    gap: 0;
  }

  /* 我的票券：允许折行 */
  .myTicketItem {
    flex-wrap: wrap;
    gap: 8px;
  }
}
```

**并在 base 样式中新增 `.formRow` 类：**
```css
.formRow {
  display: flex;
  gap: 16px;
}
```

---

## 四、不改的内容

- `DashBoardPage.tsx` — 统计卡片逻辑、快捷入口权限判断、动态时间线加载
- `WeeklyBriefCard.tsx` — 无改动（`.briefBody` 已有 `flex-wrap`，本次仅 CSS 增强）
- `ReportModal.tsx` — 数据获取、排序、格式化逻辑
- `MyTickets.tsx` — 退票逻辑、时间判断
- `ticketService.ts` — 零改动
- `dashboardService.ts` — 零改动
- 侧边栏徽标系统 — 不受影响

---

## 五、桌面端影响分析

| 改动 | 桌面端影响 |
|------|:--:|
| CSS `@media (max-width: 768px)` | ❌ 无 |
| Modal `width={md ? N : undefined}` | ❌ 无 — `md=true` → 固定宽度 |
| Descriptions `column={md ? 3 : 2}` | ❌ 无 — `md=true` → 3 列 |
| Table `scroll.x: 'max-content'` | ❌ 无 — 桌面端 Table 本来就不超容器宽度 |
| TicketForm 并排字段 `.formRow` | ❌ 无 — base 规则仍是 `flex row` |

---

## 六、性能自查

| 检查项 | 结果 | 说明 |
|------|:--:|------|
| Promise.all / N+1 | ✅ | 不涉及数据查询改动 |
| Realtime | ✅ | 不改订阅逻辑 |
| 新增 npm 包 | ✅ | `useBreakpoint` 是 antd 自带 |
| 新增 useEffect | ✅ | 无 |
| Bundle 体积 | ✅ | 仅 CSS + 少量条件渲染 |
| LIMIT | ✅ | 不涉及列表查询 |

---

## 七、文件改动清单

| 文件 | 操作 | 改动量 |
|------|:--:|------|
| `src/modules/dashboard/DashBoardPage.tsx` | 修改 | +Grid import + useBreakpoint + 1 处 Modal width |
| `src/modules/dashboard/ReportModal.tsx` | 修改 | +Grid import + useBreakpoint + Modal width + Descriptions column + 2 处 Table scroll.x |
| `src/modules/dashboard/dashboard.module.css` | 修改 | 新增 @media 块 |
| `src/modules/dashboard/brief.module.css` | 修改 | 新增 @media 块 |
| `src/modules/tickets/TicketList.tsx` | 修改 | +Grid import + useBreakpoint + 1 处 Modal width |
| `src/modules/tickets/TicketForm.tsx` | 修改 | 并排字段 inline style → CSS class |
| `src/modules/tickets/tickets.module.css` | 修改 | 新增 .formRow + @media 块补充 |

---

## 八、与 Phase 1 的关系

Phase 1 提供的容器基础（AppLayout contentArea padding 12px、Drawer 导航）对 Phase 2 无额外依赖。两个阶段可独立验证：

- Phase 1：全局布局 + 公告模块
- Phase 2：工作台 + 抢票模块

部署顺序不影响功能。
