import { useRef, useState } from 'react';
import { Card, Tag, Button, Menu, Modal, Grid, message } from 'antd';
import type { MenuProps } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PlusOutlined, MessageOutlined, FolderOutlined,
  LikeOutlined, StarOutlined, StarFilled, PushpinFilled,
} from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { CardStreamSkeleton } from '@/components/SkeletonBlocks';
import { EmptyState, PageHeader } from '@/components/common';
import { formatDateTime, hasMinRole } from '@/utils/helpers';
import { FORUM_CATEGORIES } from '@/utils/constants';
import { fetchPosts, fetchMyBookmarkedPosts, toggleLike, toggleBookmark } from './forumService';
import type { ForumPost } from './forumService';
import PostDetail from './PostDetail';
import PostForm from './PostForm';
import styles from './forum.module.css';

/** 「我的收藏」伪分类：不是 forum_posts.category 的取值，只在本页当作列表来源开关 */
const BOOKMARK_KEY = 'bookmarks';

const categoryItems = Object.entries(FORUM_CATEGORIES)
  .filter(([key]) => key !== 'all')
  .map(([key, label]) => ({ key, label }));

const categoryMenuItems: MenuProps['items'] = [
  { key: 'all', label: '全部' },
  { key: BOOKMARK_KEY, label: '我的收藏' },
  { type: 'divider' },
  ...categoryItems.map((c) => ({ key: c.key, label: c.label })),
];

/** 移动端 chips 不接受 divider，单独排一份 */
const chipItems = [{ key: 'all', label: '全部' }, { key: BOOKMARK_KEY, label: '我的收藏' }, ...categoryItems];

