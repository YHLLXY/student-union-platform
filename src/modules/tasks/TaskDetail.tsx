import { useState, useEffect } from 'react';
import { Descriptions, Tag, Button, Input, List, message, Popconfirm, Checkbox } from 'antd';
import type { UserProfile } from '../auth';
import { hasMinRole, formatDateTime, getDepartmentLabel } from '../../utils/helpers';
import { TASK_PRIORITIES, TASK_STATUSES, NOTICE_TYPES } from '../../utils/constants';
import {
  submitTask, fetchTaskSubmissions, reviewSubmission,
  updateHandoverNote, fetchLinkedNotices,
} from './taskService';
import type { Task, TaskSubmission, LinkedNotice } from './taskService';
import styles from './tasks.module.css';
import MilestonePanel from './MilestonePanel';

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
  const [handoverNote, setHandoverNote] = useState(task.handover_note ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [linkedNotices, setLinkedNotices] = useState<LinkedNotice[]>([]);
  const priority = TASK_PRIORITIES[task.priority] ?? TASK_PRIORITIES.normal;
  const status = TASK_STATUSES[task.status] ?? TASK_STATUSES.pending;

  useEffect(() => {
    fetchTaskSubmissions(task.id).then(setSubmissions);
    fetchLinkedNotices(task.id).then(setLinkedNotices);
  }, [task.id]);

  // 解析 Markdown 步骤清单为交互式 Checklist
  const parseSteps = (content: string) => {
    const lines = content.split('\n');
    const steps: { text: string; checked: boolean }[] = [];
    let inSteps = false;
    for (const line of lines) {
      if (line.startsWith('## 步骤清单')) { inSteps = true; continue; }
      if (inSteps && line.startsWith('## ')) { inSteps = false; continue; }
      if (inSteps && line.trim().startsWith('- [ ]')) {
        steps.push({ text: line.replace('- [ ]', '').trim(), checked: false });
      } else if (inSteps && line.trim().startsWith('- [x]')) {
        steps.push({ text: line.replace('- [x]', '').trim(), checked: true });
      }
    }
    return steps;
  };

  const steps = parseSteps(task.content ?? '');

  const handleSubmit = async () => {
    if (!note.trim()) {
      message.warning('请填写提交说明');
      return;
    }
    setSubmitting(true);
    if (handoverNote.trim()) {
      await updateHandoverNote(task.id, handoverNote.trim());
    }
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

  const handleSaveHandover = async () => {
    const ok = await updateHandoverNote(task.id, handoverNote.trim());
    if (ok) { message.success('交接备注已保存'); onUpdate(); }
    else { message.error('保存失败'); }
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
          <Tag color={status.color}>{status.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="发布者">{task.creator_name}</Descriptions.Item>
        <Descriptions.Item label="执行人">{task.assignee_name ?? '部门全体'}</Descriptions.Item>
        <Descriptions.Item label="截止时间">{task.deadline ? formatDateTime(task.deadline) : '暂无'}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{formatDateTime(task.created_at)}</Descriptions.Item>
        {task.collaborating_departments && task.collaborating_departments.length > 0 && (
          <Descriptions.Item label="关联部门" span={2}>
            {task.collaborating_departments.map((d) => (
              <Tag key={d} color="blue">{getDepartmentLabel(d)}</Tag>
            ))}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="任务内容" span={2}>
          {task.content || '暂无详细内容'}
        </Descriptions.Item>
        {task.handover_note && (
          <Descriptions.Item label="📝 交接备注" span={2}>
            <div style={{ whiteSpace: 'pre-wrap', background: '#fffbe6', padding: 8, borderRadius: 4 }}>
              {task.handover_note}
            </div>
          </Descriptions.Item>
        )}
      </Descriptions>

      {/* 步骤清单交互式 Checklist */}
      {steps.length > 0 && (
        <div className={styles.stepChecklist}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>✅ 步骤清单</p>
          {steps.map((step, i) => (
            <div key={i} className={styles.stepItem}>
              <Checkbox checked={step.checked} style={{ pointerEvents: 'none' }}>
                <span style={step.checked ? { textDecoration: 'line-through', color: '#95a5a6' } : {}}>
                  {step.text}
                </span>
              </Checkbox>
            </div>
          ))}
        </div>
      )}

      {/* 里程碑面板（仅当任务启用了里程碑模式时显示） */}
      {task.has_milestones && (
        <MilestonePanel
          taskId={task.id}
          userId={user.id}
          userRole={user.role}
        />
      )}

      {/* 来源公告 */}
      {task.linked_notice_id && (
        <div className={styles.linkedSection}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>📋 来源公告</p>
          <Tag color="blue">从公告创建</Tag>
        </div>
      )}

      {/* 关联公告 */}
      {linkedNotices.length > 0 && (
        <div className={styles.linkedSection}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>📢 被以下公告关联</p>
          {linkedNotices.map((n) => (
            <Tag key={n.id} color="orange" style={{ cursor: 'pointer', marginBottom: 4 }}>
              {NOTICE_TYPES[n.type] ?? '通知'}：{n.title}
            </Tag>
          ))}
        </div>
      )}

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
          <div className={styles.handoverHint}>
            💡 填写交接备注，方便后继者了解注意事项
          </div>
          <TextArea
            rows={2}
            value={handoverNote}
            onChange={(e) => setHandoverNote(e.target.value)}
            placeholder="交接备注（可选）：后续接手的同学需要知道什么？"
            maxLength={1000}
            style={{ marginBottom: 8 }}
          />
          <Button type="primary" onClick={handleSubmit} loading={submitting}>
            提交任务
          </Button>
        </div>
      )}

      {/* 已完成任务可追加交接备注 */}
      {task.status === 'completed' && user.id === (task.assigned_to || task.created_by) && (
        <div style={{ marginBottom: 20, padding: '16px', background: '#f6ffed', borderRadius: 8 }}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>📝 交接备注</p>
          <TextArea
            rows={3}
            value={handoverNote}
            onChange={(e) => setHandoverNote(e.target.value)}
            placeholder="补充交接备注，帮助后继者了解情况"
            maxLength={1000}
            style={{ marginBottom: 8 }}
          />
          <Button onClick={handleSaveHandover}>保存交接备注</Button>
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
                        <Button type="link" size="small" style={{ color: '#27ae60' }}>通过</Button>
                      </Popconfirm>,
                      <Popconfirm
                        key="reject"
                        title="确认打回？"
                        onConfirm={() => handleReview(sub.id, false)}
                        okText="打回"
                        cancelText="取消"
                      >
                        <Button type="link" size="small" danger>打回</Button>
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
