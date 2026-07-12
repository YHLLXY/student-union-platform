# 侧边栏导航徽标提醒 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 侧边栏"任务管理""部门公告""部门论坛"三个菜单项图标右上角添加小圆点，有未读通知时亮起，进入页面后自动消除。

**Architecture:** 数据层在 notificationService 新增两个函数（按模块查询未读 + 按类型批量标记已读），UI 层在 AppLayout 用 Ant Design Badge dot 渲染。复用现有 notifications 表和 Realtime 订阅。

**Tech Stack:** React 19, TypeScript 6, Ant Design 6 (Badge), Supabase JS SDK

**Spec:** `docs/superpowers/specs/2026-07-12-sidebar-badge-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|:--:|------|
| `src/modules/notification/notificationService.ts` | 新增函数 | 数据查询 + 批量标记已读 |
| `src/components/AppLayout.tsx` | 新增 imports + state + effects + 渲染改造 | 侧边栏徽标状态 + 自动清除 |

---

### Task 1: notificationService — 新增 fetchUnreadByModule

**Files:**
- Modify: `src/modules/notification/notificationService.ts`（追加到文件末尾）

- [ ] **Step 1: 添加 fetchUnreadByModule 函数**

在文件末尾追加（`subscribeToNotifications` 之后）：

```typescript
// ========== 侧边栏徽标 ==========

/** 一次查询获取三个核心模块的未读通知数量 */
export async function fetchUnreadByModule(userId: string): Promise<{
  tasks: number; notices: number; forum: number;
}> {
  const { data, error } = await supabase
    .from('notifications')
    .select('type')
    .eq('user_id', userId)
    .eq('is_read', false)
    .in('type', [
      'task_assigned',
      'submission_approved',
      'submission_rejected',
      'milestone_overdue',
      'new_notice',
      'forum_reply',
    ]);

  if (error) {
    log.error('fetchUnreadByModule 查询失败', error);
    return { tasks: 0, notices: 0, forum: 0 };
  }

  // 客户端聚合（未读量 <50，单次遍历 O(N) 开销可忽略）
  const result = { tasks: 0, notices: 0, forum: 0 };
  for (const row of data || []) {
    switch (row.type) {
      case 'new_notice':
        result.notices++;
        break;
      case 'forum_reply':
        result.forum++;
        break;
      default:
        // task_assigned / submission_approved / submission_rejected / milestone_overdue
        result.tasks++;
    }
  }
  return result;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit src/modules/notification/notificationService.ts 2>&1
```

预期：0 error（允许其他文件的既有错误，只关注本文件）

---

### Task 2: notificationService — 新增 markAsReadByTypes

**Files:**
- Modify: `src/modules/notification/notificationService.ts`（追加在 Task 1 函数之后）

- [ ] **Step 1: 添加 markAsReadByTypes 函数**

在 `fetchUnreadByModule` 之后追加：

```typescript
/** 批量标记指定类型的通知为已读（fire-and-forget，调用方负责 .catch） */
export async function markAsReadByTypes(
  userId: string,
  types: string[],
): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .in('type', types);

  if (error) {
    log.error('markAsReadByTypes 失败', error);
    return false;
  }
  return true;
}
```

- [ ] **Step 2: 验证函数导出**

```bash
grep -n "export.*fetchUnreadByModule\|export.*markAsReadByTypes" src/modules/notification/notificationService.ts
```

预期：显示两个函数的行号和导出签名。

- [ ] **Step 3: Commit**

```bash
git add src/modules/notification/notificationService.ts
git commit -m "feat: notificationService 新增 fetchUnreadByModule + markAsReadByTypes"
```

---

### Task 3: AppLayout — 添加 badges 状态与数据获取

**Files:**
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: 更新 imports**

在第 1 行 `useState` 解构中添加 `useEffect`：

```typescript
// 修改前
import { useState } from 'react';
// 修改后
import { useState, useEffect } from 'react';
```

在第 2 行 `antd` 导入中添加 `Badge`：

```typescript
// 修改前
import { Layout, Menu, Dropdown, Avatar, Button } from 'antd';
// 修改后
import { Layout, Menu, Dropdown, Avatar, Button, Badge } from 'antd';
```

在第 24-25 行之间（`NotificationBell` 导入之后）追加：

```typescript
import {
  fetchUnreadByModule,
  markAsReadByTypes,
  subscribeToNotifications,
} from '../modules/notification/notificationService';
```

- [ ] **Step 2: 添加 badges 状态**

在第 49 行 `const [collapsed, setCollapsed] = useState(false);` 之后添加：

```typescript
const [badges, setBadges] = useState({ tasks: false, notices: false, forum: false });
```

- [ ] **Step 3: 添加数据获取 + Realtime useEffect**

在第 52 行 `const [guideOpen, setGuideOpen] = useState(false);` 之后添加：

```typescript
// 加载三模块未读状态
useEffect(() => {
  const loadBadges = async () => {
    const result = await fetchUnreadByModule(user.id);
    setBadges({
      tasks: result.tasks > 0,
      notices: result.notices > 0,
      forum: result.forum > 0,
    });
  };
  loadBadges();

  // 复用现有 Realtime 订阅，新通知到达时刷新徽标
  const unsubscribe = subscribeToNotifications(user.id, () => loadBadges());
  return unsubscribe;
}, [user.id]);
```

> **注意：** `subscribeToNotifications` 已在 AppLayout 的子组件 `NotificationBell` 中调用过一次。但由于 Realtime 订阅是独立 channel，两个订阅不会冲突——NotificationBell 的 channel 更新自身的 loadData，AppLayout 的 channel 更新 badges。如需合并为单 channel，后续可优化为通过 Context 共享，当前阶段保持解耦。

- [ ] **Step 4: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "feat: AppLayout 添加 badges 状态 + Realtime 数据订阅"
```

