import { useState, useEffect } from 'react';
import { Button, Input, Tag, Spin, message, Select, Popconfirm, Descriptions } from 'antd';
import { SendOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../components/AuthContext';
import { formatDateTime, hasMinRole, getDepartmentLabel } from '../../utils/helpers';
import { FORUM_CATEGORIES, DEPARTMENTS } from '../../utils/constants';
import { fetchPostDetail, fetchReplies, createReply, deletePost, updateCollaboratingDepts } from './forumService';
import type { ForumPost, ForumReply } from './forumService';
import styles from './forum.module.css';

const { TextArea } = Input;

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
}

export default function PostDetail({ postId, onClose, onDeleted }: PostDetailProps) {
  const user = useAuth();
  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [addingDept, setAddingDept] = useState<string[]>([]);

  const load = () => {
    fetchPostDetail(postId).then((p) => { setPost(p); if (p) setAddingDept(p.collaborating_departments ?? []); });
    fetchReplies(postId).then(setReplies);
  };

  useEffect(() => { load(); }, [postId]);

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
  const isAdmin = hasMinRole(user.role, 'president');
  const canDelete = isAuthor || (isDeptHead && post?.department === user.department) || isAdmin;
  const canManageDept = hasMinRole(user.role, 'presidium');

  if (!post) return <Spin />;

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>{post.title}</h2>
      <div style={{ fontSize: 13, color: '#7f8c8d', marginBottom: 16 }}>
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

      <div style={{ padding: '16px 0', borderTop: '1px solid #f0f0f0', lineHeight: 1.8 }}>
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
          <ReactMarkdown>{post.content || '暂无内容'}</ReactMarkdown>
        )}
      </div>

      {/* 追加协同部门（presidium+） */}
      {canManageDept && (
        <div style={{ padding: '12px 0', borderTop: '1px solid #f0f0f0', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: '#666', marginRight: 8 }}>协同部门：</span>
          <Select
            mode="multiple"
            size="small"
            style={{ width: 360 }}
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
        <Button onClick={onClose}>关闭</Button>
      </div>
    </div>
  );
}
