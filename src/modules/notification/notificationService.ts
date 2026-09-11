import supabase from '@/supabaseClient';
import { logger } from '@/diagnostics';
import { unwrap, unwrapCount } from '@/lib/sb';

const log = logger.for('notification/notificationService');

// ========== 类型定义 ==========

export type NotificationType =
  | 'task_assigned'
  | 'submission_approved'
  | 'submission_rejected'
  | 'forum_reply'
  | 'new_notice'
  | 'milestone_overdue';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  content: string;
  related_link: string | null;
  is_read: boolean;
  created_at: string;
}

// ========== 分类（通知中心分栏 / 侧边栏角标共用同一套口径） ==========

/**
 * 通知类型 → 栏目。未出现在任一栏目里的类型归入「系统」——
 * 这样后续新增通知类型（如 Phase 3 的 mention）不改服务层也会自动出现在系统栏，
 * 不会像白名单硬编码那样静默丢通知。
 */
export const NOTIFICATION_CATEGORY_TYPES = {
  tasks: ['task_assigned', 'submission_approved', 'submission_rejected', 'milestone_overdue'],
  notices: ['new_notice'],
  forum: ['forum_reply'],
} as const;

export type NotificationCategory = 'all' | 'tasks' | 'notices' | 'forum' | 'system';

/** 栏目 → 类型过滤（all / system 不过滤，system 由调用方用「总数 − 已知栏」得出） */
const CATEGORY_TYPE_INDEX: Partial<Record<NotificationCategory, readonly NotificationType[]>> =
  NOTIFICATION_CATEGORY_TYPES;

function categoryTypes(category: NotificationCategory): readonly NotificationType[] | null {
  if (category === 'all') return null;
  return CATEGORY_TYPE_INDEX[category] ?? null;
}

/** 分页步长：一次 20 条，「加载更多」再取下一页 */
export const NOTIFICATION_PAGE_SIZE = 20;

// ========== 查询 ==========

export interface NotificationPage {
  items: Notification[];
  /** 是否还有下一页（多取一条探测，避免额外 count 往返） */
  hasMore: boolean;
}

/**
 * 分页获取通知（默认第一页 20 条，时间倒序）。
 * 用「多取一条」判断 hasMore：比 count=exact 少一次往返，且不受并发写入影响。
 */
export async function fetchNotifications(
  userId: string,
  opts: {
    limit?: number;
    offset?: number;
    category?: NotificationCategory;
    unreadOnly?: boolean;
  } = {},
): Promise<NotificationPage> {
  const { limit = NOTIFICATION_PAGE_SIZE, offset = 0, category = 'all', unreadOnly = false } = opts;
  const types = categoryTypes(category);

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId);

  if (unreadOnly) query = query.eq('is_read', false);
  if (types) query = query.in('type', types);

  const rows = (await unwrap('fetchNotifications', query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit))) as Notification[];

  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** 计数查询基座（head + count=exact：只回 Content-Range，不传行数据） */
function notificationsCountQuery(userId: string) {
  return supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
}

type CountQuery = ReturnType<typeof notificationsCountQuery>;

export interface NotificationCounts {
  all: number;
  tasks: number;
  notices: number;
  forum: number;
  system: number;
  unread: number;
}

/** 各栏目条数（供 Tab 角标 / 「全部已读」按钮显隐）；系统栏 = 总数 − 已知三栏 */
export async function fetchNotificationCounts(userId: string): Promise<NotificationCounts> {
  const countOf = (label: string, extra?: (q: CountQuery) => CountQuery) => {
    const base = notificationsCountQuery(userId);
    return unwrapCount(label, extra ? extra(base) : base);
  };

  const [all, tasks, notices, forum, unread] = await Promise.all([
    countOf('notifCountAll'),
    countOf('notifCountTasks', (q) => q.in('type', NOTIFICATION_CATEGORY_TYPES.tasks)),
    countOf('notifCountNotices', (q) => q.in('type', NOTIFICATION_CATEGORY_TYPES.notices)),
    countOf('notifCountForum', (q) => q.in('type', NOTIFICATION_CATEGORY_TYPES.forum)),
    countOf('notifCountUnread', (q) => q.eq('is_read', false)),
  ]);

  return {
    all,
    tasks,
    notices,
    forum,
    // 兜底不为负：类型统计与总数是两次查询，中间可能有并发写入
    system: Math.max(0, all - tasks - notices - forum),
    unread,
  };
}

/** 获取未读通知数量 */
export async function fetchUnreadCount(userId: string): Promise<number> {
  return unwrapCount('fetchUnreadCount', supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false));
}

// ========== 标记已读 ==========

/** 标记单条通知为已读 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    log.error('markAsRead 失败', error);
    return false;
  }
  return true;
}

/** 标记所有通知为已读；传 category 时只清该栏目（通知中心「全部已读」按当前栏生效） */
export async function markAllAsRead(
  userId: string,
  category: NotificationCategory = 'all',
): Promise<boolean> {
  let query = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  const types = categoryTypes(category);
  if (types) query = query.in('type', types);

  const { error } = await query;

  if (error) {
    log.error('markAllAsRead 失败', error);
    return false;
  }
  return true;
}

// ========== 创建通知 ==========

/** 创建一条通知（fire-and-forget，不阻塞主操作） */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  relatedLink?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      content: params.content,
      related_link: params.relatedLink ?? null,
    });

  if (error) {
    // 通知写入失败不影响主操作，仅记录日志
    log.error('createNotification 写入失败', error, params);
  }
}

/** 批量创建通知（如公告发布通知全部门成员） */
export async function createBatchNotifications(
  userIds: string[],
  params: {
    type: NotificationType;
    title: string;
    content: string;
    relatedLink?: string;
  },
): Promise<void> {
  if (userIds.length === 0) return;

  const rows = userIds.map((uid) => ({
    user_id: uid,
    type: params.type,
    title: params.title,
    content: params.content,
    related_link: params.relatedLink ?? null,
  }));

  const { error } = await supabase.from('notifications').insert(rows);

  if (error) {
    log.error('createBatchNotifications 写入失败', error);
  }
}

/** 获取部门所有成员 ID（用于公告通知全员） */
export async function fetchDeptMemberIds(department: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('department', department)
    .neq('role', 'removed');

  if (error) {
    log.error('fetchDeptMemberIds 查询失败', error);
    return [];
  }
  return (data || []).map((u: { id: string }) => u.id);
}

// ========== Realtime 订阅 ==========

/** 实时订阅当前用户的新通知 */
export function subscribeToNotifications(
  userId: string,
  onNewNotification: (notification: Notification) => void,
  channelSuffix?: string,
): () => void {
  const channelName = channelSuffix
    ? `notifications-${channelSuffix}`
    : 'notifications-changes';
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNewNotification(payload.new as Notification);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ========== 侧边栏徽标 ==========

/** 一次查询获取三个核心模块的未读通知数量（用于侧边栏小圆点） */
export async function fetchUnreadByModule(userId: string): Promise<{
  tasks: number; notices: number; forum: number;
}> {
  const data = await unwrap('fetchUnreadByModule', supabase
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
    ]));

  // 客户端聚合（未读量 <50，单次遍历 O(N) 开销可忽略）
  const result = { tasks: 0, notices: 0, forum: 0 };
  for (const row of data) {
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

/** 批量标记指定类型的通知为已读（用于进入模块时清除角标） */
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
