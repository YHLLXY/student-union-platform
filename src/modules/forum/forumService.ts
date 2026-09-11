import supabase from '@/supabaseClient';
import { logger } from '@/diagnostics';
import { createNotification, createBatchNotifications } from '@/modules/notification/notificationService';
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
  /** 回复数：读 forum_posts.reply_count 计数列（触发器维护），不再逐帖 count */
  reply_count: number;
  /** 点赞数：同上，读 like_count 计数列 */
  like_count: number;
  /** 置顶时间；NULL = 未置顶 */
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
  template_type?: string | null;
  template_data?: Json | null;
  attachments?: Attachment[] | null;
  /** 当前登录者是否点过赞 / 收过藏（按需填充；未登录态为 false） */
  is_liked?: boolean;
  is_bookmarked?: boolean;
}

export interface ForumReply {
  id: string;
  post_id: string;
  content: string;
  created_by: string;
  author_name?: string;
  created_at: string;
}

/** 成员候选（@提及用）：只要 id / 姓名 / 部门，比写通讯录的 fetchAllMembers 轻得多 */
export interface MentionUser {
  id: string;
  name: string;
  department: string;
}

type PostRowWithAuthor = TableRow<'forum_posts'> & { author: { name: string } | null };
type ReplyRowWithAuthor = TableRow<'forum_replies'> & { author: { name: string } | null };

/** 列表与详情的统一 select：计数列就在行上，作者昵称靠外键嵌入一并取回 —— 一条查询搞定 */
const POST_SELECT = '*, author:created_by(name)';

/** 展开作者昵称（author 为 created_by 外键嵌入结果） */
function withAuthorName<T extends PostRowWithAuthor | ReplyRowWithAuthor>(row: T) {
  return { ...row, author_name: row.author?.name ?? '未知' };
}

/** 补上当前登录者的点赞 / 收藏态（列表与详情共用） */
async function decorateViewer(posts: ForumPost[], viewerId?: string): Promise<ForumPost[]> {
  if (!viewerId || posts.length === 0) return posts;
  const postIds = posts.map((p) => p.id);

  const [likes, bookmarks] = await Promise.all([
    supabase.from('forum_likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
    supabase.from('forum_bookmarks').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
  ]);

  // 互动态是「锦上添花」：取失败就按未点赞未收藏处理，不该让整个列表跟着报错
  if (likes.error) log.error('decorateViewer 点赞态查询失败', likes.error);
  if (bookmarks.error) log.error('decorateViewer 收藏态查询失败', bookmarks.error);
  const liked = new Set((likes.data ?? []).map((r) => r.post_id));
  const marked = new Set((bookmarks.data ?? []).map((r) => r.post_id));

  return posts.map((p) => ({
    ...p,
    is_liked: liked.has(p.id),
    is_bookmarked: marked.has(p.id),
  }));
}

/** 列表排序：置顶在前（按置顶时间倒序），其余按发布时间倒序 —— 与 idx_forum_posts_pinned 的顺序一致 */
const PINNED_ORDER = { ascending: false, nullsFirst: false } as const;

/**
 * 获取帖子列表（本部门 + 协同部门可见）。
 *
 * 优化记录（v4.5.0）：原实现对每个帖子各发一条 `head: true` 的 count 查询算回复数，
 * 一页 20 帖就是 1 + 20 次往返（CLAUDE.md 明令禁止的 N+1）。现在回复数 / 点赞数都读
 * forum_posts 上的计数列（数据库触发器维护），列表退化为**单条查询**；
 * 另两次查询只用于取回「我点过赞 / 我收藏过哪些」，与帖子数无关。
 */
export async function fetchPosts(
  userDepartment: string,
  category?: string,
  viewerId?: string,
): Promise<ForumPost[]> {
  let query = supabase
    .from('forum_posts')
    .select(POST_SELECT)
    .or(`department.eq.${userDepartment},collaborating_departments.cs.{${userDepartment}}`)
    .order('pinned_at', PINNED_ORDER)
    .order('created_at', { ascending: false });

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  const data = await unwrap('fetchPosts', query);
  const posts = data.map((p) => withAuthorName(p as PostRowWithAuthor)) as ForumPost[];
  return decorateViewer(posts, viewerId);
}

/** 我的收藏：先取收藏记录（按收藏时间倒序）再取帖子，避开 PostgREST 的聚合嵌入语法 */
export async function fetchMyBookmarkedPosts(viewerId: string): Promise<ForumPost[]> {
  const marks = await unwrap('fetchMyBookmarkedPosts', supabase
    .from('forum_bookmarks')
    .select('post_id')
    .eq('user_id', viewerId)
    .order('created_at', { ascending: false }));

  const ids = marks.map((m) => m.post_id);
  if (ids.length === 0) return [];

  const rows = await unwrap('fetchMyBookmarkedPosts.posts', supabase
    .from('forum_posts')
    .select(POST_SELECT)
    .in('id', ids));

  const byId = new Map(rows.map((r) => [r.id, r as PostRowWithAuthor]));
  // 按收藏顺序（而非发布时间）排列：收藏夹是「我攒下来的」，最近收的排最前；
  // 已不可见的帖子（如已删除，级联删掉了收藏记录）自然被过滤掉
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is PostRowWithAuthor => !!r)
    .map((r) => withAuthorName(r) as ForumPost);

  return decorateViewer(ordered, viewerId);
}

