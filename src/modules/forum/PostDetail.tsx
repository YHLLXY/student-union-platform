import { useState, useEffect, useMemo } from 'react';
import { Button, Tag, message, Select, Popconfirm, Descriptions, Grid, theme, Space } from 'antd';
import {
  SendOutlined, DeleteOutlined, PlusOutlined, LikeOutlined, StarOutlined, StarFilled,
  PushpinOutlined, PushpinFilled,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/components/AuthContext';
import { RouteSkeleton } from '@/components/SkeletonBlocks';
import { formatDateTime, hasMinRole, getDepartmentLabel } from '@/utils/helpers';
import { FORUM_CATEGORIES, DEPARTMENTS } from '@/utils/constants';
import {
  fetchPostDetail, fetchReplies, createReply, deletePost, updateCollaboratingDepts,
  fetchMentionUsers, toggleLike, toggleBookmark, setPostPinned,
} from './forumService';
import type { ForumPost, ForumReply } from './forumService';
import { markMentionLinks } from './mention';
import MentionInput from './MentionInput';
import MentionText, { mentionComponents } from './MentionText';
import FileList from '@/components/FileList';
import styles from './forum.module.css';

const deptOptions = Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label }));

const templateFieldLabels: Record<string, Record<string, string>> = {
  meeting: {
    meeting_time: '会议时间', location: '会议地点', attendees: '参会人员',
    topics: '议题列表', resolutions: '决议', todos: '待办事项',
  },
  review: {
    activity_name: '活动名称', activity_time: '活动时间', participant_count: '参与人数',
    highlights: '活动亮点', shortcomings: '不足之处', improvements: '改进建议',
    budget_summary: '预算决算情况',
  },
  contact: {
    org_name: '单位名称', contact_person: '联系人', position: '职务',
    phone_wechat: '电话/微信', cooperation_history: '合作历史', notes: '备注',
  },
};

interface PostDetailProps {
  postId: string;
  onClose: () => void;
  onDeleted?: () => void;
  /** 帖子上的计数/状态被改动时通知列表刷新（回复、点赞、收藏、置顶都会走到） */
  onChanged?: () => void;
}

