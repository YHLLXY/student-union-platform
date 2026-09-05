import { useState, useMemo, useEffect } from 'react';
import { Card, Tag, Tabs, Button, Modal, Segmented, message, Grid, Input, Select, Row, Col, theme } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusOutlined, ClockCircleOutlined, TeamOutlined, UserOutlined, FileTextOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/components/AuthContext';
import { ListSkeleton } from '@/components/SkeletonBlocks';
import { EmptyState } from '@/components/common';
import { hasMinRole, formatDateTime, getDepartmentLabel } from '@/utils/helpers';
import { TASK_PRIORITIES, TASK_STATUSES, DEPARTMENTS } from '@/utils/constants';
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
  const { token } = theme.useToken();
  const user = useAuth();
  const { md } = Grid.useBreakpoint();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const memberFilter = searchParams.get('member') ?? '';
  const [filter, setFilter] = useState('all');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [searchText, setSearchText] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  // 任务列表 + 逾期里程碑计数（同一查询内完成，避免额外 loading 态）
  const tasksQuery = useQuery({
    queryKey: ['tasks', user.id, user.department, user.role],
    queryFn: async () => {
      const data = await fetchTasks(user.id, user.department, user.role);
      const milestoneTasks = data.filter((t) => t.has_milestones);
      const map: Record<string, number> = {};
      await Promise.all(
        milestoneTasks.map(async (t) => {
          const count = await fetchTaskOverdueMilestones(t.id).catch(() => 0);
          if (count > 0) map[t.id] = count;
        }),
      );
      return { tasks: data, overdueMap: map };
    },
  });

  const tasks = tasksQuery.data?.tasks ?? [];
  const overdueMilestoneMap = tasksQuery.data?.overdueMap ?? {};

  // Realtime：任务表变更 → 失效缓存自动重取
  useEffect(() => {
    const unsubscribe = subscribeToTasks(user.department, () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });
    return unsubscribe;
  }, [user.department, queryClient]);

  const handleTaskMove = async (taskId: string, newStatus: string) => {
    // 乐观更新：立即移动卡片到新列
    queryClient.setQueryData<{ tasks: Task[]; overdueMap: Record<string, number> }>(
      ['tasks', user.id, user.department, user.role],
      (old) =>
        old
          ? { ...old, tasks: old.tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)) }
          : old,
    );
    // 服务端同步
    const ok = await updateTaskStatus(taskId, newStatus);
    if (!ok) {
      message.error('状态更新失败');
      // 回滚：从服务端重新拉取
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });

  const filteredTasks = useMemo(() => {
    let result = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
    if (memberFilter) {
      result = result.filter((t) =>
        t.assigned_to === memberFilter || t.created_by === memberFilter);
    }
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(kw));
    }
    if (priorityFilter !== 'all') result = result.filter((t) => t.priority === priorityFilter);
    if (deptFilter !== 'all') result = result.filter((t) => t.assigned_department === deptFilter);
    return result;
  }, [filter, memberFilter, tasks, searchText, priorityFilter, deptFilter]);

  const canCreate = hasMinRole(user.role, 'dept_head');

  const handleReset = () => {
    setFilter('all');
    setSearchText('');
    setPriorityFilter('all');
    setDeptFilter('all');
  };

  if (tasksQuery.isPending) {
    return <ListSkeleton />;
  }

  if (tasksQuery.isError) {
    return (
      <div style={{ paddingTop: 80 }}>
        <EmptyState
          icon={<ReloadOutlined />}
          title="任务加载失败"
          description="网络异常或服务暂时不可用，请稍后重试"
          action={
            <Button type="primary" onClick={() => tasksQuery.refetch()}>
              重新加载
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>
          任务管理
          {memberFilter && <span style={{ fontSize: 14, fontWeight: 400, color: token.colorTextSecondary, marginLeft: 8 }}>（已筛选成员）</span>}
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Segmented
            options={[
              { label: '列表', value: 'list' },
              { label: '看板', value: 'kanban' },
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
          {/* 搜索筛选栏 */}
          <Row gutter={[12, 8]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Input
                placeholder="搜索任务标题..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={12} md={6}>
              <Select
                value={priorityFilter}
                onChange={setPriorityFilter}
                style={{ width: '100%' }}
                options={[
                  { value: 'all', label: '全部优先级' },
                  ...Object.entries(TASK_PRIORITIES).map(([key, p]) => ({ value: key, label: p.label })),
                ]}
              />
            </Col>
            {hasMinRole(user.role, 'president') && (
              <Col xs={12} md={6}>
                <Select
                  value={deptFilter}
                  onChange={setDeptFilter}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'all', label: '全部部门' },
                    ...Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label })),
                  ]}
                />
              </Col>
            )}
            <Col xs={24} md={4}>
              <Button icon={<ReloadOutlined />} onClick={handleReset} block={!md}>
                重置
              </Button>
            </Col>
          </Row>

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

          {filteredTasks.length === 0 ? (
            <EmptyState
              icon={<SearchOutlined />}
              title={memberFilter ? '该成员暂无任务' : '暂无任务'}
              description={canCreate ? '点击右上角「发布任务」创建第一条任务' : '有新任务时会出现在这里'}
              className={styles.emptyState}
            />
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
                        {overdueMilestoneMap[task.id]} 项逾期
                      </Tag>
                    )}
                    {task.collaborating_departments && task.collaborating_departments.length > 0 &&
                      task.collaborating_departments.map((d) => (
                        <Tag key={d} color="blue" style={{ fontSize: 11 }}>协同 · {getDepartmentLabel(d)}</Tag>
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
          {tasks.length === 0 ? (
            <EmptyState icon={<FileTextOutlined />} title="暂无任务" />
          ) : (
            <KanbanBoard
              tasks={tasks}
              onTaskClick={setDetailTask}
              onTaskMove={handleTaskMove}
            />
          )}
        </div>
      )}

      <Modal open={!!detailTask} onCancel={() => setDetailTask(null)} footer={null} width={md ? 700 : undefined} destroyOnHidden>
        {detailTask && (
          <TaskDetail task={detailTask} user={user} onUpdate={refresh} onClose={() => setDetailTask(null)} />
        )}
      </Modal>

      <Modal open={showForm} onCancel={() => setShowForm(false)} footer={null} width={md ? 600 : undefined} destroyOnHidden>
        <TaskForm
          onSuccess={() => { setShowForm(false); refresh(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>

      <TaskTemplateManage open={showTemplates} onClose={() => setShowTemplates(false)} />
    </div>
  );
}
