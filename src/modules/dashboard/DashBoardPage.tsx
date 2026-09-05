import { useState } from 'react';
import { Card, Modal, List, Tag, Grid, Button, Result, theme } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  PushpinOutlined,
  MessageOutlined,
  NotificationOutlined,
  FireOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { DashboardSkeleton } from '@/components/SkeletonBlocks';
import { StatCard, EmptyState } from '@/components/common';
import { StaggerGroup, StaggerItem, FadeIn } from '@/components/motion';
import { hasMinRole, formatDateTime, getDepartmentLabel } from '@/utils/helpers';
import { TASK_STATUSES } from '@/utils/constants';
import {
  fetchDashboardStats,
  fetchRecentActivity,
  fetchDashboardReviewTasks,
  fetchTodoTasks,
} from './dashboardService';
import WeeklyBriefCard from './WeeklyBriefCard';
import styles from './dashboard.module.css';

const TYPE_ICON = {
  notice: <NotificationOutlined />,
  forum: <MessageOutlined />,
  submission: <FireOutlined />,
} as const;

export default function DashBoardPage() {
  const { token } = theme.useToken();
  const user = useAuth();
  const { md } = Grid.useBreakpoint();
  const navigate = useNavigate();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats', user.id, user.department, user.role],
    queryFn: () => fetchDashboardStats(user.id, user.department, user.role),
  });
  const todosQuery = useQuery({
    queryKey: ['dashboard', 'todos', user.department, user.role],
    queryFn: () => fetchTodoTasks(user.department, user.role),
  });
  const activityQuery = useQuery({
    queryKey: ['dashboard', 'activity', user.id, user.department],
    queryFn: () => fetchRecentActivity(user.id, user.department),
  });

  // 待审核弹窗数据：仅在弹窗打开时拉取
  const reviewListQuery = useQuery({
    queryKey: ['dashboard', 'reviewList', user.department, user.role],
    queryFn: () => fetchDashboardReviewTasks(user.department, user.role),
    enabled: reviewModalOpen,
  });

  const loading = statsQuery.isPending || activityQuery.isPending || todosQuery.isPending;
  const error = statsQuery.isError || activityQuery.isError || todosQuery.isError;

  const reloadAll = () => {
    statsQuery.refetch();
    todosQuery.refetch();
    activityQuery.refetch();
  };

  const canCreateTask = hasMinRole(user.role, 'dept_head');

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div style={{ paddingTop: 80 }}>
        <Result
          status="warning"
          title="数据加载失败"
          subTitle="网络异常或服务暂时不可用，请稍后重试"
          extra={
            <Button type="primary" onClick={reloadAll}>
              重新加载
            </Button>
          }
        />
      </div>
    );
  }

  const stats = statsQuery.data ?? { reviewTasks: 0, overdueTasks: 0, todayDeadline: 0 };
  const todos = todosQuery.data ?? [];
  const activities = activityQuery.data ?? [];

  return (
    <div className={styles.page}>
      {/* 欢迎语 */}
      <h1 className={styles.welcome}>你好，{user.name}</h1>
      <p className={styles.welcomeSub}>
        {getDepartmentLabel(user.department)} · {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      {/* 快捷入口 */}
      <StaggerGroup className={styles.quickActions} stagger={0.05}>
        {canCreateTask && (
          <StaggerItem>
            <Card
              className={`${styles.statCard} ${styles.quickBtn}`}
              onClick={() => navigate('/tasks')}
              styles={{ body: { padding: '14px 16px' } }}
            >
              <PlusOutlined style={{ marginRight: 6 }} />
              发布任务
            </Card>
          </StaggerItem>
        )}
        {canCreateTask && (
          <StaggerItem>
            <Card
              className={`${styles.statCard} ${styles.quickBtn}`}
              onClick={() => navigate('/notices')}
              styles={{ body: { padding: '14px 16px' } }}
            >
              <PushpinOutlined style={{ marginRight: 6 }} />
              发布公告
            </Card>
          </StaggerItem>
        )}
        <StaggerItem>
          <Card
            className={`${styles.statCard} ${styles.quickBtn}`}
            onClick={() => navigate('/forum')}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <MessageOutlined style={{ marginRight: 6 }} />
            部门论坛
          </Card>
        </StaggerItem>
      </StaggerGroup>

      {/* 3 张统计卡片 */}
      <StaggerGroup className={styles.statsRow} stagger={0.06}>
        <StaggerItem>
          <StatCard
            icon={<ClockCircleOutlined />}
            label="待审核任务"
            value={stats.reviewTasks}
            color={token.colorWarning}
            onClick={canCreateTask ? () => setReviewModalOpen(true) : undefined}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            icon={<ExclamationCircleOutlined />}
            label="已逾期任务"
            value={stats.overdueTasks}
            color={token.colorError}
            onClick={() => navigate('/tasks')}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            icon={<CheckCircleOutlined />}
            label="今日截止"
            value={stats.todayDeadline}
            color={token.colorInfo}
            onClick={() => navigate('/tasks')}
          />
        </StaggerItem>
      </StaggerGroup>

      {/* 主体两栏：待办+动态 / 周简报 */}
      <div className={styles.mainGrid}>
        <div className={styles.mainCol}>
          {/* 待办聚合 */}
          <FadeIn>
            <Card
              className={styles.activityCard}
              title="待办事项"
              extra={
                <Button
                  type="link"
                  size="small"
                  icon={<ArrowRightOutlined />}
                  onClick={() => navigate('/tasks')}
                >
                  全部任务
                </Button>
              }
            >
              {todos.length === 0 ? (
                <EmptyState
                  compact
                  icon={<CheckCircleOutlined />}
                  title="暂无待办"
                  description="任务尽在掌控，去看看最近的动态吧"
                />
              ) : (
                <div className={styles.todoList}>
                  {todos.map((t) => (
                    <div
                      key={t.id}
                      className={styles.todoItem}
                      onClick={() => navigate('/tasks')}
                    >
                      <Tag
                        color={t.kind === 'overdue' ? 'red' : 'orange'}
                        className={styles.todoTag}
                      >
                        {t.kind === 'overdue' ? '已逾期' : '待审核'}
                      </Tag>
                      <div className={styles.todoBody}>
                        <div className={styles.todoTitle}>{t.title}</div>
                        <div className={styles.todoMeta}>
                          {t.assignee_name ? `${t.assignee_name} · ` : ''}
                          {t.deadline ? `截止 ${formatDateTime(t.deadline)}` : '无截止时间'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </FadeIn>

          {/* 最近动态 */}
          <FadeIn delay={0.05}>
            <Card className={styles.activityCard} title="最近动态">
              {activities.length === 0 ? (
                <EmptyState
                  compact
                  icon={<NotificationOutlined />}
                  title="暂无最近动态"
                  description="公告、帖子与任务动态会出现在这里"
                />
              ) : (
                <div className={styles.timeline}>
                  {activities.map((item, i) => (
                    <div
                      key={`${item.type}-${i}`}
                      className={styles.timelineItem}
                      onClick={() => navigate(item.link)}
                    >
                      <span className={styles.timelineIcon}>{TYPE_ICON[item.type]}</span>
                      <div className={styles.timelineBody}>
                        <div className={styles.timelineTitle}>{item.title}</div>
                        <div className={styles.timelineDesc}>{item.description}</div>
                      </div>
                      <span className={styles.timelineTime}>{formatDateTime(item.time)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </FadeIn>
        </div>

        <div className={styles.sideCol}>
          <WeeklyBriefCard />
        </div>
      </div>

      {/* 待审核任务弹窗 */}
      <Modal
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        footer={null}
        title="待审核任务"
        width={md ? 500 : undefined}
        destroyOnHidden
      >
        {reviewListQuery.isPending ? (
          <div style={{ textAlign: 'center', padding: 24, color: token.colorTextQuaternary }}>加载中…</div>
        ) : reviewListQuery.isError ? (
          <Result
            status="warning"
            title="获取失败"
            extra={<Button onClick={() => reviewListQuery.refetch()}>重试</Button>}
          />
        ) : (reviewListQuery.data ?? []).length === 0 ? (
          <EmptyState compact icon={<CheckCircleOutlined />} title="暂无待审核任务" />
        ) : (
          <List
            dataSource={reviewListQuery.data ?? []}
            renderItem={(t) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => { setReviewModalOpen(false); navigate('/tasks'); }}
              >
                <List.Item.Meta
                  title={t.title}
                  description={
                    t.deadline
                      ? `截止：${formatDateTime(t.deadline)}`
                      : '无截止时间'
                  }
                />
                <Tag color="orange">{TASK_STATUSES.review?.label ?? '待审核'}</Tag>
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  );
}
