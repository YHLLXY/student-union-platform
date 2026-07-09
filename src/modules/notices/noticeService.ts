import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';
import { createBatchNotifications, fetchDeptMemberIds } from '../notification/notificationService';
import type { Attachment } from '../../components/FileUpload';

const log = logger.for('notices/noticeService');

export interface Notice {
  id: string;
  title: string;
  content: string;
  type: string;
  department: string;
  is_pinned: boolean;
  created_by: string;
  creator_name?: string;
  created_at: string;
  linked_tasks?: string[];
  attachments?: Attachment[] | null;
}

/** 获取部门公告（置顶优先+时间倒序） */
export async function fetchNotices(department: string): Promise<Notice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select('*, creator:created_by(name)')
    .eq('department', department)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    log.error('fetchNotices 查询失败', error);
    return [];
  }

  return (data || []).map((n: Record<string, unknown>) => ({
    ...n,
    creator_name: (n.creator as { name: string } | null)?.name ?? '未知',
  })) as unknown as Notice[];
}

/** 创建公告 */
export async function createNotice(notice: {
  title: string;
  content: string;
  type: string;
  department: string;
  is_pinned: boolean;
  created_by: string;
  linked_tasks?: string[];
  attachments?: Attachment[];
}): Promise<Notice | null> {
  const { data, error } = await supabase
    .from('notices')
    .insert(notice)
    .select('*')
    .single();

  if (error) {
    log.error('createNotice 创建失败', error);
    return null;
  }

  // 通知本部门所有成员（fire-and-forget）
  const created = data as Notice;
  fetchDeptMemberIds(notice.department).then((userIds) => {
    if (userIds.length > 0) {
      createBatchNotifications(userIds, {
        type: 'new_notice',
        title: '📢 新部门公告',
        content: `本部门发布了新公告「${created.title}」`,
        relatedLink: '/notices',
      }).catch(() => {});
    }
  }).catch(() => {});

  return created;
}

/** 实时订阅部门公告 */
export function subscribeToNotices(department: string, callback: () => void): () => void {
  const channel = supabase
    .channel('notices-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notices', filter: `department=eq.${department}` },
      callback,
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/** 获取本部门进行中的任务（供公告关联选择） */
export async function fetchActiveTasksForLinking(department: string): Promise<{ id: string; title: string; status: string }[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status')
    .eq('assigned_department', department)
    .in('status', ['pending', 'in_progress', 'review'])
    .order('created_at', { ascending: false });

  if (error) {
    log.error('fetchActiveTasksForLinking 查询失败', error);
    return [];
  }
  return (data || []) as { id: string; title: string; status: string }[];
}

/** 获取关联任务的简要信息 */
export async function fetchLinkedTaskInfos(taskIds: string[]): Promise<{ id: string; title: string; status: string; assignee_name?: string }[]> {
  if (!taskIds || taskIds.length === 0) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, assignee:assigned_to(name)')
    .in('id', taskIds);

  if (error) return [];
  return (data || []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    title: t.title as string,
    status: t.status as string,
    assignee_name: (t.assignee as { name: string } | null)?.name ?? undefined,
  }));
}

// ========== 公告已读确认 ==========

/** 标记公告已读（用户打开公告时自动调用） */
export async function markNoticeRead(noticeId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('notice_reads')
    .upsert({ notice_id: noticeId, user_id: userId, read_at: new Date().toISOString() });

  if (error) {
    log.error('markNoticeRead 失败', error);
  }
}

/** 获取公告已读/未读用户名单 */
export async function fetchNoticeReaders(
  noticeId: string,
  department: string,
): Promise<{ read: { id: string; name: string }[]; unread: { id: string; name: string }[] }> {
  // 并行获取本部门所有用户 + 已读用户
  const [{ data: allUsers }, { data: reads }] = await Promise.all([
    supabase
      .from('users')
      .select('id, name')
      .eq('department', department)
      .neq('role', 'removed'),
    supabase
      .from('notice_reads')
      .select('user_id')
      .eq('notice_id', noticeId),
  ]);

  const readIds = new Set((reads || []).map((r) => r.user_id));
  const read: { id: string; name: string }[] = [];
  const unread: { id: string; name: string }[] = [];

  for (const u of allUsers || []) {
    if (readIds.has(u.id)) {
      read.push({ id: u.id, name: u.name });
    } else {
      unread.push({ id: u.id, name: u.name });
    }
  }

  return { read, unread };
}

/** 从公告创建任务（公告一键转任务） */
export async function createTaskFromNotice(task: {
  title: string;
  priority: string;
  assigned_department: string;
  assigned_to?: string | null;
  deadline?: string | null;
  created_by: string;
  linked_notice_id: string;
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('tasks')
    .insert({
      title: task.title,
      content: '',
      priority: task.priority,
      status: 'pending',
      assigned_department: task.assigned_department,
      assigned_to: task.assigned_to ?? null,
      deadline: task.deadline ?? null,
      created_by: task.created_by,
      linked_notice_id: task.linked_notice_id,
    });

  if (error) {
    log.error('createTaskFromNotice 创建失败', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