export default function PostList() {
  const { md } = Grid.useBreakpoint();
  const user = useAuth();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // 防连点：同一个帖子的点赞/收藏请求未回来之前，忽略后续点击（乐观更新下的重复请求没有意义）
  const pendingRef = useRef(new Set<string>());

  // staleTime 30s 下切换分类按 key 各自缓存，回切秒开
  const postsQuery = useQuery({
    queryKey: ['forumPosts', user.department, category],
    queryFn: () => (category === BOOKMARK_KEY
      ? fetchMyBookmarkedPosts(user.id)
      : fetchPosts(user.department, category === 'all' ? undefined : category, user.id)),
  });

  const posts = postsQuery.data ?? [];
  const loadPosts = () => queryClient.invalidateQueries({ queryKey: ['forumPosts'] });

  /** 就地改写缓存里的某条帖子 —— 乐观更新统一走这里，避免维护一份影子 state */
  const patchPost = (postId: string, patch: (p: ForumPost) => ForumPost) => {
    queryClient.setQueryData<ForumPost[]>(['forumPosts', user.department, category], (prev) =>
      prev?.map((p) => (p.id === postId ? patch(p) : p)));
  };

  const handleSelect = ({ key }: { key: string }) => {
    setCategory(key);
  };

  const handleToggleLike = async (post: ForumPost) => {
    const key = `like:${post.id}`;
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);

    const next = !post.is_liked;
    const revert = () => patchPost(post.id, (p) => ({
      ...p, is_liked: !next, like_count: Math.max(0, p.like_count + (next ? -1 : 1)),
    }));
    patchPost(post.id, (p) => ({
      ...p, is_liked: next, like_count: Math.max(0, p.like_count + (next ? 1 : -1)),
    }));

    const ok = await toggleLike(post.id, user.id, next);
    pendingRef.current.delete(key);
    if (!ok) {
      revert();
      message.error(next ? '点赞失败' : '取消点赞失败');
    }
  };

  const handleToggleBookmark = async (post: ForumPost) => {
    const key = `mark:${post.id}`;
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);

    const next = !post.is_bookmarked;
    // 「我的收藏」列表里取消收藏 = 这条不该再出现，直接摘掉；失败再整表拉回来
    const removeFromList = category === BOOKMARK_KEY && !next;
    if (removeFromList) {
      queryClient.setQueryData<ForumPost[]>(['forumPosts', user.department, category], (prev) =>
        prev?.filter((p) => p.id !== post.id));
    } else {
      patchPost(post.id, (p) => ({ ...p, is_bookmarked: next }));
    }

    const ok = await toggleBookmark(post.id, user.id, next);
    pendingRef.current.delete(key);
    if (!ok) {
      if (removeFromList) void postsQuery.refetch();
      else patchPost(post.id, (p) => ({ ...p, is_bookmarked: !next }));
      message.error(next ? '收藏失败' : '取消收藏失败');
    }
  };

  return (
    <div className={styles.layout}>
      {md && (
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>
            <FolderOutlined style={{ marginRight: 6 }} />
            分类
          </div>
          <Menu
            mode="inline"
            selectedKeys={[category]}
            onClick={handleSelect}
            items={categoryMenuItems}
            style={{ borderRight: 0 }}
          />
        </div>
      )}

      <div className={styles.mainArea}>
        <PageHeader
          icon={<MessageOutlined />}
          title="部门论坛"
          subtitle="工作讨论、活动策划与资料共享"
          extra={hasMinRole(user.role, 'dept_head') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
              发帖
            </Button>
          )}
        />

        {/* 移动端：分类折叠为横向滚动 chips，避免纵向长列表把标题挤出首屏 */}
        {!md && (
          <div className={styles.categoryChips} role="tablist" aria-label="帖子分类">
            {chipItems.map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={category === c.key}
                className={`${styles.chip} ${category === c.key ? styles.chipActive : ''}`}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {postsQuery.isPending ? (
          <CardStreamSkeleton />
        ) : postsQuery.isError ? (
          <EmptyState
            icon={<MessageOutlined />}
            title="帖子加载失败"
            description="网络异常或服务暂时不可用，请稍后重试"
            action={<Button type="primary" onClick={() => postsQuery.refetch()}>重新加载</Button>}
          />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={category === BOOKMARK_KEY ? <StarOutlined /> : <MessageOutlined />}
            title={category === BOOKMARK_KEY ? '还没有收藏的帖子' : '暂无帖子'}
            description={category === BOOKMARK_KEY
              ? '在帖子下方点「收藏」，之后就能在这里快速找到'
              : '切换上方分类浏览，或发布第一个帖子'}
          />
        ) : (
          posts.map((post, i) => (
            <Card
              key={post.id}
              style={{ animation: `fadeInUp var(--dur-slow) var(--ease-enter) ${Math.min(i * 0.06, 0.42)}s backwards` }}
              className={styles.postCard}
              onClick={() => setDetailId(post.id)}
            >
              <div className={styles.postTitle}>{post.title}</div>
              <div className={styles.postMeta}>
                {post.pinned_at && (
                  <Tag color="gold" icon={<PushpinFilled />}>置顶</Tag>
                )}
                <Tag>{FORUM_CATEGORIES[post.category] ?? '讨论'}</Tag>
                <span>{post.author_name}</span>
                <span><MessageOutlined /> {post.reply_count}</span>
                <span>{formatDateTime(post.created_at)}</span>
              </div>

              <div className={styles.postActions}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${post.is_liked ? styles.actionActive : ''}`}
                  aria-pressed={!!post.is_liked}
                  aria-label={post.is_liked ? '取消点赞' : '点赞'}
                  onClick={(e) => { e.stopPropagation(); void handleToggleLike(post); }}
                >
                  <LikeOutlined /> <span className={styles.actionCount}>{post.like_count}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${post.is_bookmarked ? styles.actionActive : ''}`}
                  aria-pressed={!!post.is_bookmarked}
                  aria-label={post.is_bookmarked ? '取消收藏' : '收藏'}
                  onClick={(e) => { e.stopPropagation(); void handleToggleBookmark(post); }}
                >
                  {post.is_bookmarked ? <StarFilled /> : <StarOutlined />}
                  <span className={styles.actionCount}>{post.is_bookmarked ? '已收藏' : '收藏'}</span>
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        open={!!detailId}
        onCancel={() => setDetailId(null)}
        footer={null}
        width={md ? 720 : undefined}
        destroyOnHidden
      >
        {detailId && (
          <PostDetail
            postId={detailId}
            onClose={() => setDetailId(null)}
            onDeleted={loadPosts}
            onChanged={loadPosts}
          />
        )}
      </Modal>

      <Modal
        open={showForm}
        onCancel={() => setShowForm(false)}
        footer={null}
        width={md ? 600 : undefined}
        destroyOnHidden
      >
        <PostForm
          onSuccess={() => { setShowForm(false); loadPosts(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
