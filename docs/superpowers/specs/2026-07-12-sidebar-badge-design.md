# 侧边栏导航徽标提醒 设计文档

> 2026-07-12 | 学生会线上交流平台

---

## 一、概述

在侧边栏"任务管理""部门公告""部门论坛"三个菜单项图标右上角添加小圆点，当该模块有新未读通知时点亮。点击进入模块后自动清除。

**设计原则：** 小圆点（dot），克制不焦虑；三个核心模块，不多不少；数据层与展示层解耦，兼容后续移动端适配。

---

## 二、用户故事

1. 部门负责人发布新任务 → 所有相关成员侧边栏"任务管理"出现小红点
2. 同学发布了新公告 → 所有人侧边栏"部门公告"出现小红点
3. 论坛帖子有新回复 → 被回复的人侧边栏"部门论坛"出现小红点
4. 用户点击带红点的菜单进入模块 → 小圆点自动消失，对应通知标记已读

---

## 三、通知类型 → 模块映射

| 通知类型 (type) | 对应模块 | 侧边栏 key |
|:--|------|:--:|
| `task_assigned` | 任务管理 | tasks |
| `submission_approved` | 任务管理 | tasks |
| `submission_rejected` | 任务管理 | tasks |
| `milestone_overdue` | 任务管理 | tasks |
| `new_notice` | 部门公告 | notices |
| `forum_reply` | 部门论坛 | forum |

---

## 四、数据层设计

### 4.1 fetchUnreadByModule

```typescript
/** 一次查询获取三个模块的未读通知数量 */
export async function fetchUnreadByModule(userId: string): Promise<{
  tasks: number; notices: number; forum: number;
}>
```

**实现逻辑：**

1. `SELECT type FROM notifications WHERE user_id = X AND is_read = false AND type IN (...)` — 单次查询，只取 `type` 字段
2. 客户端单次遍历 O(N) 按类型分桶计数（N 通常 <20）
3. 返回 `{ tasks, notices, forum }`

**为什么不用 SQL GROUP BY：** Supabase JS SDK 的 `group()` 需要特殊配置或 RPC。客户端遍历 N 条数据的开销可忽略（未读数极少超过 50），避免了引入新 RPC 的维护成本。后续如果数据量增长，可改为数据库 RPC 一步到位。

### 4.2 markAsReadByTypes

```typescript
/** 批量标记指定类型的通知为已读 */
export async function markAsReadByTypes(
  userId: string, types: string[]
): Promise<void>
```

**实现逻辑：**

```sql
UPDATE notifications SET is_read = true
WHERE user_id = X AND is_read = false AND type IN (...)
```

单次 UPDATE，传入用户进入模块对应的通知类型数组。

### 4.3 Realtime（复用）

复用现有 `subscribeToNotifications` — 已订阅 `notifications` 表 INSERT 事件。回调触发时重新调用 `fetchUnreadByModule` 刷新。

---

## 五、UI 层设计

### 5.1 状态

```typescript
const [badges, setBadges] = useState({ tasks: false, notices: false, forum: false });
```

用布尔值而非数字 → 配合 `<Badge dot>` 渲染小圆点。

### 5.2 初始化 + Realtime

```typescript
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
  const unsubscribe = subscribeToNotifications(user.id, () => loadBadges());
  return unsubscribe;
}, [user.id]);
```

### 5.3 自动清除

```typescript
useEffect(() => {
  const typeMap: Record<string, string[]> = {
    '/tasks':   ['task_assigned','submission_approved','submission_rejected','milestone_overdue'],
    '/notices': ['new_notice'],
    '/forum':   ['forum_reply'],
  };
  const types = typeMap[location.pathname];
  if (!types) return;

  // 后端标记已读（fire-and-forget）
  markAsReadByTypes(user.id, types).catch(() => {});

  // 前端立即清除圆点（乐观更新）
  const key = location.pathname.slice(1) as 'tasks' | 'notices' | 'forum';
  setBadges(prev => ({ ...prev, [key]: false }));
}, [location.pathname, user.id]);
```

### 5.4 渲染

```typescript
import { Badge } from 'antd';

const badgeKeys = ['/tasks', '/notices', '/forum'];

const menuItems = visibleMenus.map((item) => {
  const icon = iconMap[item.icon] ?? <BellOutlined />;
  const key = item.path.slice(1) as 'tasks' | 'notices' | 'forum';
  const needsBadge = badgeKeys.includes(item.path) && badges[key];

  return {
    key: item.path,
    icon: needsBadge ? <Badge dot offset={[-2, 2]}>{icon}</Badge> : icon,
    label: item.label,
  };
});
```

---

## 六、改动范围

| 文件 | 改动类型 | 内容 |
|------|:--:|------|
| `src/modules/notification/notificationService.ts` | 新增 | `fetchUnreadByModule` + `markAsReadByTypes` |
| `src/components/AppLayout.tsx` | 改动 | 3 个 state、2 个 useEffect、Badge 导入、menuItems 渲染 |
| 无需改 CSS | — | — |

---

## 七、与 NotificationBell 的协作

- NotificationBell 显示**总未读数** + 通知列表（数字角标）
- 侧边栏显示**分模块**是否有未读（小圆点）
- 两者读同一张 `notifications` 表、同一套 Realtime 订阅 → 数据一致
- 进入模块标记已读 → Bell 的总计数同步减少

---

## 八、性能自查

| 检查项 | 结果 | 说明 |
|------|:--:|------|
| Promise.all | ✅ | `fetchUnreadByModule` 单次查询即可 |
| N+1 查询 | ✅ | 无循环，`IN (...)` 一次拿全 |
| LIMIT | ✅ | 不加 LIMIT — 未读 <20 条，且 `select('type')` 只取枚举字段，数据量极小 |
| 新增 Realtime channel | ✅ | 复用现有 `subscribeToNotifications`，不新增 |
| fire-and-forget | ✅ | `markAsReadByTypes` 用 `.catch(() => {})` 静默失败，不阻塞导航 |
| 乐观更新 | ✅ | 前端立即清除圆点，后端异步标记已读 |
| 无新增数据库表 | ✅ | 完全复用 `notifications` 表 |

---

## 九、对移动端的兼容

- 数据层 `badges` 状态与侧边栏解耦，后续底部 Tab 可直接消费同一份数据
- Ant Design `Badge dot` 在缩窄的侧边栏上视觉权重恰好——Icon 变小后 Dot 反而更突出
- 无额外适配工作

---

## 十、实施步骤

1. `notificationService.ts` — 新增 `fetchUnreadByModule` 和 `markAsReadByTypes`
2. `AppLayout.tsx` — 添加 badges 状态、两个 useEffect、Badge 渲染
3. `npm run build` 验证
4. 测试：以不同角色登录，触发通知，确认小圆点出现/消失行为正确
