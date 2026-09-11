import { describe, it, expect } from 'vitest';
import supabase from '@/supabaseClient';
import {
  fetchPosts, fetchMyBookmarkedPosts, fetchPostDetail, fetchMentionUsers,
  createPost, createReply, toggleLike, toggleBookmark, setPostPinned,
} from '@/modules/forum/forumService';
import {
  findMentions, markMentionLinks, splitMentionSegments, activeMentionQuery, MENTION_LINK_HREF,
} from '@/modules/forum/mention';
import { updateMyProfile } from '@/modules/profile/profileService';

/**
 * Phase 3（v4.5.0）新增能力的单元测试。
 *
 * 数据全部现造现用，且**部门名一律用合成值**：vitest 并发跑文件时，
 * 往种子部门（publicity 等）塞帖子会影响其它测试文件对种子数据的断言 ——
 * 这是 Phase 2 首次进 CI 时挂掉的那类问题，此处提前避开。
 */
const db = supabase as unknown as { from: (t: string) => any };
const synthTag = () => `syn${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 1e4)}`;

async function seedUser(role = 'volunteer', department = 'synthdept') {
  const tag = synthTag();
  const { data, error } = await db.from('users').insert({
    auth_id: `cc000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`,
    name: `测试成员${tag}`,
    student_id: tag,
    department,
    role,
  }).select('*').single();
  expect(error).toBeNull();
  return data as { id: string; name: string; department: string };
}

async function seedPost(department: string, createdBy: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await db.from('forum_posts').insert({
    title: `测试帖子 ${synthTag()}`,
    content: '单测用正文',
    category: 'discussion',
    department,
    collaborating_departments: [],
    created_by: createdBy,
    created_at: new Date().toISOString(),
    ...extra,
  }).select('*').single();
  expect(error).toBeNull();
  return data as { id: string };
}

/**
 * 通知是 fire-and-forget 写入的（项目约定：通知/日志不阻塞主流程），
 * 所以断言前要等它落库。轮询而不是固定 sleep：命中即返回，超时才失败。
 */
async function waitForRows(
  table: string,
  match: Record<string, unknown>,
  timeoutMs = 1500,
): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { data } = await db.from(table).select('*').match(match);
    if (data.length > 0) return data as Record<string, unknown>[];
    if (Date.now() > deadline) return [];
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ========== @提及 纯函数 ==========

describe('mention 解析（纯函数）', () => {
  const NAMES = ['张三', '张三丰', '李四'];

  it('只识别名册里的姓名，姓名互为前缀时先匹配长的', () => {
    const text = '请 @张三丰 和 @张三 都看下，顺便 @王五 也提一下';
    expect(findMentions(text, NAMES).map((m) => m.name)).toEqual(['张三丰', '张三']);
  });

  it('邮箱里的 @ 不算提及', () => {
    // '@李四' 紧跟在字母 i 之后 → 视为邮箱本地部分，不当作提及
    expect(findMentions('li@李四.com', NAMES)).toEqual([]);
    expect(findMentions('请邮件 zhang@san.com 或 @李四', NAMES).map((m) => m.name)).toEqual(['李四']);
  });

  it('markMentionLinks 把提及改写成 markdown 链接（保留其余正文原样）', () => {
    expect(markMentionLinks('**重点**：@李四 请确认', NAMES))
      .toBe(`**重点**：[@李四](${MENTION_LINK_HREF}) 请确认`);
  });

  it('splitMentionSegments 按提及切段（回复是纯文本，走这条路径）', () => {
    expect(splitMentionSegments('你好 @李四 再见', NAMES)).toEqual([
      { text: '你好 ', isMention: false },
      { text: '@李四', isMention: true },
      { text: ' 再见', isMention: false },
    ]);
  });

  it('activeMentionQuery 只在「光标正处于未输完的提及」时返回查询串', () => {
    expect(activeMentionQuery('说点什么 @')).toBe('');
    expect(activeMentionQuery('@张')).toBe('张');
    expect(activeMentionQuery('先 @李四 再说其')).toBeNull();
    expect(activeMentionQuery('普通文字')).toBeNull();
    expect(activeMentionQuery('li@李')).toBeNull();
  });
});

// ========== 帖子列表与互动 ==========