export default function PostDetail({ postId, onClose, onDeleted, onChanged }: PostDetailProps) {
  const { token } = theme.useToken();
  const { md } = Grid.useBreakpoint();
  const user = useAuth();
  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [replyMentions, setReplyMentions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [addingDept, setAddingDept] = useState<string[]>([]);

  // 成员名册：提及高亮与候选面板共用。变化很慢，缓存 10 分钟。
  const mentionQuery = useQuery({
    queryKey: ['forumMentionUsers'],
    queryFn: fetchMentionUsers,
    staleTime: 10 * 60 * 1000,
  });
  const mentionUsers = mentionQuery.data ?? [];
  const mentionNames = useMemo(() => mentionUsers.map((u) => u.name), [mentionUsers]);

  const load = () => {
    // 弹窗内临时数据：命令式拉取，但必须暴露错误（SbError 约定）
    fetchPostDetail(postId, user.id)
      .then((p) => { setPost(p); if (p) setAddingDept(p.collaborating_departments ?? []); })
      .catch(() => message.error('帖子加载失败'));
    fetchReplies(postId)
      .then(setReplies)
      .catch(() => message.error('回复加载失败'));
  };

  useEffect(() => { load(); }, [postId]);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    const ok = await createReply(postId, user.id, replyText.trim(), replyMentions);
    setSending(false);
    if (ok) {
      message.success('回复成功');
      setReplyText('');
      setReplyMentions([]);
      fetchReplies(postId).then(setReplies).catch(() => message.error('回复加载失败'));
      // 回复数由数据库计⇒ 触发器维护，本地拿不到新值，交给列表重新拉
      setPost((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
      onChanged?.();
    } else {
      message.error('回复失败');
    }
  };

  const handleToggleLike = async () => {
    if (!post) return;
    const next = !post.is_liked;
    setPost({ ...post, is_liked: next, like_count: Math.max(0, post.like_count + (next ? 1 : -1)) });
    const ok = await toggleLike(post.id, user.id, next);
    if (ok) { onChanged?.(); return; }
    setPost((prev) => (prev ? { ...prev, is_liked: !next, like_count: Math.max(0, prev.like_count + (next ? -1 : 1)) } : prev));
    message.error(next ? '点赞失败' : '取消点赞失败');
  };

  const handleToggleBookmark = async () => {
    if (!post) return;
    const next = !post.is_bookmarked;
    setPost({ ...post, is_bookmarked: next });
    const ok = await toggleBookmark(post.id, user.id, next);
    if (ok) { message.success(next ? '已收藏' : '已取消收藏'); onChanged?.(); return; }
    setPost((prev) => (prev ? { ...prev, is_bookmarked: !next } : prev));
    message.error(next ? '收藏失败' : '取消收藏失败');
  };

  const handleTogglePin = async () => {
    if (!post) return;
    const next = !post.pinned_at;
    const ok = await setPostPinned(post.id, next);
    if (ok) {
      message.success(next ? '已置顶' : '已取消置顶');
      load();
      onChanged?.();
    } else {
      // 数据库守卫触发器会拒绝无权限者（部门负责人以下），这里的失败信息就是它给的
      message.error('置顶失败：只有部门负责人及以上可以置顶');
    }
  };

  const handleDelete = async () => {
    const ok = await deletePost(postId);
    if (ok) {
      message.success('帖子已删除');
      onDeleted?.();
      onClose();
    } else {
      message.error('删除失败');
    }
  };

  const handleAddDept = async () => {
    if (!post) return;
    const ok = await updateCollaboratingDepts(post.id, addingDept);
    if (ok) {
      message.success('协同部门已更新');
      load();
    } else {
      message.error('更新失败');
    }
  };

  // 权限判断
  const isAuthor = post?.created_by === user.id;
  const isDeptHead = hasMinRole(user.role, 'dept_head');
  const isPlatformAdmin = hasMinRole(user.role, 'president');
  const canDelete = isAuthor || (isDeptHead && post?.department === user.department) || isPlatformAdmin;
  const canManageDept = hasMinRole(user.role, 'presidium');
  // 仅用于「藏按钮」；真正的边界是数据库里的 trg_forum_posts_pin_guard
  const canPin = hasMinRole(user.role, 'dept_head');

  if (!post) return <RouteSkeleton />;

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>{post.title}</h2>
      <div style={{ fontSize: 13, color: token.colorTextSecondary, marginBottom: 16 }}>
        {post.pinned_at && <Tag color="gold" icon={<PushpinFilled />}>置顶</Tag>}
        <Tag>{FORUM_CATEGORIES[post.category] ?? '讨论'}</Tag>
        <Tag color="blue">{getDepartmentLabel(post.department)}</Tag>
        {post.collaborating_departments?.length > 0 && (
          post.collaborating_departments.map((d) => (
            <Tag key={d} color="green">{getDepartmentLabel(d)}</Tag>
          ))
        )}
        {post.author_name} · {formatDateTime(post.created_at)}
        {post.updated_at !== post.created_at && ` (已编辑)`}
      </div>

      <div style={{ padding: '16px 0', borderTop: `1px solid ${token.colorBorderSecondary}`, lineHeight: 1.8 }}>
        {post.template_type && post.template_data ? (
          <Descriptions bordered size="small" column={1}>
            {Object.entries(post.template_data).map(([key, val]) => {
              const label = templateFieldLabels[post.template_type!]?.[key] ?? key;
              const renderVal = (v: unknown) => {
                if (Array.isArray(v)) return v.join('、');
                if (typeof v === 'string' && v.includes('\n')) {
                  return v.split('\n').map((line, i) => (<div key={i}>{line || <br />}</div>));
                }
                return String(v ?? '-');
              };
              return (
                <Descriptions.Item key={key} label={label}>
                  {renderVal(val)}
                </Descriptions.Item>
              );
            })}
          </Descriptions>
        ) : (
          <ReactMarkdown components={mentionComponents}>
            {markMentionLinks(post.content || '暂无内容', mentionNames)}
          </ReactMarkdown>
        )}
        <FileList attachments={post.attachments} />
      </div>

      {/* 点赞 / 收藏 / 置顶 */}
      <div className={styles.detailActions}>
        <button
          type="button"
          className={`${styles.actionBtn} ${post.is_liked ? styles.actionActive : ''}`}
          aria-pressed={!!post.is_liked}
          aria-label={post.is_liked ? '取消点赞' : '点赞'}
          onClick={handleToggleLike}
        >
          <LikeOutlined /> <span className={styles.actionCount}>{post.like_count}</span>
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${post.is_bookmarked ? styles.actionActive : ''}`}
          aria-pressed={!!post.is_bookmarked}
          aria-label={post.is_bookmarked ? '取消收藏' : '收藏'}
          onClick={handleToggleBookmark}
        >
          {post.is_bookmarked ? <StarFilled /> : <StarOutlined />}
          <span className={styles.actionCount}>{post.is_bookmarked ? '已收藏' : '收藏'}</span>
        </button>
        {canPin && (
          <button
            type="button"
            className={`${styles.actionBtn} ${post.pinned_at ? styles.actionActive : ''}`}
            aria-pressed={!!post.pinned_at}
            aria-label={post.pinned_at ? '取消置顶' : '置顶'}
            onClick={handleTogglePin}
          >
            {post.pinned_at ? <PushpinFilled /> : <PushpinOutlined />}
            <span className={styles.actionCount}>{post.pinned_at ? '取消置顶' : '置顶'}</span>
          </button>
        )}
      </div>

      {/* 追加协同部门（presidium+） */}
      {canManageDept && (
        <div style={{ padding: '12px 0', borderTop: `1px solid ${token.colorBorderSecondary}`, marginTop: 12 }}>
          <span style={{ fontSize: 13, color: token.colorTextSecondary, marginRight: 8 }}>协同部门：</span>
          <Select
            mode="multiple"
            size="small"
            style={{ width: md ? 360 : '100%' }}
            value={addingDept}
            onChange={setAddingDept}
            options={deptOptions}
            placeholder="添加可查看此帖的部门"
          />
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleAddDept}
            style={{ marginLeft: 8 }}
          >
            更新
          </Button>
        </div>
      )}

      {/* 回复列表 */}
      <div className={styles.replyList}>
        <h4>回复 ({post.reply_count})</h4>
        {replies.length === 0 ? (
          <p style={{ color: token.colorTextTertiary }}>暂无回复，来说点什么吧</p>
        ) : (
          replies.map((reply) => (
            <div key={reply.id} className={styles.replyItem}>
              <div>
                <span className={styles.replyAuthor}>{reply.author_name}</span>
                <span className={styles.replyTime}>{formatDateTime(reply.created_at)}</span>
              </div>
              <div className={styles.replyContent}>
                {/* 回复是纯文本（不走 Markdown），提及直接按名册切段高亮 */}
                <MentionText text={reply.content} names={mentionNames} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* 回复输入框：输入 @ 弹成员候选 */}
      <div className={styles.replyInput}>
        <MentionInput
          value={replyText}
          onChange={setReplyText}
          onMentionsChange={setReplyMentions}
          users={mentionUsers}
          rows={2}
          placeholder="输入回复内容…（@ 可提及成员）"
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

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <div>
          {canDelete && (
            <Popconfirm
              title="确认删除该帖子？回复也会一并删除"
              onConfirm={handleDelete}
              okText="确认"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>删除帖子</Button>
            </Popconfirm>
          )}
        </div>
        <Space>
          <Button onClick={onClose}>关闭</Button>
        </Space>
      </div>
    </div>
  );
}
