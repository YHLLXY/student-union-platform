import { useState, useEffect } from 'react';
import { Card, Spin, Modal, List, Tag, Grid } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  PushpinOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole, formatDateTime, getDepartmentLabel } from '../../utils/helpers';
import { TASK_STATUSES } from '../../utils/constants';
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
  const user = useAuth();
  const { md } = Grid.useBreakpoint();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({ reviewTasks: 0, overdueTasks: 0, todayDeadline: 0 });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTasks, setReviewTasks] = useState<{ id: string; title: string; deadline: string | null }[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchDashboardStats(user.id, user.department, user.role),
      fetchRecentActivity(user.id, user.department),
    ]).then(([s, a]) => {
      setStats(s);
      setActivities(a);
      setLoading(false);
    });
  }, [user.id, user.department, user.role]);

  const handleReviewClick = async () => {
    const tasks = await fetchDashboardReviewTasks(user.department, user.role);
    setReviewTasks(tasks);
    setReviewModalOpen(true);
  };

  const canCreateTask = hasMinRole(user.role, 'dept_head');
  const canCreateNotice = hasMinRole(user.role, 'dept_head');

  if (loading) {
    return <div style={{ textAlign: 'center', paddingTop: 120 }}><Spin size="large" /></div>;
  }

  return (
    <div className={styles.page}>
      {/* 欢迎语 */}
      <h1 className={styles.welcome}>👋 你好，{user.name}</h1>
      <p className={styles.welcomeSub}>
        {getDepartmentLabel(user.department)} · {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      {/* 快捷入口 */}
      <div className={styles.quickActions}>
        {canCreateTask && (
          <Card
            className={`${styles.statCard} ${styles.quickBtn}`}
            onClick={() => navigate('/tasks')}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <PlusOutlined style={{ marginRight: 6 }} />
            发布任务
          </Card>
        )}
        {canCreateNotice && (
          <Card
            className={`${styles.statCard} ${styles.quickBtn}`}
            onClick={() => navigate('/notices')}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <PushpinOutlined style={{ marginRight: 6 }} />
            发布公告
          </Card>
        )}
        <Card
          className={`${styles.statCard} ${styles.quickBtn}`}
          onClick={() => navigate('/forum')}
          styles={{ body: { padding: '14px 16px' } }}
        >
          <MessageOutlined style={{ marginRight: 6 }} />
          部门论坛
        </Card>
      </div>

      {/* 3 张统计卡片 */}
      <div className={styles.statsRow}>
        <Card
          className={styles.statCard}
          onClick={handleReviewClick}
          styles={{ body: { padding: 20 } }}
        >
          <div className={styles.statIcon} style={{ color: '#e67e22' }}>
            <ClockCircleOutlined />
          </div>
          <div className={`${styles.statValue} ${stats.reviewTasks === 0 ? styles.statZero : ''}`} style={{ color: '#e67e22' }}>
            {stats.reviewTasks}
          </div>
          <div className={styles.statLabel}>待审核任务</div>
        </Card>

        <Card
          className={styles.statCard}
          onClick={() => navigate('/tasks')}
          styles={{ body: { padding: 20 } }}
        >
          <div className={styles.statIcon} style={{ color: '#e74c3c' }}>
            <ExclamationCircleOutlined />
          </div>
          <div className={`${styles.statValue} ${stats.overdueTasks === 0 ? styles.statZero : ''}`} style={{ color: '#e74c3c' }}>
            {stats.overdueTasks}
          </div>
          <div className={styles.statLabel}>已逾期任务</div>
        </Card>

        <Card
          className={styles.statCard}
          onClick={() => navigate('/tasks')}
          styles={{ body: { padding: 20 } }}
        >
          <div className={styles.statIcon} style={{ color: '#3498db' }}>
            <CheckCircleOutlined />
          </div>
          <div className={`${styles.statValue} ${stats.todayDeadline === 0 ? styles.statZero : ''}`} style={{ color: '#3498db' }}>
            {stats.todayDeadline}
          </div>
          <div className={styles.statLabel}>今日截止</div>
        </Card>
      </div>

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
        destroyOnClose
      >
        {reviewTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#bdc3c7' }}>暂无待审核任务</div>
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