describe('fetchPosts 帖子列表（计数列 + 置顶排序 + 互动态）', () => {
  it('回复数/点赞数来自计数列，新帖在前，置顶帖最前', async () => {
    const dept = synthTag();
    const author = await seedUser('volunteer', dept);
    const viewer = await seedUser('volunteer', dept);

    const older = await seedPost(dept, author.id, { created_at: '2026-01-01T00:00:00.000Z' });
    const newer = await seedPost(dept, author.id, { created_at: '2026-02-01T00:00:00.000Z' });

    await db.from('forum_replies').insert([
      { post_id: older.id, content: '回复一', created_by: author.id },
      { post_id: older.id, content: '回复二', created_by: author.id },
    ]);
    await toggleLike(older.id, viewer.id, true);

    let posts = await fetchPosts(dept, undefined, viewer.id);
    expect(posts.map((p) => p.id)).toEqual([newer.id, older.id]);

    const oldRow = posts.find((p) => p.id === older.id)!;
    expect(oldRow.reply_count).toBe(2);
    expect(oldRow.like_count).toBe(1);
    expect(oldRow.is_liked).toBe(true);
    expect(oldRow.is_bookmarked).toBe(false);

    // 置顶后应排到最前（pinned_at DESC NULLS LAST, created_at DESC）
    expect(await setPostPinned(older.id, true)).toBe(true);
    posts = await fetchPosts(dept, undefined, viewer.id);
    expect(posts[0].id).toBe(older.id);
    expect(posts[0].pinned_at).toBeTruthy();

    // 取消置顶后回到按时间排序
    expect(await setPostPinned(older.id, false)).toBe(true);
    posts = await fetchPosts(dept, undefined, viewer.id);
    expect(posts[0].id).toBe(newer.id);
  });

  it('取消点赞后计数与互动态一起回落', async () => {
    const dept = synthTag();
    const author = await seedUser('volunteer', dept);
    const post = await seedPost(dept, author.id, { created_at: '2026-03-01T00:00:00.000Z' });

    expect(await toggleLike(post.id, author.id, true)).toBe(true);
    expect(await toggleLike(post.id, author.id, false)).toBe(true);

    const posts = await fetchPosts(dept, undefined, author.id);
    expect(posts[0].like_count).toBe(0);
    expect(posts[0].is_liked).toBe(false);
  });

  it('重复点赞被数据库按幂等处理（复合主键冲突不报错，也不重复计数）', async () => {
    const dept = synthTag();
    const author = await seedUser('volunteer', dept);
    const post = await seedPost(dept, author.id, { created_at: '2026-04-01T00:00:00.000Z' });

    expect(await toggleLike(post.id, author.id, true)).toBe(true);
    // 第二次：真实库报 23505，服务层按成功处理（双击/重试不该给用户报错）
    expect(await toggleLike(post.id, author.id, true)).toBe(true);

    const posts = await fetchPosts(dept, undefined, author.id);
    expect(posts[0].like_count).toBe(1);
    expect(posts[0].is_liked).toBe(true);
  });

  it('收藏与点赞互不影响', async () => {
    const dept = synthTag();
    const author = await seedUser('volunteer', dept);
    const post = await seedPost(dept, author.id, { created_at: '2026-05-01T00:00:00.000Z' });

    expect(await toggleBookmark(post.id, author.id, true)).toBe(true);
    const posts = await fetchPosts(dept, undefined, author.id);
    expect(posts[0].is_bookmarked).toBe(true);
    expect(posts[0].is_liked).toBe(false);
    expect(posts[0].like_count).toBe(0);
  });
});

