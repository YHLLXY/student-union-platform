import { describe, it, expect } from 'vitest';
import {
  fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead,
  createNotification, createBatchNotifications, fetchDeptMemberIds,
  fetchUnreadByModule, markAsReadByTypes,
} from '@/modules/notification/notificationService';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U_ZHAOMIN = uid(4);   // 赵敏 宣传部部长
const U_SUN = uid(5);       // 孙晓雨 宣传部志愿者
// 合成用户 id：不属于任何种子数据，测试间互不污染
const synthetic = () => `aa000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;

describe('createBatchNotifications + fetchUnreadCount', () => {
  it('空名单是 no-op，不报错', async () => {
    await expect(createBatchNotifications([], {
      type: 'task_assigned', title: 'x', content: '',
    })).resolves.toBeUndefined();
  });

  it('批量写入 → 未读计数正确', async () => {
    const target = synthetic();
    expect(await fetchUnreadCount(target)).toBe(0);

    await createBatchNotifications([target, target, target], {
      type: 'new_notice', title: '批量通知', content: 'b',
    });
    expect(await fetchUnreadCount(target)).toBe(3);
  });
});

describe('fetchNotifications + 已读流转', () => {
  it('单条已读：未读数递减且行内 is_read 更新', async () => {
    const target = synthetic();
    await createBatchNotifications([target, target], {
      type: 'forum_reply', title: '已读流', content: '',
    });

    const before = await fetchNotifications(target);
    expect(before.length).toBe(2);
    expect(before.every((n) => !n.is_read)).toBe(true);

    expect(await markAsRead(before[0].id)).toBe(true);
    expect(await fetchUnreadCount(target)).toBe(1);

    const after = await fetchNotifications(target);
    const readRow = after.find((n) => n.id === before[0].id);
    expect(readRow!.is_read).toBe(true);
  });

  it('markAllAsRead 清零未读', async () => {
    const target = synthetic();
    await createBatchNotifications([target, target, target], {
      type: 'task_assigned', title: '全部已读', content: '',
    });
    expect(await fetchUnreadCount(target)).toBe(3);
    expect(await markAllAsRead(target)).toBe(true);
    expect(await fetchUnreadCount(target)).toBe(0);
  });

  it('markAsReadByTypes 只清指定类型', async () => {
    const target = synthetic();
    await createNotification({ userId: target, type: 'task_assigned', title: '任务类', content: '' });
    await createNotification({ userId: target, type: 'new_notice', title: '公告类', content: '' });

    expect(await markAsReadByTypes(target, ['task_assigned'])).toBe(true);
    expect(await fetchUnreadCount(target)).toBe(1);
  });
});

describe('fetchUnreadByModule（侧边栏徽标聚合）', () => {
  it('按类型正确归类 tasks/notices/forum', async () => {
    const target = synthetic();
    await createBatchNotifications([target], { type: 'task_assigned', title: 'a', content: '' });
    await createBatchNotifications([target], { type: 'submission_rejected', title: 'b', content: '' });
    await createBatchNotifications([target], { type: 'new_notice', title: 'c', content: '' });
    await createBatchNotifications([target], { type: 'forum_reply', title: 'd', content: '' });

    const badge = await fetchUnreadByModule(target);
    expect(badge).toEqual({ tasks: 2, notices: 1, forum: 1 });
  });

  it('已读通知不计入徽标', async () => {
    const target = synthetic();
    await createBatchNotifications([target], { type: 'new_notice', title: '已读的', content: '' });
    const rows = await fetchNotifications(target);
    await markAsRead(rows[0].id);
    expect(await fetchUnreadByModule(target)).toEqual({ tasks: 0, notices: 0, forum: 0 });
  });
});

describe('createNotification（createNotification 单发）', () => {
  it('relatedLink 缺省落 null，字段完整', async () => {
    const target = synthetic();
    await createNotification({ userId: target, type: 'milestone_overdue', title: '逾期提醒', content: '有一条里程碑逾期' });
    const rows = await fetchNotifications(target);
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe('milestone_overdue');
    expect(rows[0].related_link).toBeNull();
    expect(rows[0].title).toBe('逾期提醒');
  });
});

describe('fetchDeptMemberIds（公告通知全员用）', () => {
  it('宣传部返回种子两名成员', async () => {
    const ids = await fetchDeptMemberIds('publicity');
    expect(ids).toContain(U_ZHAOMIN);
    expect(ids).toContain(U_SUN);
    expect(ids.length).toBe(2);
  });

  it('空部门返回空数组', async () => {
    expect(await fetchDeptMemberIds('empty_dept_xyz')).toEqual([]);
  });
});
