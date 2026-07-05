import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';

const log = logger.for('guide/guideService');

export interface GuideEntry {
  id: string;
  module_key: string;
  title: string;
  content: string;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  updater_name?: string;
}

/** 按模块获取所有指南条目（按 sort_order 排序） */
export async function fetchGuides(moduleKey: string): Promise<GuideEntry[]> {
  const { data, error } = await supabase
    .from('platform_guides')
    .select('*, creator:created_by(name), updater:updated_by(name)')
    .eq('module_key', moduleKey)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    log.error('fetchGuides 查询失败', error);
    return [];
  }

  return (data || []).map((g: Record<string, unknown>) => ({
    ...g,
    creator_name: (g.creator as { name: string } | null)?.name ?? undefined,
    updater_name: (g.updater as { name: string } | null)?.name ?? undefined,
  })) as unknown as GuideEntry[];
}

/** 创建指南条目 */
export async function createGuide(entry: {
  module_key: string;
  title: string;
  content: string;
  sort_order?: number;
  created_by: string;
}): Promise<GuideEntry | null> {
  const { data, error } = await supabase
    .from('platform_guides')
    .insert({
      module_key: entry.module_key,
      title: entry.title,
      content: entry.content,
      sort_order: entry.sort_order ?? 0,
      created_by: entry.created_by,
      updated_by: entry.created_by,
    })
    .select('*, creator:created_by(name), updater:updated_by(name)')
    .single();

  if (error) {
    log.error('createGuide 创建失败', error);
    return null;
  }

  const g = data as Record<string, unknown>;
  return {
    ...g,
    creator_name: (g.creator as { name: string } | null)?.name ?? undefined,
    updater_name: (g.updater as { name: string } | null)?.name ?? undefined,
  } as unknown as GuideEntry;
}

/** 更新指南条目 */
export async function updateGuide(
  id: string,
  updates: {
    title?: string;
    content?: string;
    sort_order?: number;
    updated_by: string;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from('platform_guides')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    log.error('updateGuide 更新失败', error);
    return false;
  }
  return true;
}

/** 删除指南条目 */
export async function deleteGuide(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('platform_guides')
    .delete()
    .eq('id', id);

  if (error) {
    log.error('deleteGuide 删除失败', error);
    return false;
  }
  return true;
}