describe('fetchMyBookmarkedPosts 我的收藏', () => {
  it('只返回本人收藏的帖子，且按收藏时间倒序', async () => {
    const dept = synthTag();
    const author = await seedUser('volunteer', dept);
    const me = await seedUser('volunteer', dept);
    const other = await seedUser('volunteer', dept);

    const first = await seedPost(dept, author.id, { created_at: '2026-06-01T00:00:00.000Z' });
    const second = await seedPost(dept, author.id, { created_at: '2026-06-02T00:00:00.000Z' });
    const notMine = await seedPost(dept, author.id, { created_at: '2026-06-03T00:00:00.000Z' });

    await toggleBookmark(first.id, me.id, true);
    await new Promise((r) => setTimeout(r, 5)); // 让两次收藏的 created_at 有先后
    await toggleBookmark(second.id, me.id, true);
    await toggleBookmark(notMine.id, other.id, true);

    const marks = await fetchMyBookmarkedPosts(me.id);
    expect(marks.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(marks.every((p) => p.is_bookmarked)).toBe(true);

    // 取消收藏后从收藏列表消失
    expect(await toggleBookmark(second.id, me.id, false)).toBe(true);
    const after = await fetchMyBookmarkedPosts(me.id);
    expect(after.map((p) => p.id)).toEqual([first.id]);
  });
});

describe('fetchPostDetail 帖子详情', () => {
  it('带回复数与本人互动态', async () => {
    const dept = synthTag();
    const author = await seedUser('volunteer', dept);
    const post = await seedPost(dept, author.id, { created_at: '2026-07-01T00:00:00.000Z' });
    await db.from('forum_replies').insert({ post_id: post.id, content: 'nice', created_by: author.id });
    await toggleLike(post.id, author.id, true);

    const detail = await fetchPostDetail(post.id, author.id);
    expect(detail).not.toBeNull();
    expect(detail!.reply_count).toBe(1);
    expect(detail!.is_liked).toBe(true);
  });
});

// ========== @提及 通知 ==========

describe('@提及 通知', () => {
  it('发帖只通知被点选的人，且不通知作者自己', async () => {
    const dept = synthTag();
    const author = await seedUser('dept_head', dept);
    const target = await seedUser('volunteer', dept);
    const bystander = await seedUser('volunteer', dept);

    const post = await createPost({
      title: `提及测试 ${synthTag()}`,
      content: `@${target.name} 麻烦看下这个方案`,
      category: 'discussion',
      department: dept,
      created_by: author.id,
      mentionIds: [target.id, author.id], // 作者自己被"提及"也不该收到通知
    });
    expect(post).not.toBeNull();

    const rows = await waitForRows('notifications', { type: 'mention', user_id: target.id });
    expect(rows.length).toBe(1);
    expect(String(rows[0].content)).toContain('提到了你');

    const bystanderRows = await waitForRows('notifications', { type: 'mention', user_id: bystander.id }, 150);
    expect(bystanderRows).toEqual([]);
    const authorRows = await waitForRows('notifications', { type: 'mention', user_id: author.id }, 150);
    expect(authorRows).toEqual([]);
  });

  it('回复里 @ 帖主以外的成员：帖主只收「新回复」，被提及者收 mention', async () => {
    const dept = synthTag();
    const owner = await seedUser('dept_head', dept);
    const replier = await seedUser('volunteer', dept);
    const mentioned = await seedUser('volunteer', dept);

    const post = await seedPost(dept, owner.id, { created_at: '2026-08-01T00:00:00.000Z' });
    const ok = await createReply(post.id, replier.id, `@${mentioned.name} 你也看下`, [mentioned.id, owner.id]);
    expect(ok).toBe(true);

    const mentions = await waitForRows('notifications', { type: 'mention', user_id: mentioned.id });
    expect(mentions.length).toBe(1);

    const replies = await waitForRows('notifications', { type: 'forum_reply', user_id: owner.id });
    expect(replies.length).toBe(1);
    // 帖主同时被 @ 时不再重复通知
    expect(await waitForRows('notifications', { type: 'mention', user_id: owner.id }, 150)).toEqual([]);
  });

  it('回复会把帖子的计数列 +1（真实库由 trg_forum_replies_count 维护）', async () => {
    const dept = synthTag();
    const author = await seedUser('volunteer', dept);
    const post = await seedPost(dept, author.id, { created_at: '2026-09-01T00:00:00.000Z' });

    await createReply(post.id, author.id, '第一条');
    await createReply(post.id, author.id, '第二条');

    const detail = await fetchPostDetail(post.id);
    expect(detail!.reply_count).toBe(2);
  });
});

// ========== 成员名册 ==========

describe('fetchMentionUsers 成员名册', () => {
  it('排除已移除（role=removed）的用户', async () => {
    const dept = synthTag();
    const alive = await seedUser('volunteer', dept);
    const removed = await seedUser('removed', dept);

    const list = await fetchMentionUsers();
    expect(list.some((u) => u.id === alive.id)).toBe(true);
    expect(list.some((u) => u.id === removed.id)).toBe(false);
  });
});

// ========== 个人资料编辑 ==========

describe('updateMyProfile 个人资料编辑', () => {
  it('更新显示名 / 联系方式 / 引导状态', async () => {
    const user = await seedUser();
    const tag = synthTag();

    const ok = await updateMyProfile(user.id, {
      name: `改名${tag}`,
      contact_phone: '13800000000',
      contact_email: `${tag}@example.com`,
      onboarded: true,
    });
    expect(ok).toBe(true);

    const { data } = await db.from('users').select('*').eq('id', user.id).single();
    expect(data.name).toBe(`改名${tag}`);
    expect(data.contact_phone).toBe('13800000000');
    expect(data.contact_email).toBe(`${tag}@example.com`);
    expect(data.onboarded).toBe(true);
  });

  it('联系方式可以清回 NULL（「填了又清空」不该留下空字符串）', async () => {
    const user = await seedUser();
    await updateMyProfile(user.id, { contact_phone: '13900000000' });
    await updateMyProfile(user.id, { contact_phone: null });

    const { data } = await db.from('users').select('*').eq('id', user.id).single();
    expect(data.contact_phone).toBeNull();
  });

  it('空 patch 直接成功，不发无意义的请求', async () => {
    const user = await seedUser();
    expect(await updateMyProfile(user.id, {})).toBe(true);
  });

  it('新注册用户（种子默认）onboarded 为 false —— 引导会弹出来', async () => {
    const user = await seedUser();
    const { data } = await db.from('users').select('*').eq('id', user.id).single();
    expect(data.onboarded).toBe(false);
  });
});
