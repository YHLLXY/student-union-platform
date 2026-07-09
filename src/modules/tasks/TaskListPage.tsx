import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Tag, Tabs, Button, Spin, Modal, Empty, Segmented, message } from 'antd';
import { PlusOutlined, ClockCircleOutlined, TeamOutlined, UserOutlined, FileTextOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole, formatDateTime, getDepartmentLabel } from '../../utils/helpers';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../utils/constants';
import { fetchTasks, subscribeToTasks, fetchTaskOverdueMilestones, updateTaskStatus } from './taskService';
import type { Task } from './taskService';
import TaskDetail from './TaskDetail';
import TaskForm from './TaskForm';
import TaskTemplateManage from './TaskTemplateManage';
import KanbanBoard from './KanbanBoard';
import styles from './tasks.module.css';

const priorityBorderClass: Record<string, string> = {
  urgent: styles.taskCardUrgent,
  important: styles.taskCardImportant,
  normal: styles.taskCardNormal,
};

export default function TaskListPage() {
  const user = useAuth();
  const [searchParams] = useSearchParams();
  const memberFilter = searchParams.get('member') ?? '';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [overdueMilestoneMap, setOverdueMilestoneMap] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const handleTaskMove = async (taskId: string, newStatus: string) => {
    // 乐观更新：立即移动卡片到新列
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    // 服务端同步
    const ok = await updateTaskStatus(taskId, newStatus);
    if (!ok) {
      message.error('状态更新失败');
      loadTasks(); // 回滚：从服务端重新拉取
    }
  };

  const loadTasks = useCallback(async () => {
    const data = await fetchTasks(user.id, user.department, user.role);
    setTasks(data);
    // 批量查询里程碑逾期数
    const milestoneTasks = data.filter((t) => t.has_milestones);
    if (milestoneTasks.length > 0) {
      const map: Record<string, number> = {};
      await Promise.all(
        milestoneTasks.map(async (t) => {
          const count = await fetchTaskOverdueMilestones(t.id);
          if (count > 0) map[t.id] = count;
        }),
      );
      setOverdueMilestoneMap(map);
    } else {
      setOverdueMilestoneMap({});
    }
    setLoading(false);
  }, [user.id, user.department, user.role]);

  useEffect(() => {
    loadTasks();
    const unsubscribe = subscribeToTasks(user.department, () => { loadTasks(); });
    return unsubscribe;
  }, [loadTasks, user.department]);

  const filteredTasks = useMemo(() => {
    let result = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
    if (memberFilter) {
      result = result.filter((t) =>
        t.assigned_to === memberFilter || t.created_by === memberFilter);
    }
    return result;
  }, [filter, memberFilter, tasks]);

  const canCreate = hasMinRole(user.role, 'dept_head');

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>
          📋 任务管理
          {memberFilter && <span style={{ fontSize: 14, fontWeight: 400, color: '#7f8c8d', marginLeft: 8 }}>（已筛选成员）</span>}
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Segmented
            options={[
              { label: '📋 列表', value: 'list' },
              { label: '📌 看板', value: 'kanban' },
            ]}
            value={viewMode}
            onChange={(val) => setViewMode(val as 'list' | 'kanban')}
          />
          {canCreate && (
            <>
              <Button icon={<FileTextOutlined />} onClick={() => setShowTemplates(true)}>
                模板管理
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
                发布任务
              </Button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
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
            <Empty description={memberFilter ? '该成员暂无任务' : '暂无任务'} className={styles.emptyState} />
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
                    <Tag color={status.color}>{status.label}</Tag>
                    {overdueMilestoneMap[task.id] > 0 && (
                      <Tag color="red" style={{ fontSize: 11 }}>
                        ⚠️ {overdueMilestoneMap[task.id]} 项逾期
                      </Tag>
                    )}
                    {task.collaborating_departments && task.collaborating_departments.length > 0 &&
                      task.collaborating_departments.map((d) => (
                        <Tag key={d} color="blue" style={{ fontSize: 11 }}>🤝 {getDepartmentLabel(d)}</Tag>
                      ))
                    }
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
                    <span className={styles.cardMetaItem}>发布者: {task.creator_name}</span>
                  </div>
                </Card>
              );
            })
          )}
        </>
      ) : (
        <div style={{ minHeight: 400 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
          ) : tasks.length === 0 ? (
            <Empty description="暂无任务" />
          ) : (
            <KanbanBoard
              tasks={tasks}
              onTaskClick={setDetailTask}
              onTaskMove={handleTaskMove}
            />
          )}
        </div>
      )}

      <Modal open={!!detailTask} onCancel={() => setDetailTask(null)} footer={null} width={700} destroyOnClose>
        {detailTask && (
          <TaskDetail task={detailTask} user={user} onUpdate={loadTasks} onClose={() => setDetailTask(null)} />
        )}
      </Modal>

      <Modal open={showForm} onCancel={() => setShowForm(false)} footer={null} width={600} destroyOnClose>
        <TaskForm
          onSuccess={() => { setShowForm(false); loadTasks(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>

      <TaskTemplateManage open={showTemplates} onClose={() => setShowTemplates(false)} />
    </div>
  );
}
