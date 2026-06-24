import { useState, useEffect } from 'react';
import { Button, Input, Tag, Spin, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../components/AuthContext';
import { formatDateTime } from '../../utils/helpers';
import { FORUM_CATEGORIES } from '../../utils/constants';
import { fetchPostDetail, fetchReplies, createReply } from './forumService';
import type { ForumPost, ForumReply } from './forumService';
import styles from './forum.module.css';

const { TextArea } = Input;

interface PostDetailProps {
  postId: string;
  onClose: () => void;
}

export default function PostDetail({ postId, onClose }: PostDetailProps) {
  const user = useAuth();
  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchPostDetail(postId).then(setPost);
    fetchReplies(postId).then(setReplies);
  }, [postId]);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    const ok = await createReply(postId, user.id, replyText.trim());
    setSending(false);
    if (ok) {
      message.success('回复成功');
      setReplyText('');
      fetchReplies(postId).then(setReplies);
    } else {
      message.error('回复失败');
    }
  };

  if (!post) return <Spin />;

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>{post.title}</h2>
      <div style={{ fontSize: 13, color: '#7f8c8d', marginBottom: 16 }}>
        <Tag>{FORUM_CATEGORIES[post.category] ?? '讨论'}</Tag>
        {post.author_name} · {formatDateTime(post.created_at)}
        {post.updated_at !== post.created_at && ` (已编辑)`}
      </div>

      <div style={{ padding: '16px 0', borderTop: '1px solid #f0f0f0', lineHeight: 1.8 }}>
        <ReactMarkdown>{post.content || '暂无内容'}</ReactMarkdown>
      </div>

      {/* 回复列表 */}
      <div className={styles.replyList}>
        <h4>回复 ({replies.length})</h4>
        {replies.length === 0 ? (
          <p style={{ color: '#95a5a6' }}>暂无回复，来说点什么吧</p>
        ) : (
          replies.map((reply) => (
            <div key={reply.id} className={styles.replyItem}>
              <div>
                <span className={styles.replyAuthor}>{reply.author_name}</span>
                <span className={styles.replyTime}>{formatDateTime(reply.created_at)}</span>
              </div>
              <div className={styles.replyContent}>{reply.content}</div>
            </div>
          ))
        )}
      </div>

      {/* 回复输入框 */}
      <div className={styles.replyInput}>
        <TextArea
          rows={2}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="输入回复内容…"
          maxLength={2000}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleReply}
          loading={sending}
        >
          发送
        </Button>
      </div>

      <div style={{ textAlign: 'right', marginTop: 16 }}>
        <Button onClick={onClose}>关闭</Button>
      </div>
    </div>
  );
}
