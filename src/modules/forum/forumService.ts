import supabase from '@/supabaseClient';
import { logger } from '@/diagnostics';
import { createNotification } from '@/modules/notification/notificationService';
import { unwrap } from '@/lib/sb';
import type { Attachment } from '@/components/FileUpload';
import type { Json, TableRow } from '@/types/database';

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
  template_data?: Json | null;
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

type PostRowWithAuthor = TableRow<'forum_posts'> & { author: { name: string } | null };
type ReplyRowWithAuthor = TableRow<'forum_replies'> & { author: { name: string } | null };

/** 展开作者昵称（author 为 created_by 外键嵌入结果） */
function withAuthorName<T extends PostRowWithAuthor | ReplyRowWithAuthor>(row: T) {
  return { ...row, author_name: row.author?.name ?? '未知' };
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

  const data = await unwrap('fetchPosts', query);
  // 并行查每个帖子的回复数
  const posts = await Promise.all(
    data.map(async (p: PostRowWithAuthor) => {
      const { count } = await supabase
        .from('forum_replies')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', p.id);

      return {
        ...withAuthorName(p),
        reply_count: count ?? 0,
      };
    }),
  );

  return posts as ForumPost[];
}

/** 获取帖子详情 */
export async function fetchPostDetail(postId: string): Promise<ForumPost | null> {
  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from('forum_posts')
      .select('*, author:created_by(name)')
      .eq('id', postId)
      .single(),
    supabase
      .from('forum_replies')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId),
  ]);

  if (error || !data) { log.error('fetchPostDetail 查询失败', error); return null; }

  return {
    ...withAuthorName(data as PostRowWithAuthor),
    reply_count: count ?? 0,
  } as ForumPost;
}

/** 获取回复列表 */
export async function fetchReplies(postId: string): Promise<ForumReply[]> {
  const data = await unwrap('fetchReplies', supabase
    .from('forum_replies')
    .select('*, author:created_by(name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true }));

  return data.map((r: ReplyRowWithAuthor) => withAuthorName(r)) as ForumReply[];
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
  template_data?: Json | null;
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
  const [{ error }, { data: postData }] = await Promise.all([
    supabase
      .from('forum_replies')
      .insert({ post_id: postId, content, created_by: userId }),
    supabase
      .from('forum_posts')
      .select('created_by, title')
      .eq('id', postId)
      .single(),
  ]);

  if (error) { log.error('createReply 回复失败', error); return false; }

  // 通知帖主（fire-and-forget）
  if (postData?.created_by && postData.created_by !== userId) {
    createNotification({
      userId: postData.created_by,
      type: 'forum_reply',
      title: '💬 论坛新回复',
      content: `你的帖子「${postData.title}」有新回复`,
      relatedLink: '/forum',
    }).catch(() => {});
  }

  return true;
}
