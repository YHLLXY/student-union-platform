import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';

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

// ========== 查询 ==========

/** 获取用户最近通知（最多 20 条） */
export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    log.error('fetchNotifications 查询失败', error);
    return [];
  }
  return (data || []) as Notification[];
}

/** 获取未读通知数量 */
export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    log.error('fetchUnreadCount 查询失败', error);
    return 0;
  }
  return count ?? 0;
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

/** 标记所有通知为已读 */
export async function markAllAsRead(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

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
): () => void {
  const channel = supabase
    .channel('notifications-changes')
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
