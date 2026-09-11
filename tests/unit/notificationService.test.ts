import { describe, it, expect } from 'vitest';
import {
  fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead,
  createNotification, createBatchNotifications, fetchDeptMemberIds,
  fetchUnreadByModule, markAsReadByTypes, fetchNotificationCounts,
  NOTIFICATION_PAGE_SIZE,
} from '@/modules/notification/notificationService';
import supabase from '@/supabaseClient';

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

describe('fetchNotifications 分页', () => {
  /** 直插 25 条时间递增的通知（created_at 显式指定，让排序断言确定） */
  async function seedTimeline(target: string, count: number) {
    const base = Date.parse('2026-01-01T00:00:00Z');
    const rows = Array.from({ length: count }, (_, i) => ({
      user_id: target,
      type: 'task_assigned',
      title: `通知 ${i}`,
      content: '',
      related_link: '/tasks',
      is_read: false,
      created_at: new Date(base + i * 60_000).toISOString(),
    }));
    const { error } = await supabase.from('notifications').insert(rows);
    expect(error).toBeNull();
  }

  it('第一页满 20 条且 hasMore=true，第二页只剩 5 条', async () => {
    const target = synthetic();
    await seedTimeline(target, NOTIFICATION_PAGE_SIZE + 5);

    const page1 = await fetchNotifications(target);
    expect(page1.items.length).toBe(NOTIFICATION_PAGE_SIZE);
    expect(page1.hasMore).toBe(true);
    // 时间倒序：第一条是最新的「通知 24」
    expect(page1.items[0].title).toBe('通知 24');
    expect(page1.items[19].title).toBe('通知 5');

    const page2 = await fetchNotifications(target, { offset: NOTIFICATION_PAGE_SIZE });
    expect(page2.items.length).toBe(5);
    expect(page2.hasMore).toBe(false);
    expect(page2.items[0].title).toBe('通知 4');
    expect(page2.items[4].title).toBe('通知 0');
  });

  it('正好 20 条时 hasMore=false（多取一条探测的边界）', async () => {
    const target = synthetic();
    await seedTimeline(target, NOTIFICATION_PAGE_SIZE);
    const page = await fetchNotifications(target);
    expect(page.items.length).toBe(NOTIFICATION_PAGE_SIZE);
    expect(page.hasMore).toBe(false);
  });

  it('category 只取该栏类型', async () => {
    const target = synthetic();
    await createNotification({ userId: target, type: 'task_assigned', title: '任务类', content: '' });
    await createNotification({ userId: target, type: 'new_notice', title: '公告类', content: '' });
    await createNotification({ userId: target, type: 'forum_reply', title: '论坛类', content: '' });

    const tasks = await fetchNotifications(target, { category: 'tasks' });
    expect(tasks.items.map((n) => n.title)).toEqual(['任务类']);

    const notices = await fetchNotifications(target, { category: 'notices' });
    expect(notices.items.map((n) => n.title)).toEqual(['公告类']);

    // 未被三栏收编的类型归入系统栏
    await createNotification({ userId: target, type: 'milestone_overdue', title: '逾期类', content: '' });
    // milestone_overdue 属任务栏
    const tasks2 = await fetchNotifications(target, { category: 'tasks' });
    expect(tasks2.items.map((n) => n.title).sort()).toEqual(['任务类', '逾期类'].sort());
  });

  it('unreadOnly 只回未读', async () => {
    const target = synthetic();
    await createNotification({ userId: target, type: 'new_notice', title: '未读的', content: '' });
    await createNotification({ userId: target, type: 'new_notice', title: '要标记已读的', content: '' });
    const all = await fetchNotifications(target);
    const target_row = all.items.find((n) => n.title === '要标记已读的')!;
    await markAsRead(target_row.id);

    const unread = await fetchNotifications(target, { unreadOnly: true });
    expect(unread.items.map((n) => n.title)).toEqual(['未读的']);
  });
});

describe('fetchNotificationCounts（Tab 角标）', () => {
  it('各栏计数与未读数', async () => {
    const target = synthetic();
    await createBatchNotifications([target], { type: 'task_assigned', title: 'a', content: '' });
    await createBatchNotifications([target], { type: 'submission_approved', title: 'b', content: '' });
    await createBatchNotifications([target], { type: 'new_notice', title: 'c', content: '' });
    await createBatchNotifications([target], { type: 'forum_reply', title: 'd', content: '' });
    await createBatchNotifications([target], { type: 'forum_reply', title: 'e', content: '' });

    const counts = await fetchNotificationCounts(target);
    expect(counts).toEqual({ all: 5, tasks: 2, notices: 1, forum: 2, system: 0, unread: 5 });
  });

  it('空用户全 0', async () => {
    expect(await fetchNotificationCounts(synthetic()))
      .toEqual({ all: 0, tasks: 0, notices: 0, forum: 0, system: 0, unread: 0 });
  });
});

describe('fetchNotifications + 已读流转', () => {
  it('单条已读：未读数递减且行内 is_read 更新', async () => {
    const target = synthetic();
    await createBatchNotifications([target, target], {
      type: 'forum_reply', title: '已读流', content: '',
    });

    const before = await fetchNotifications(target);
    expect(before.items.length).toBe(2);
    expect(before.items.every((n) => !n.is_read)).toBe(true);

    expect(await markAsRead(before.items[0].id)).toBe(true);
    expect(await fetchUnreadCount(target)).toBe(1);

    const after = await fetchNotifications(target);
    const readRow = after.items.find((n) => n.id === before.items[0].id);
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

  it('markAllAsRead 传栏目时只清该栏', async () => {
    const target = synthetic();
    await createNotification({ userId: target, type: 'task_assigned', title: '任务类', content: '' });
    await createNotification({ userId: target, type: 'new_notice', title: '公告类', content: '' });

    expect(await markAllAsRead(target, 'tasks')).toBe(true);
    const counts = await fetchNotificationCounts(target);
    expect(counts.unread).toBe(1);
    expect(await fetchNotifications(target, { category: 'notices', unreadOnly: true }))
      .toMatchObject({ hasMore: false });
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
    await markAsRead(rows.items[0].id);
    expect(await fetchUnreadByModule(target)).toEqual({ tasks: 0, notices: 0, forum: 0 });
  });
});

describe('createNotification（createNotification 单发）', () => {
  it('relatedLink 缺省落 null，字段完整', async () => {
    const target = synthetic();
    await createNotification({ userId: target, type: 'milestone_overdue', title: '逾期提醒', content: '有一条里程碑逾期' });
    const rows = await fetchNotifications(target);
    expect(rows.items.length).toBe(1);
    expect(rows.items[0].type).toBe('milestone_overdue');
    expect(rows.items[0].related_link).toBeNull();
    expect(rows.items[0].title).toBe('逾期提醒');
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