---

### Task 4: AppLayout — 添加自动清除 + Badge 渲染

**Files:**
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: 添加路由监听 + 自动清除 useEffect**

在 Task 3 的 useEffect 之后添加：

```typescript
// 进入模块页面时自动清除该模块的徽标
useEffect(() => {
  const typeMap: Record<string, string[]> = {
    '/tasks':   ['task_assigned', 'submission_approved', 'submission_rejected', 'milestone_overdue'],
    '/notices': ['new_notice'],
    '/forum':   ['forum_reply'],
  };
  const types = typeMap[location.pathname];
  if (!types) return;

  // 后端标记已读（fire-and-forget）
  markAsReadByTypes(user.id, types).catch(() => {});

  // 乐观更新：前端立即清除圆点
  const key = location.pathname.slice(1) as 'tasks' | 'notices' | 'forum';
  setBadges(prev => ({ ...prev, [key]: false }));
}, [location.pathname, user.id]);
```

- [ ] **Step 2: 改造 menuItems 渲染（约第 59-63 行）**

修改前：
```typescript
const menuItems = visibleMenus.map((item) => ({
  key: item.path,
  icon: iconMap[item.icon] ?? <BellOutlined />,
  label: item.label,
}));
```

修改后：
```typescript
const badgePaths = ['/tasks', '/notices', '/forum'];

const menuItems = visibleMenus.map((item) => {
  const icon = iconMap[item.icon] ?? <BellOutlined />;
  const badgeKey = item.path.slice(1) as 'tasks' | 'notices' | 'forum';
  const showBadge = badgePaths.includes(item.path) && badges[badgeKey];

  return {
    key: item.path,
    icon: showBadge ? <Badge dot offset={[-2, 2]}>{icon}</Badge> : icon,
    label: item.label,
  };
});
```

- [ ] **Step 3: 构建验证**

```bash
cd E:\homework\开发\Claudecode\学生会交流平台 && npm run build 2>&1
```

预期：`tsc -b && vite build` exit 0，0 error。

- [ ] **Step 4: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "feat: AppLayout 添加侧边栏徽标自动清除 + Badge dot 渲染"
```

---

### Task 5: 功能验证

- [ ] **Step 1: 验证三模块菜单项正确渲染**

启动开发服务器，登录任意角色，确认侧边栏显示"任务管理""部门公告""部门论坛"三个菜单项。

- [ ] **Step 2: 验证无未读时无圆点**

初始状态下三个菜单项图标右上角无红点。

- [ ] **Step 3: 验证有未读时出现圆点**

在 Supabase 中手动插入一条未读通知：
```sql
INSERT INTO notifications (user_id, type, title, content, is_read)
VALUES ('<当前用户UUID>', 'task_assigned', '测试任务', '测试内容', false);
```

预期：侧边栏"任务管理"图标右上角出现红色小圆点。

- [ ] **Step 4: 验证进入模块后圆点消除**

点击"任务管理"菜单 → 页面跳转后小圆点消失。

- [ ] **Step 5: 验证 Realtime 实时更新**

在另一个标签页/客户端触发新通知 → 侧边栏小圆点实时出现，无需手动刷新。

---

## 完成后

```bash
npm run build  # 确认 0 error
```

更新 README 更新日志：
```
| 2026-07-12 | v2.3 | 侧边栏导航徽标 — 任务/公告/论坛三模块未读小圆点提醒 |
```
