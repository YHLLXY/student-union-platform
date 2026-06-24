import supabase from '../../supabaseClient';

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: string;
  department: string;
  created_by: string;
  author_name?: string;
  reply_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ForumReply {
  id: string;
  post_id: string;
  content: string;
  created_by: string;
  author_name?: string;
  created_at: string;
}

/** 获取帖子列表（按部门+分类筛选） */
export async function fetchPosts(department: string, category?: string): Promise<ForumPost[]> {
  let query = supabase
    .from('forum_posts')
    .select('*, author:created_by(name)')
    .eq('department', department)
    .order('created_at', { ascending: false });

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error || !data) return [];

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

  if (error || !data) return null;

  const { count } = await supabase
    .from('forum_replies')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);

  const p = data as Record<string, unknown>;
  return {
    ...p,
    author_name: (p.author as { name: string } | null)?.name ?? '未知',
    reply_count: count ?? 0,
  } as unknown as ForumPost;
}

/** 获取回复列表 */
export async function fetchReplies(postId: string): Promise<ForumReply[]> {
  const { data } = await supabase
    .from('forum_replies')
    .select('*, author:created_by(name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (!data) return [];

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
}): Promise<ForumPost | null> {
  const { data, error } = await supabase
    .from('forum_posts')
    .insert(post)
    .select('*')
    .single();

  if (error) return null;
  return data as ForumPost;
}

/** 回复 */
export async function createReply(postId: string, userId: string, content: string): Promise<boolean> {
  const { error } = await supabase
    .from('forum_replies')
    .insert({ post_id: postId, content, created_by: userId });

  return !error;
}
