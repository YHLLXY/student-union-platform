import { useState, useEffect } from 'react';
import { Descriptions, Tag, Button, Input, List, message, Popconfirm } from 'antd';
import type { UserProfile } from '../auth';
import { hasMinRole, formatDateTime } from '../../utils/helpers';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../utils/constants';
import { submitTask, fetchTaskSubmissions, reviewSubmission } from './taskService';
import type { Task, TaskSubmission } from './taskService';

const { TextArea } = Input;

interface TaskDetailProps {
  task: Task;
  user: UserProfile;
  onUpdate: () => void;
  onClose: () => void;
}

export default function TaskDetail({ task, user, onUpdate, onClose }: TaskDetailProps) {
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const priority = TASK_PRIORITIES[task.priority] ?? TASK_PRIORITIES.normal;
  const status = TASK_STATUSES[task.status] ?? TASK_STATUSES.pending;

  useEffect(() => {
    fetchTaskSubmissions(task.id).then(setSubmissions);
  }, [task.id]);

  const handleSubmit = async () => {
    if (!note.trim()) {
      message.warning('请填写提交说明');
      return;
    }
    setSubmitting(true);
    const result = await submitTask(task.id, user.id, note.trim());
    setSubmitting(false);
    if (result.success) {
      message.success('提交成功，等待审核');
      setNote('');
      fetchTaskSubmissions(task.id).then(setSubmissions);
      onUpdate();
    } else {
      message.error(result.error ?? '提交失败');
    }
  };

  const handleReview = async (submissionId: string, approved: boolean) => {
    const success = await reviewSubmission(submissionId, task.id, approved, '');
    if (success) {
      message.success(approved ? '已通过' : '已打回');
      fetchTaskSubmissions(task.id).then(setSubmissions);
      onUpdate();
    } else {
      message.error('操作失败');
    }
  };

  const canSubmit = task.status === 'pending' || task.status === 'in_progress';
  const canReview = hasMinRole(user.role, 'dept_head');

  return (
    <div>
      <Descriptions title={task.title} bordered column={2} size="small" style={{ marginBottom: 20 }}>
        <Descriptions.Item label="优先级">
          <Tag color={priority.color}>{priority.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag>{status.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="发布者">{task.creator_name}</Descriptions.Item>
        <Descriptions.Item label="执行人">{task.assignee_name ?? '部门全体'}</Descriptions.Item>
        <Descriptions.Item label="截止时间">{task.deadline ? formatDateTime(task.deadline) : '暂无'}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{formatDateTime(task.created_at)}</Descriptions.Item>
        <Descriptions.Item label="任务内容" span={2}>
          {task.content || '暂无详细内容'}
        </Descriptions.Item>
      </Descriptions>

      {/* 提交完成区 */}
      {canSubmit && (
        <div style={{ marginBottom: 20, padding: '16px', background: '#fafafa', borderRadius: 8 }}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>📤 提交完成</p>
          <TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="描述你的完成情况和备注"
            maxLength={1000}
            style={{ marginBottom: 8 }}
          />
          <Button type="primary" onClick={handleSubmit} loading={submitting}>
            提交任务
          </Button>
        </div>
      )}

      {/* 审核记录 */}
      <p style={{ fontWeight: 500, marginBottom: 8 }}>📋 提交记录</p>
      {submissions.length === 0 ? (
        <p style={{ color: '#95a5a6' }}>暂无提交记录</p>
      ) : (
        <List
          size="small"
          dataSource={submissions}
          renderItem={(sub) => (
            <List.Item
              actions={
                canReview && sub.status === 'submitted'
                  ? [
                      <Popconfirm
                        key="approve"
                        title="确认通过？"
                        onConfirm={() => handleReview(sub.id, true)}
                        okText="通过"
                        cancelText="取消"
                      >
                        <Button type="link" size="small" style={{ color: '#27ae60' }}>
                          通过
                        </Button>
                      </Popconfirm>,
                    ]
                  : undefined
              }
            >
              <List.Item.Meta
                title={
                  <span>
                    {sub.submitter_name}
                    <Tag
                      color={sub.status === 'approved' ? 'green' : sub.status === 'rejected' ? 'red' : 'orange'}
                      style={{ marginLeft: 8 }}
                    >
                      {sub.status === 'approved' ? '已通过' : sub.status === 'rejected' ? '已打回' : '待审核'}
                    </Tag>
                  </span>
                }
                description={
                  <>
                    <div>{sub.note || '无提交说明'}</div>
                    {sub.review_note && <div style={{ color: '#e67e22' }}>审核意见：{sub.review_note}</div>}
                    <div style={{ fontSize: 12, color: '#95a5a6' }}>{formatDateTime(sub.submitted_at)}</div>
                  </>
                }
              />
            </List.Item>
          )}
        />
      )}

      <div style={{ textAlign: 'right', marginTop: 16 }}>
        <Button onClick={onClose}>关闭</Button>
      </div>
    </div>
  );
}
