import { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { Task } from './taskService';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import styles from './kanban.module.css';

interface KanbanBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onTaskMove: (taskId: string, newStatus: string) => void;
}

const COLUMNS = [
  { status: 'pending', title: '待开始', color: '#95a5a6' },
  { status: 'in_progress', title: '进行中', color: '#3498db' },
  { status: 'review', title: '待审核', color: '#e67e22' },
  { status: 'completed', title: '已完成', color: '#27ae60' },
];

export default function KanbanBoard({ tasks, onTaskClick, onTaskMove }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const tasksByStatus = (status: string) =>
    tasks.filter((t) => t.status === status);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    onTaskMove(taskId, newStatus);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={styles.board}>
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus(col.status);
          return (
            <KanbanColumn
              key={col.status}
              status={col.status}
              title={col.title}
              color={col.color}
              tasks={colTasks}
              count={colTasks.length}
              onTaskClick={onTaskClick}
            />
          );
        })}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className={styles.dragOverlay}>
            <KanbanCard task={activeTask} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