/** 获取帖子详情 */
export async function fetchPostDetail(postId: string, viewerId?: string): Promise<ForumPost | null> {
  const { data, error } = await supabase
    .from('forum_posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .single();

  if (error || !data) { log.error('fetchPostDetail 查询失败', error); return null; }

  const [post] = await decorateViewer([withAuthorName(data as PostRowWithAuthor) as ForumPost], viewerId);
  return post;
}

/** @提及的成员名册（点选对象来源） */
export async function fetchMentionUsers(): Promise<MentionUser[]> {
  const data = await unwrap('fetchMentionUsers', supabase
    .from('users')
    .select('id, name, department')
    .neq('role', 'removed')
    .order('name'));

  return (data as MentionUser[]).filter((u) => !!u.name);
}

/**
 * 点赞 / 取消点赞。
 * 表结构是 (post_id, user_id) 复合主键，重复点赞在数据库层就写不进去（23505），
 * 这里把它当成功处理 —— 双击、重试都不会给用户报错。
 */
export async function toggleLike(postId: string, userId: string, liked: boolean): Promise<boolean> {
  if (liked) {
    const { error } = await supabase
      .from('forum_likes')
      .insert({ post_id: postId, user_id: userId });

    if (error && error.code !== '23505') {
      log.error('toggleLike 点赞失败', error);
      return false;
    }
    return true;
  }

  const { error } = await supabase
    .from('forum_likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);

  if (error) { log.error('toggleLike 取消点赞失败', error); return false; }
  return true;
}

/** 收藏 / 取消收藏（与点赞同构，幂等理由同上） */
export async function toggleBookmark(postId: string, userId: string, bookmarked: boolean): Promise<boolean> {
  if (bookmarked) {
    const { error } = await supabase
      .from('forum_bookmarks')
      .insert({ post_id: postId, user_id: userId });

    if (error && error.code !== '23505') {
      log.error('toggleBookmark 收藏失败', error);
      return false;
    }
    return true;
  }

  const { error } = await supabase
    .from('forum_bookmarks')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);

  if (error) { log.error('toggleBookmark 取消收藏失败', error); return false; }
  return true;
}

/**
 * 置顶 / 取消置顶。写入权限由数据库守卫触发器把关（部门负责人及以上），
 * 前端这里的 canPin 只是把按钮藏起来，不是安全边界。
 */
export async function setPostPinned(postId: string, pinned: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('forum_posts')
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq('id', postId);

  if (error) { log.error('setPostPinned 更新失败', error); return false; }
  return true;
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

/**
 * @提及 通知（fire-and-forget）。
 *
 * 提及对象由**前端**在正文里解析：只有从成员候选面板点选过的姓名才会进 mentionIds，
 * 所以「正文里恰好出现了某个姓名」不会被误通知。数据库侧不解析 Markdown 正文 —— 这是有意的取舍：
 * 通知不是权限，漏发的最坏后果是「被提的人没收到提醒」；为它建一套正文解析触发器，
 * 会让每次发帖/回复的写入都背上解析开销，且 Markdown 语法千变万化，触发器里解析必然不准。
 *
 * 排除 actor（自己提自己）与 owner（帖主另有「新回复」通知，不必收两条）。
 */
function notifyMentions(
  mentionIds: string[],
  actorId: string,
  ownerId: string | undefined,
  params: { title: string; scene: string },
): void {
  const targets = [...new Set(mentionIds)].filter((id) => id !== actorId && id !== ownerId);
  if (targets.length === 0) return;
  createBatchNotifications(targets, {
    type: 'mention',
    title: '有人在论坛提到了你',
    content: `${params.scene}「${params.title}」中提到了你`,
    relatedLink: '/forum',
  }).catch(() => {});
}

/** 发帖。mentionIds = 正文中被 @ 的成员 id（见 notifyMentions 的说明） */
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
  mentionIds?: string[];
}): Promise<ForumPost | null> {
  const { mentionIds, ...row } = post;
  const { data, error } = await supabase
    .from('forum_posts')
    .insert({
      ...row,
      collaborating_departments: row.collaborating_departments ?? [],
      attachments: row.attachments ?? [],
    })
    .select('*')
    .single();

  if (error) { log.error('createPost 创建失败', error); return null; }

  // 帖主自己发帖时不会收到提及通知（owner 即 actor），故 ownerId 传 undefined
  notifyMentions(mentionIds ?? [], post.created_by, undefined, { title: post.title, scene: '帖子' });

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

/** 回复。mentionIds 同 createPost */
export async function createReply(
  postId: string,
  userId: string,
  content: string,
  mentionIds: string[] = [],
): Promise<boolean> {
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
      title: '论坛新回复',
      content: `你的帖子「${postData.title}」有新回复`,
      relatedLink: '/forum',
    }).catch(() => {});
  }

  if (postData) {
    notifyMentions(mentionIds, userId, postData.created_by ?? undefined, {
      title: postData.title,
      scene: '回复',
    });
  }

  return true;
}
