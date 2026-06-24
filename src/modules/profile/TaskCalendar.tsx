import { useState } from 'react';
import { Calendar, Badge, Popover } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useAuth } from '../../components/AuthContext';
import { fetchUserTasksByMonth } from './profileService';
import { TASK_STATUSES } from '../../utils/constants';
import styles from './profile.module.css';

interface TaskItem {
  id: string;
  title: string;
  status: string;
  deadline: string;
}

export default function TaskCalendar() {
  const user = useAuth();
  const [taskMap, setTaskMap] = useState<Record<string, TaskItem[]>>({});

  const onPanelChange = async (date: Dayjs) => {
    const tasks = await fetchUserTasksByMonth(user.id, date.year(), date.month() + 1);
    const map: Record<string, TaskItem[]> = {};
    for (const t of tasks) {
      const key = dayjs(t.deadline).format('YYYY-MM-DD');
      if (!map[key]) map[key] = [];
      map[key].push(t as TaskItem);
    }
    setTaskMap(map);
  };

  const dateCellRender = (date: Dayjs) => {
    const key = date.format('YYYY-MM-DD');
    const tasks = taskMap[key];
    if (!tasks || tasks.length === 0) return null;

    const content = (
      <div className={styles.taskPopover}>
        {tasks.map((t) => {
          const status = TASK_STATUSES[t.status] ?? TASK_STATUSES.pending;
          return (
            <div key={t.id} className={styles.taskPopoverItem}>
              <Badge color={status.color} text={t.title} />
            </div>
          );
        })}
      </div>
    );

    return (
      <Popover content={content} title="当日任务" trigger="click">
        <div className={styles.calendarCell}>
          {tasks.map((t) => (
            <span key={t.id} className={styles.calendarDot} />
          ))}
        </div>
      </Popover>
    );
  };

  return (
    <Calendar
      cellRender={dateCellRender}
      onPanelChange={onPanelChange}
    />
  );
}
