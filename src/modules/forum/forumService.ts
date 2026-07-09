import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';
import { createNotification } from '../notification/notificationService';
import type { Attachment } from '../../components/FileUpload';

const log = logger.for('forum/forumService');

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: string;
  department: string;
  collaborating_departments: string[];
  created_by: string;
  author_name?: string;
  reply_count?: number;
  created_at: string;
  updated_at: string;
  template_type?: string | null;
  template_data?: Record<string, unknown> | null;
  attachments?: Attachment[] | null;
}

export interface ForumReply {
  id: string;
  post_id: string;
  content: string;
  created_by: string;
  author_name?: string;
  created_at: string;
}

/** 获取帖子列表（本部门 + 协同部门可见） */
export async function fetchPosts(userDepartment: string, category?: string): Promise<ForumPost[]> {
  let query = supabase
    .from('forum_posts')
    .select('*, author:created_by(name)')
    .or(`department.eq.${userDepartment},collaborating_departments.cs.{${userDepartment}}`)
    .order('created_at', { ascending: false });

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error || !data) { log.error('fetchPosts 查询失败', error); return []; }
  // 并行查每个帖子的回复数
  const posts = await Promise.all(
    data.map(async (p: Record<string, unknown>) => {
      const { count } = await supabase
        .from('forum_replies')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', p.id);

      return {
        ...p,
        author_name: (p.author as { name: string } | null)?.name ?? '未知',
        reply_count: count ?? 0,
        collaborating_departments: p.collaborating_departments as string[] ?? [],
      };
    }),
  );

  return posts as unknown as ForumPost[];
}

/** 获取帖子详情 */
export async function fetchPostDetail(postId: string): Promise<ForumPost | null> {
  const { data, error } = await supabase
    .from('forum_posts')
    .select('*, author:created_by(name)')
    .eq('id', postId)
    .single();

  if (error || !data) { log.error('fetchPostDetail 查询失败', error); return null; }

  const { count } = await supabase
    .from('forum_replies')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);

  const p = data as Record<string, unknown>;
  return {
    ...p,
    author_name: (p.author as { name: string } | null)?.name ?? '未知',
    reply_count: count ?? 0,
    collaborating_departments: p.collaborating_departments as string[] ?? [],
  } as unknown as ForumPost;
}

/** 获取回复列表 */
export async function fetchReplies(postId: string): Promise<ForumReply[]> {
  const { data, error } = await supabase
    .from('forum_replies')
    .select('*, author:created_by(name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error || !data) { log.error('fetchReplies 查询失败', error); return []; }

  return data.map((r: Record<string, unknown>) => ({
    ...r,
    author_name: (r.author as { name: string } | null)?.name ?? '未知',
  })) as unknown as ForumReply[];
}

/** 发帖 */
export async function createPost(post: {
  title: string;
  content: string;
  category: string;
  department: string;
  created_by: string;
  collaborating_departments?: string[];
  template_type?: string | null;
  template_data?: Record<string, unknown> | null;
  attachments?: Attachment[];
}): Promise<ForumPost | null> {
  const { data, error } = await supabase
    .from('forum_posts')
    .insert({
      ...post,
      collaborating_departments: post.collaborating_departments ?? [],
      attachments: post.attachments ?? [],
    })
    .select('*')
    .single();

  if (error) { log.error('createPost 创建失败', error); return null; }
  return data as ForumPost;
}

/** 删除帖子（级联删除回复） */
export async function deletePost(postId: string): Promise<boolean> {
  // 先删回复
  await supabase.from('forum_replies').delete().eq('post_id', postId);
  // 再删帖子
  const { error } = await supabase
    .from('forum_posts')
    .delete()
    .eq('id', postId);

  if (error) { log.error('deletePost 删除失败', error); return false; }
  return true;
}

/** 更新协同部门 */
export async function updateCollaboratingDepts(postId: string, depts: string[]): Promise<boolean> {
  const { error } = await supabase
    .from('forum_posts')
    .update({ collaborating_departments: depts })
    .eq('id', postId);

  if (error) { log.error('updateCollaboratingDepts 更新失败', error); return false; }
  return true;
}

/** 回复 */
export async function createReply(postId: string, userId: string, content: string): Promise<boolean> {
  const { error } = await supabase
    .from('forum_replies')
    .insert({ post_id: postId, content, created_by: userId });

  if (error) { log.error('createReply 回复失败', error); return false; }

  // 通知帖主（fire-and-forget）
  const { data: postData } = await supabase
    .from('forum_posts')
    .select('created_by, title')
    .eq('id', postId)
    .single();

  if (postData && (postData as Record<string, unknown>).created_by !== userId) {
    createNotification({
      userId: (postData as Record<string, unknown>).created_by as string,
      type: 'forum_reply',
      title: '💬 论坛新回复',
      content: `你的帖子「${(postData as Record<string, unknown>).title}」有新回复`,
      relatedLink: '/forum',
    }).catch(() => {});
  }

  return true;
}
