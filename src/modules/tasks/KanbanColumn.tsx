import { useDroppable } from '@dnd-kit/core';
import type { Task } from './taskService';
import KanbanCard from './KanbanCard';
import styles from './kanban.module.css';

interface KanbanColumnProps {
  status: string;
  title: string;
  color: string;
  tasks: Task[];
  count: number;
  onTaskClick: (task: Task) => void;
}

export default function KanbanColumn({ status, title, color, tasks, count, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.column} ${isOver ? styles.columnOver : ''}`}
    >
      <div className={styles.columnHeader}>
        <span className={styles.columnDot} style={{ background: color }} />
        <span className={styles.columnTitle}>{title}</span>
        <span className={styles.columnCount}>{count}</span>
      </div>
      <div className={styles.columnBody}>
        {tasks.length === 0 ? (
          <div className={styles.columnEmpty}>拖拽任务到此处</div>
        ) : (
          tasks.map((task) => (
            <KanbanCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))
        )}
      </div>
    </div>
  );
}
