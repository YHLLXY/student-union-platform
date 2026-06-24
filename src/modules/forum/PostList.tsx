import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Menu, Modal, Spin, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { formatDateTime } from '../../utils/helpers';
import { FORUM_CATEGORIES } from '../../utils/constants';
import { fetchPosts } from './forumService';
import type { ForumPost } from './forumService';
import PostDetail from './PostDetail';
import PostForm from './PostForm';
import styles from './forum.module.css';

const categoryItems = Object.entries(FORUM_CATEGORIES)
  .filter(([key]) => key !== 'all')
  .map(([key, label]) => ({ key, label }));

export default function PostList() {
  const user = useAuth();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadPosts = useCallback(async () => {
    const data = await fetchPosts(user.department, category);
    setPosts(data);
    setLoading(false);
  }, [user.department, category]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleSelect = ({ key }: { key: string }) => {
    setCategory(key);
    setLoading(true);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarTitle}>📂 分类</div>
        <Menu
          mode="inline"
          selectedKeys={[category]}
          onClick={handleSelect}
          items={[
            { key: 'all', label: `全部` },
            ...categoryItems.map((c) => ({ key: c.key, label: c.label })),
          ]}
          style={{ borderRight: 0 }}
        />
      </div>

      <div className={styles.mainArea}>
        <div className={styles.pageHeader}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>💬 部门论坛</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
            发帖
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
        ) : posts.length === 0 ? (
          <Empty description="暂无帖子" />
        ) : (
          posts.map((post) => (
            <Card key={post.id} className={styles.postCard} onClick={() => setDetailId(post.id)}>
              <div className={styles.postTitle}>{post.title}</div>
              <div className={styles.postMeta}>
                <Tag>{FORUM_CATEGORIES[post.category] ?? '讨论'}</Tag>
                <span>{post.author_name}</span>
                <span>💬 {post.reply_count}</span>
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
        width={720}
        destroyOnClose
      >
        {detailId && <PostDetail postId={detailId} onClose={() => setDetailId(null)} />}
      </Modal>

      <Modal
        open={showForm}
        onCancel={() => setShowForm(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        <PostForm
          onSuccess={() => { setShowForm(false); loadPosts(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
