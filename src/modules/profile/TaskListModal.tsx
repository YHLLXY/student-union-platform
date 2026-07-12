import { useState, useEffect } from 'react';
import { Modal, Tabs, Tag, Empty, Spin, Grid } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { fetchAllUserTasks } from './profileService';
import type { TaskBrief } from './profileService';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../utils/constants';
import { getDepartmentLabel, formatDateTime } from '../../utils/helpers';
import styles from './profile.module.css';

interface TaskListModalProps {
  open: boolean;
  initialTab: string; // 'completed' | 'pending' | 'overdue'
  userId: string;
  onClose: () => void;
}

export default function TaskListModal({ open, initialTab, userId, onClose }: TaskListModalProps) {
  const { md } = Grid.useBreakpoint();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState<TaskBrief[]>([]);
  const [pending, setPending] = useState<TaskBrief[]>([]);
  const [overdue, setOverdue] = useState<TaskBrief[]>([]);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setLoading(true);
      fetchAllUserTasks(userId).then((data) => {
        setCompleted(data.completed);
        setPending(data.pending);
        setOverdue(data.overdue);
        setLoading(false);
      });
    }
  }, [open, initialTab, userId]);

  const getCurrentList = () => {
    switch (activeTab) {
      case 'completed': return completed;
      case 'pending': return pending;
      case 'overdue': return overdue;
      default: return [];
    }
  };

  const priorityBorderClass: Record<string, string> = {
    urgent: styles.taskModalItemUrgent,
    important: styles.taskModalItemImportant,
    normal: styles.taskModalItemNormal,
  };

  const renderTaskItem = (task: TaskBrief) => {
    const priority = TASK_PRIORITIES[task.priority] ?? TASK_PRIORITIES.normal;
    const status = TASK_STATUSES[task.status] ?? TASK_STATUSES.pending;
    const borderCls = priorityBorderClass[task.priority] ?? styles.taskModalItemNormal;

    return (
      <div key={task.id} className={`${styles.taskModalItem} ${borderCls}`}>
        <div className={styles.taskModalTitle}>{task.title}</div>
        <div className={styles.taskModalMeta}>
          <Tag color={priority.color} style={{ fontSize: 11 }}>{priority.label}</Tag>
          <Tag color={status.color} style={{ fontSize: 11 }}>{status.label}</Tag>
          <span className={styles.taskModalDate}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {task.deadline ? formatDateTime(task.deadline) : '暂无截止'}
          </span>
          <Tag color="blue" style={{ fontSize: 11 }}>{getDepartmentLabel(task.assigned_department)}</Tag>
        </div>
      </div>
    );
  };

  const currentList = getCurrentList();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={md ? 640 : undefined}
      title="📋 我的任务"
      destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'completed', label: `已完成 (${completed.length})` },
          { key: 'pending', label: `待完成 (${pending.length})` },
          { key: 'overdue', label: `已逾期 (${overdue.length})` },
        ]}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : currentList.length === 0 ? (
        <Empty
          description={
            activeTab === 'completed' ? '暂无已完成任务' :
            activeTab === 'pending' ? '暂无待完成任务' :
            '暂无已逾期任务'
          }
          style={{ padding: 40 }}
        />
      ) : (
        <div className={styles.taskModalList}>
          {currentList.map(renderTaskItem)}
        </div>
      )}
    </Modal>
  );
}
