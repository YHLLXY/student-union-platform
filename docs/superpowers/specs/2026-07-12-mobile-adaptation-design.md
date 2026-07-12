# 移动端适配（第一阶段）设计文档

> 2026-07-12 | 学生会线上交流平台
> 包含：公告模块独立适配 + AppLayout 全局导航改造

---

## 一、概述

在现有代码基础上添加 `@media (max-width: 768px)` 断点规则，实现公告模块和全局导航的移动端适配。桌面端不受任何影响。

**设计原则：**
- 断点 768px（Ant Design `md`，覆盖所有手机 + 竖屏平板）
- 所有 CSS 修改在 `@media` 块内，桌面端零影响
- 不改数据流、不改路由、不改组件逻辑
- AppLayout 改造为后续页面适配提供容器基础

---

## 二、全局布局：AppLayout 改造

### 2.1 断点检测

```typescript
import { Grid } from 'antd';
const { md } = Grid.useBreakpoint();  // md = screen ≥ 768px
```

### 2.2 导航模式切换

| 屏幕 | 模式 | 实现 |
|------|------|------|
| ≥768px | `Layout.Sider`（保持现状） | 现有代码不变 |
| <768px | `Drawer` + 汉堡按钮 | 新增条件渲染 |

```tsx
// 新增状态
const [drawerOpen, setDrawerOpen] = useState(false);

// Sider 渲染
{md ? (
  <Sider width={200} collapsible collapsed={collapsed} onCollapse={setCollapsed}>
    <Menu mode="inline" selectedKeys={[location.pathname]} items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 4 }} />
  </Sider>
) : (
  <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
          placement="left" width={220} bodyStyle={{ padding: 0 }}>
    <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 16,
                   borderBottom: '1px solid #f0f0f0' }}>
      🏛 学生会
    </div>
    <Menu mode="inline" selectedKeys={[location.pathname]} items={menuItems}
          onClick={({ key }) => { navigate(key); setDrawerOpen(false); }}
          style={{ borderRight: 0 }} />
  </Drawer>
)}
```

### 2.3 Header 移动端精简

```tsx
// 桌面端：所有元素
// 移动端：仅汉堡按钮 + Logo + Bell + 头像
{!md && (
  <Button type="text" icon={<MenuOutlined />}
          onClick={() => setDrawerOpen(true)}
          style={{ color: '#fff', fontSize: 16 }} />
)}
<span className={styles.logo}>🏛 学生会</span>
{/* GlobalSearch: md 时显示，否则隐藏 */}
{md && <GlobalSearch />}
<div className={styles.headerRight}>
  {/* 指南 + 反馈：仅 md 显示 */}
  {md && <><GuideBtn /><FeedbackBtn /></>}
  <NotificationBell />
  <Dropdown ... />
</div>
```

### 2.4 CSS 新增

```css
@media (max-width: 768px) {
  .header {
    padding: 0 12px;
  }

  .contentArea {
    padding: 12px;
  }
}
```

### 2.5 Drawer 行为

| 行为 | 规则 |
|------|------|
| 滑出方向 | 左（`placement="left"`） |
| 宽度 | 220px（比桌面 Sider 略宽，触控友好） |
| 点击菜单项 | `navigate(key)` + 自动关闭 |
| 点击遮罩层 | 关闭 |
| `destroyOnClose` | 不设置（保持 DOM，避免重复渲染菜单） |

---

## 三、公告模块适配

### 3.1 好消息

NoticeList 已使用 `<Card>` 布局（非 Table），卡片天然撑满容器宽度，无需结构重构。只需断点规则微调。

### 3.2 NoticeList.tsx 改动

三个 Modal 的 `width` 改为响应式：

```tsx
// 发布公告 Modal
<Modal width={md ? 600 : undefined} ... >

// 转为任务 Modal
<Modal width={md ? 500 : undefined} ... >

// 已读名单 Modal
<Modal width={md ? 420 : undefined} ... >
```

`undefined` → Ant Design 自动撑到屏幕宽度。

### 3.3 notices.module.css 新增

```css
@media (max-width: 768px) {
  .pageHeader {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .pageHeader h2 {
    font-size: 16px;
  }

  .cardHeader {
    flex-wrap: wrap;
    gap: 4px;
  }

  .cardTitle {
    font-size: 14px;
    flex-basis: 100%;
  }

  .cardMeta {
    font-size: 12px;
  }

  .cardContent {
    font-size: 13px;
  }
}
```

---

## 四、不改的内容

- 公告详情页 — 竖向排版天然自适应
- 所有 `.tsx` 逻辑代码
- 路由、数据流、状态管理
- 侧边栏徽标系统（`badges` 状态在 Drawer 模式下正常工作）

---

## 五、桌面端影响分析

| 改动 | 桌面端影响 |
|------|:--:|
| CSS `@media (max-width: 768px)` | ❌ 无 — 桌面端屏幕 ≥1024px，规则永不触发 |
| Modal `width={md ? 600 : undefined}` | ❌ 无 — `md=true` → 仍为固定宽度 |
| Sider/Drawer 条件渲染 | ❌ 无 — `md=true` → 走 Sider 分支 |
| Header 条件渲染 | ❌ 无 — `md=true` → 全部显示 |

---

## 六、性能自查

| 检查项 | 结果 | 说明 |
|------|:--:|------|
| Promise.all / N+1 | ✅ | 不涉及数据查询 |
| Realtime | ✅ | 不改订阅逻辑 |
| 新增 npm 包 | ✅ | `useBreakpoint` 是 antd 自带 |
| Bundle 体积 | ✅ | 仅 CSS + 少量条件渲染 |
| LIMIT | ✅ | 不涉及列表查询 |

---

## 七、对后续阶段的兼容

| 后续任务 | 兼容性 |
|------|------|
| 第三步：工作台适配 | Content padding 已缩减至 12px，卡片 Grid 可直接用 `@media` 改列数 |
| 第三步：抢票适配 | 同上，`TicketList` 的 `Card` 布局本身已可响应 |
| 远期：底部 Tab | `badges` 状态可直接消费，无需改数据层 |

---

## 八、实施步骤

1. `AppLayout.tsx` — 新增 `useBreakpoint` + `drawerOpen` + 条件渲染 + Header 精简
2. `AppLayout.module.css` — 新增 `@media` 规则
3. `NoticeList.tsx` — Modal width 响应式（3 处）
4. `notices.module.css` — 新增 `@media` 规则
5. `npm run build` 验证
6. 提交推送 + 更新 README 更新日志
