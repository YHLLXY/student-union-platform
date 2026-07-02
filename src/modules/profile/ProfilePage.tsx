import { useState, useEffect } from 'react';
import { Card, Statistic, Descriptions, Button, Modal, message } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { getDepartmentLabel, getRoleLabel } from '../../utils/helpers';
import { fetchUserStats, fetchMilestoneSummary } from './profileService';
import type { UserStats } from './profileService';
import TaskCalendar from './TaskCalendar';
import ChangePassword from './ChangePassword';
import Heatmap from './Heatmap';
import Leaderboard from './Leaderboard';
import MemberDirectory from './MemberDirectory';
import DeptGuide from './DeptGuide';
import styles from './profile.module.css';

export default function ProfilePage() {
  const user = useAuth();
  const [stats, setStats] = useState<UserStats>({ completed: 0, pending: 0, overdue: 0 });
  const [milestoneSummary, setMilestoneSummary] = useState({ milestoneOverdue: 0, milestoneUpcoming: 0 });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchUserStats(user.id).then(setStats);
    fetchMilestoneSummary(user.id).then(setMilestoneSummary);
  }, [user.id]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>👤 个人中心</h2>

      {/* 统计面板 */}
      <div className={styles.statsRow}>
        <Card className={styles.statCard}>
          <Statistic
            title="已完成"
            value={stats.completed}
            prefix={<CheckCircleOutlined style={{ color: '#27ae60' }} />}
            valueStyle={{ color: '#27ae60' }}
          />
        </Card>
        <Card className={styles.statCard}>
          <Statistic
            title="待完成"
            value={stats.pending}
            prefix={<ClockCircleOutlined style={{ color: '#3498db' }} />}
            valueStyle={{ color: '#3498db' }}
          />
        </Card>
        <Card className={styles.statCard}>
          <Statistic
            title="已逾期"
            value={stats.overdue}
            prefix={<ExclamationCircleOutlined style={{ color: '#e74c3c' }} />}
            valueStyle={{ color: '#e74c3c' }}
          />
        </Card>
      </div>

      {(milestoneSummary.milestoneOverdue > 0 || milestoneSummary.milestoneUpcoming > 0) && (
        <div className={styles.statsRow}>
          {milestoneSummary.milestoneOverdue > 0 && (
            <Card className={styles.statCard}>
              <Statistic
                title="⚠️ 里程碑逾期"
                value={milestoneSummary.milestoneOverdue}
                valueStyle={{ color: '#e74c3c' }}
              />
            </Card>
          )}
          {milestoneSummary.milestoneUpcoming > 0 && (
            <Card className={styles.statCard}>
              <Statistic
                title="⏰ 近日截止"
                value={milestoneSummary.milestoneUpcoming}
                valueStyle={{ color: '#e67e22' }}
              />
            </Card>
          )}
        </div>
      )}

      <Card style={{ marginBottom: 16 }}>
        <Heatmap />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Leaderboard />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <MemberDirectory />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <DeptGuide />
      </Card>

      {/* 任务日历 */}
      <Card title="📅 任务日历" style={{ marginBottom: 16 }}>
        <TaskCalendar />
      </Card>

      {/* 个人信息 */}
      <Card title="📋 个人信息" className={styles.profileCard}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="姓名">{user.name}</Descriptions.Item>
          <Descriptions.Item label="学号">{user.student_id}</Descriptions.Item>
          <Descriptions.Item label="部门">{getDepartmentLabel(user.department)}</Descriptions.Item>
          <Descriptions.Item label="角色">{getRoleLabel(user.role)}</Descriptions.Item>
          <Descriptions.Item label="注册时间">{user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}</Descriptions.Item>
          <Descriptions.Item label="操作">
            <Button icon={<LockOutlined />} size="small" onClick={() => setShowPassword(true)}>
              修改密码
            </Button>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        open={showPassword}
        onCancel={() => setShowPassword(false)}
        footer={null}
        width={400}
        destroyOnClose
      >
        <ChangePassword onClose={() => { setShowPassword(false); message.success('密码修改成功'); }} />
      </Modal>
    </div>
  );
}
