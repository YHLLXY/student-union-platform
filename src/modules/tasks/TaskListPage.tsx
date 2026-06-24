import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Tabs, Button, Spin, Modal, Empty } from 'antd';
import { PlusOutlined, ClockCircleOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole, formatDateTime, getDepartmentLabel } from '../../utils/helpers';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../utils/constants';
import { fetchTasks, subscribeToTasks } from './taskService';
import type { Task } from './taskService';
import TaskDetail from './TaskDetail';
import TaskForm from './TaskForm';
import styles from './tasks.module.css';

const priorityBorderClass: Record<string, string> = {
  urgent: styles.taskCardUrgent,
  important: styles.taskCardImportant,
  normal: styles.taskCardNormal,
};

export default function TaskListPage() {
  const user = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadTasks = useCallback(async () => {
    const data = await fetchTasks(user.id, user.department, user.role);
    setTasks(data);
    setLoading(false);
  }, [user.id, user.department, user.role]);

  useEffect(() => {
    loadTasks();

    // 实时订阅
    const unsubscribe = subscribeToTasks(user.department, () => {
      loadTasks();
    });

    return unsubscribe;
  }, [loadTasks, user.department]);

  const filteredTasks = filter === 'all'
    ? tasks
    : tasks.filter((t) => t.status === filter);

  const canCreate = hasMinRole(user.role, 'dept_head');

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>📋 任务管理</h2>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
            发布任务
          </Button>
        )}
      </div>

      <Tabs
        activeKey={filter}
        onChange={setFilter}
        className={styles.filterTabs}
        items={[
          { key: 'all', label: '全部' },
          { key: 'pending', label: '待开始' },
          { key: 'in_progress', label: '进行中' },
          { key: 'review', label: '待审核' },
          { key: 'completed', label: '已完成' },
        ]}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : filteredTasks.length === 0 ? (
        <Empty description="暂无任务" className={styles.emptyState} />
      ) : (
        filteredTasks.map((task) => {
          const priority = TASK_PRIORITIES[task.priority] ?? TASK_PRIORITIES.normal;
          const status = TASK_STATUSES[task.status] ?? TASK_STATUSES.pending;
          return (
            <Card
              key={task.id}
              className={`${styles.taskCard} ${priorityBorderClass[task.priority] ?? styles.taskCardNormal}`}
              onClick={() => setDetailTask(task)}
            >
              <div className={styles.cardTitle}>{task.title}</div>
              <div className={styles.cardMeta}>
                <Tag color={priority.color}>{priority.label}</Tag>
                <Tag>{status.label}</Tag>
                <span className={styles.cardMetaItem}>
                  <ClockCircleOutlined /> 截止 {task.deadline ? formatDateTime(task.deadline) : '暂无'}
                </span>
                {task.assignee_name ? (
                  <span className={styles.cardMetaItem}>
                    <UserOutlined /> {task.assignee_name}
                  </span>
                ) : (
                  <span className={styles.cardMetaItem}>
                    <TeamOutlined /> {getDepartmentLabel(task.assigned_department)}
                  </span>
                )}
                <span className={styles.cardMetaItem}>
                  发布者: {task.creator_name}
                </span>
              </div>
            </Card>
          );
        })
      )}

      {/* 任务详情 Modal */}
      <Modal
        open={!!detailTask}
        onCancel={() => setDetailTask(null)}
        footer={null}
        width={700}
        destroyOnClose
      >
        {detailTask && (
          <TaskDetail
            task={detailTask}
            user={user}
            onUpdate={loadTasks}
            onClose={() => setDetailTask(null)}
          />
        )}
      </Modal>

      {/* 发布任务 Modal */}
      <Modal
        open={showForm}
        onCancel={() => setShowForm(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        <TaskForm
          onSuccess={() => {
            setShowForm(false);
            loadTasks();
          }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
