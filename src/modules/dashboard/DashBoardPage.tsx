import { useState, useEffect, useCallback } from 'react';
import { Card, Modal, List, Tag, Grid, Button, Result, message, theme } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  PushpinOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { DashboardSkeleton } from '@/components/SkeletonBlocks';
import { StaggerGroup, StaggerItem, CountUpNumber } from '@/components/motion';
import { hasMinRole, formatDateTime, getDepartmentLabel } from '@/utils/helpers';
import { TASK_STATUSES } from '@/utils/constants';
import { fetchDashboardStats, fetchRecentActivity, fetchDashboardReviewTasks } from './dashboardService';
import type { DashboardStats, ActivityItem } from './dashboardService';
import WeeklyBriefCard from './WeeklyBriefCard';
import styles from './dashboard.module.css';

const TYPE_ICON: Record<string, string> = {
  notice: '📢',
  forum: '💬',
  submission: '📤',
};

export default function DashBoardPage() {
  const { token } = theme.useToken();
  const user = useAuth();
  const { md } = Grid.useBreakpoint();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({ reviewTasks: 0, overdueTasks: 0, todayDeadline: 0 });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [error, setError] = useState(false);
  const [reviewTasks, setReviewTasks] = useState<{ id: string; title: string; deadline: string | null }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [s, a] = await Promise.all([
        fetchDashboardStats(user.id, user.department, user.role),
        fetchRecentActivity(user.id, user.department),
      ]);
      setStats(s);
      setActivities(a);
    } catch (e) {
      console.error('仪表盘数据加载失败:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user.id, user.department, user.role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReviewClick = async () => {
    try {
      const tasks = await fetchDashboardReviewTasks(user.department, user.role);
      setReviewTasks(tasks);
      setReviewModalOpen(true);
    } catch {
      message.error('获取待审核任务失败，请稍后重试');
    }
  };

  const canCreateTask = hasMinRole(user.role, 'dept_head');
  const canCreateNotice = hasMinRole(user.role, 'dept_head');

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
            <Button type="primary" onClick={loadData}>
              重新加载
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* 欢迎语 */}
      <h1 className={styles.welcome}>👋 你好，{user.name}</h1>
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
        {canCreateNotice && (
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
          <Card
            className={styles.statCard}
            onClick={handleReviewClick}
            styles={{ body: { padding: 20 } }}
          >
            <div className={styles.statIcon} style={{ color: token.colorWarning }}>
              <ClockCircleOutlined />
            </div>
            <div className={`${styles.statValue} ${stats.reviewTasks === 0 ? styles.statZero : ''}`} style={{ color: token.colorWarning }}>
              <CountUpNumber value={stats.reviewTasks} />
            </div>
            <div className={styles.statLabel}>待审核任务</div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card
            className={styles.statCard}
            onClick={() => navigate('/tasks')}
            styles={{ body: { padding: 20 } }}
          >
            <div className={styles.statIcon} style={{ color: token.colorError }}>
              <ExclamationCircleOutlined />
            </div>
            <div className={`${styles.statValue} ${stats.overdueTasks === 0 ? styles.statZero : ''}`} style={{ color: token.colorError }}>
              <CountUpNumber value={stats.overdueTasks} />
            </div>
            <div className={styles.statLabel}>已逾期任务</div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card
            className={styles.statCard}
            onClick={() => navigate('/tasks')}
            styles={{ body: { padding: 20 } }}
          >
            <div className={styles.statIcon} style={{ color: token.colorInfo }}>
              <CheckCircleOutlined />
            </div>
            <div className={`${styles.statValue} ${stats.todayDeadline === 0 ? styles.statZero : ''}`} style={{ color: token.colorInfo }}>
              <CountUpNumber value={stats.todayDeadline} />
            </div>
            <div className={styles.statLabel}>今日截止</div>
          </Card>
        </StaggerItem>
      </StaggerGroup>

      {/* 最近动态 */}
      <Card className={styles.activityCard}>
        <div className={styles.activityTitle}>📌 最近动态</div>
        {activities.length === 0 ? (
          <div className={styles.timelineEmpty}>暂无最近动态</div>
        ) : (
          <div className={styles.timeline}>
            {activities.map((item, i) => (
              <div
                key={`${item.type}-${i}`}
                className={styles.timelineItem}
                onClick={() => navigate(item.link)}
                style={{ cursor: 'pointer' }}
              >
                <span className={styles.timelineIcon}>{TYPE_ICON[item.type] ?? '📌'}</span>
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

      <WeeklyBriefCard />

      {/* 待审核任务弹窗 */}
      <Modal
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        footer={null}
        title="🔍 待审核任务"
        width={md ? 500 : undefined}
        destroyOnHidden
      >
        {reviewTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: token.colorTextQuaternary }}>暂无待审核任务</div>
        ) : (
          <List
            dataSource={reviewTasks}
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
