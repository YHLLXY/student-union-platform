import supabase from '../../supabaseClient';

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
    console.error('fetchSchoolNotices error:', error);
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
    console.error('createSchoolNotice error:', error);
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
