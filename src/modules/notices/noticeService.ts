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
