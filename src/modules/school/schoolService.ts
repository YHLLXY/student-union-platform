import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';

const log = logger.for('school/schoolService');

export interface SchoolNotice {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_by: string;
  creator_name?: string;
  created_at: string;
}

/** 获取学校通知 */
export async function fetchSchoolNotices(): Promise<SchoolNotice[]> {
  const { data, error } = await supabase
    .from('school_notices')
    .select('*, creator:created_by(name)')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    log.error('fetchSchoolNotices 查询失败', error);
    return [];
  }

  return (data || []).map((n: Record<string, unknown>) => ({
    ...n,
    creator_name: (n.creator as { name: string } | null)?.name ?? '未知',
  })) as unknown as SchoolNotice[];
}

/** 创建校级通知 */
export async function createSchoolNotice(notice: {
  title: string;
  content: string;
  is_pinned: boolean;
  created_by: string;
}): Promise<SchoolNotice | null> {
  const { data, error } = await supabase
    .from('school_notices')
    .insert(notice)
    .select('*')
    .single();

  if (error) {
    log.error('createSchoolNotice 创建失败', error);
    return null;
  }
  return data as SchoolNotice;
}

/** 实时订阅校讯 */
export function subscribeToSchoolNotices(callback: () => void): () => void {
  const channel = supabase
    .channel('school-notices-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'school_notices' },
      callback,
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
