import { useState, useEffect } from 'react';
import { Progress, Tag, Checkbox, Button, message, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { hasMinRole } from '../../utils/helpers';
import { fetchMilestones, updateMilestoneStatus, deleteMilestone } from './taskService';
import type { TaskMilestone } from './taskService';
import styles from './tasks.module.css';

interface MilestonePanelProps {
  taskId: string;
  userId: string;
  userRole: string;
  readonly?: boolean;
}

/** 计算里程碑状态 */
function getMilestoneStatus(m: TaskMilestone): 'done' | 'warning' | 'danger' | 'normal' {
  if (m.status === 'completed') return 'done';
  if (!m.deadline) return 'normal';
  const now = dayjs();
  const deadline = dayjs(m.deadline);
  if (deadline.isBefore(now)) return 'danger';
  if (deadline.diff(now, 'hour') < 72) return 'warning';
  return 'normal';
}

export default function MilestonePanel({ taskId, userId, userRole, readonly }: MilestonePanelProps) {
  const [milestones, setMilestones] = useState<TaskMilestone[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await fetchMilestones(taskId);
    setMilestones(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [taskId]);

  const handleToggle = async (m: TaskMilestone) => {
    const newStatus = m.status === 'completed' ? 'pending' : 'completed';
    const ok = await updateMilestoneStatus(m.id, newStatus, userId);
    if (ok) {
      message.success(newStatus === 'completed' ? '已完成' : '已取消完成');
      load();
    } else {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteMilestone(id);
    if (ok) {
      message.success('已删除');
      load();
    } else {
      message.error('删除失败');
    }
  };

  const canEdit = hasMinRole(userRole, 'dept_head') && !readonly;

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center', color: '#95a5a6' }}>加载里程碑...</div>;
  }

  if (milestones.length === 0) {
    return (
      <div className={styles.milestonePanel}>
        <p style={{ fontWeight: 500, marginBottom: 8 }}>✅ 里程碑进度</p>
        <p style={{ color: '#95a5a6', fontSize: 13 }}>暂无里程碑</p>
      </div>
    );
  }

  const completed = milestones.filter((m) => m.status === 'completed').length;
  const progressPercent = Math.round((completed / milestones.length) * 100);

  const statusConfig: Record<string, { color: string; label: string }> = {
    done: { color: '#27ae60', label: '已完成' },
    warning: { color: '#e67e22', label: '临近截止' },
    danger: { color: '#e74c3c', label: '已逾期' },
    normal: { color: '#95a5a6', label: '待完成' },
  };

  return (
    <div className={styles.milestonePanel}>
      <div className={styles.milestoneHeader}>
        <p style={{ fontWeight: 500, margin: 0 }}>✅ 里程碑进度</p>
        <span style={{ fontSize: 13, color: '#95a5a6' }}>{completed}/{milestones.length} 完成</span>
      </div>
      <Progress percent={progressPercent} size="small" style={{ marginBottom: 12 }} />
      {milestones.map((m) => {
        const mStatus = getMilestoneStatus(m);
        const cfg = statusConfig[mStatus];
        return (
          <div
            key={m.id}
            className={`${styles.milestoneItem} ${mStatus === 'danger' ? styles.milestoneDanger : ''} ${mStatus === 'warning' ? styles.milestoneWarning : ''}`}
          >
            <Checkbox
              checked={m.status === 'completed'}
              onChange={() => handleToggle(m)}
            >
              <span style={m.status === 'completed' ? { textDecoration: 'line-through', color: '#95a5a6' } : {}}>
                {m.title}
              </span>
            </Checkbox>
            <div className={styles.milestoneMeta}>
              {m.deadline && (
                <Tag color={cfg.color} style={{ fontSize: 11 }}>{cfg.label} · {dayjs(m.deadline).format('MM/DD HH:mm')}</Tag>
              )}
              {m.completer_name && <span style={{ fontSize: 11, color: '#95a5a6' }}>完成人: {m.completer_name}</span>}
            </div>
            {canEdit && (
              <Popconfirm title="删除该里程碑？" onConfirm={() => handleDelete(m.id)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </div>
        );
      })}
    </div>
  );
}
