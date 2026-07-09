import { useDraggable } from '@dnd-kit/core';
import { Tag } from 'antd';
import { ClockCircleOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { formatDateTime, getDepartmentLabel } from '../../utils/helpers';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../utils/constants';
import type { Task } from './taskService';
import styles from './kanban.module.css';

interface KanbanCardProps {
  task: Task;
  onClick: () => void;
}

export default function KanbanCard({ task, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const priority = TASK_PRIORITIES[task.priority] ?? TASK_PRIORITIES.normal;
  const status = TASK_STATUSES[task.status] ?? TASK_STATUSES.pending;

  const style = transform ? {
    transform: `translate(${transform.x}px, ${transform.y}px)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
    >
      <div className={styles.cardPriorityBar} style={{ background: priority.color }} />
      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>{task.title}</div>
        <div className={styles.cardMeta}>
          <Tag color={priority.color} style={{ fontSize: 11, margin: 0 }}>{priority.label}</Tag>
          <Tag color={status.color} style={{ fontSize: 11, margin: 0 }}>{status.label}</Tag>
        </div>
        <div className={styles.cardFooter}>
          {task.assignee_name ? (
            <span className={styles.cardFooterItem}>
              <UserOutlined /> {task.assignee_name}
            </span>
          ) : (
            <span className={styles.cardFooterItem}>
              <TeamOutlined /> {getDepartmentLabel(task.assigned_department)}
            </span>
          )}
          <span className={styles.cardFooterItem}>
            <ClockCircleOutlined /> {task.deadline ? formatDateTime(task.deadline) : '暂无截止'}
          </span>
        </div>
      </div>
    </div>
  );
}
