import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';

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
  return data as Notice;
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
