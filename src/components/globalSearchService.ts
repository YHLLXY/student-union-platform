import supabase from '../supabaseClient';
import { hasMinRole } from '../utils/helpers';

export interface SearchResult {
  id: string;
  title: string;
  module: 'tasks' | 'notices' | 'forum' | 'guides';
  link: string;
  subtitle?: string;
}

interface RawRow {
  id: string;
  title: string;
  content?: string;
  department?: string;
  assigned_department?: string;
  collaborating_departments?: string[];
}

/** 全局搜索：4 表并行 ilike，各 LIMIT 5 */
export async function globalSearch(
  keyword: string,
  department: string,
  role: string,
): Promise<SearchResult[]> {
  const kw = keyword.trim();
  if (!kw) return [];

  const pattern = `%${kw}%`;
  const isGlobalRole = hasMinRole(role, 'president');

  const [
    tasksRes,
    noticesRes,
    forumRes,
    guidesRes,
  ] = await Promise.all([
    // 任务：搜索 title
    (async () => {
      let q = supabase.from('tasks').select('id, title, assigned_department')
        .ilike('title', pattern).limit(5);
      if (!isGlobalRole) q = q.eq('assigned_department', department);
      const { data, error } = await q;
      if (error) return [];
      return (data || []) as RawRow[];
    })(),
    // 公告：搜索 title
    (async () => {
      let q = supabase.from('notices').select('id, title, department')
        .ilike('title', pattern).limit(5);
      if (!isGlobalRole) q = q.eq('department', department);
      const { data, error } = await q;
      if (error) return [];
      return (data || []) as RawRow[];
    })(),
    // 论坛帖子：搜索 title
    (async () => {
      let q = supabase.from('forum_posts').select('id, title, department, collaborating_departments')
        .ilike('title', pattern).limit(5);
      if (!isGlobalRole) {
        q = q.or(`department.eq.${department},collaborating_departments.cs.{${department}}`);
      }
      const { data, error } = await q;
      if (error) return [];
      return (data || []) as RawRow[];
    })(),
    // 功能指南：搜索 title + content
    (async () => {
      const { data, error } = await supabase.from('platform_guides')
        .select('id, title, content')
        .or(`title.ilike.${pattern},content.ilike.${pattern}`)
        .limit(5);
      if (error) return [];
      return (data || []) as RawRow[];
    })(),
  ]);

  const results: SearchResult[] = [];

  for (const t of tasksRes) {
    results.push({ id: t.id, title: t.title, module: 'tasks', link: '/tasks' });
  }
  for (const n of noticesRes) {
    results.push({ id: n.id, title: n.title, module: 'notices', link: '/notices' });
  }
  for (const p of forumRes) {
    results.push({ id: p.id, title: p.title, module: 'forum', link: '/forum' });
  }
  for (const g of guidesRes) {
    const excerpt = (g.content || '').slice(0, 80);
    results.push({
      id: g.id,
      title: g.title,
      module: 'guides',
      link: '/',
      subtitle: excerpt || undefined,
    });
  }

  return results;
}
