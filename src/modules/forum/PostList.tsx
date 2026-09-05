import { useState } from 'react';
import { Card, Tag, Button, Menu, Modal, Grid } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusOutlined, MessageOutlined, FolderOutlined } from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { CardStreamSkeleton } from '@/components/SkeletonBlocks';
import { EmptyState, PageHeader } from '@/components/common';
import { formatDateTime, hasMinRole } from '@/utils/helpers';
import { FORUM_CATEGORIES } from '@/utils/constants';
import { fetchPosts } from './forumService';
import PostDetail from './PostDetail';
import PostForm from './PostForm';
import styles from './forum.module.css';

const categoryItems = Object.entries(FORUM_CATEGORIES)
  .filter(([key]) => key !== 'all')
  .map(([key, label]) => ({ key, label }));

export default function PostList() {
  const { md } = Grid.useBreakpoint();
  const user = useAuth();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // staleTime 30s 下切换分类按 key 各自缓存，回切秒开
  const postsQuery = useQuery({
    queryKey: ['forumPosts', user.department, category],
    queryFn: () => fetchPosts(user.department, category === 'all' ? undefined : category),
  });

  const posts = postsQuery.data ?? [];
  const loadPosts = () => queryClient.invalidateQueries({ queryKey: ['forumPosts'] });

  const handleSelect = ({ key }: { key: string }) => {
    setCategory(key);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarTitle}>
          <FolderOutlined style={{ marginRight: 6 }} />
          分类
        </div>
        <Menu
          mode="inline"
          selectedKeys={[category]}
          onClick={handleSelect}
          items={[
            { key: 'all', label: '全部' },
            ...categoryItems.map((c) => ({ key: c.key, label: c.label })),
          ]}
          style={{ borderRight: 0 }}
        />
      </div>

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
            icon={<MessageOutlined />}
            title="暂无帖子"
            description="选择左侧分类浏览，或发布第一个帖子"
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
                <Tag>{FORUM_CATEGORIES[post.category] ?? '讨论'}</Tag>
                <span>{post.author_name}</span>
                <span><MessageOutlined /> {post.reply_count}</span>
                <span>{formatDateTime(post.created_at)}</span>
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
        {detailId && <PostDetail postId={detailId} onClose={() => setDetailId(null)} onDeleted={loadPosts} />}
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
