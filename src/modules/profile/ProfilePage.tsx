import { useState } from 'react';
import { Card, Statistic, Descriptions, Button, Modal, message, theme, Space, Avatar } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  LockOutlined, EditOutlined, UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { getDepartmentLabel, getRoleLabel } from '@/utils/helpers';
import { fetchUserStats, fetchMilestoneSummary } from './profileService';
import type { UserStats } from './profileService';
import TaskCalendar from './TaskCalendar';
import ChangePassword from './ChangePassword';
import Heatmap from './Heatmap';
import Leaderboard from './Leaderboard';
import MemberDirectory from './MemberDirectory';
import DeptGuide from './DeptGuide';
import PointsPanel from './PointsPanel';
import ProfileEditModal from './ProfileEditModal';
import TaskListModal from './TaskListModal';
import styles from './profile.module.css';

export default function ProfilePage() {
  const { token } = theme.useToken();
  const user = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalTab, setTaskModalTab] = useState('completed');

  const statsQuery = useQuery({
    queryKey: ['profileStats', user.id],
    queryFn: () => fetchUserStats(user.id),
  });
  const summaryQuery = useQuery({
    queryKey: ['milestoneSummary', user.id],
    queryFn: () => fetchMilestoneSummary(user.id),
  });

  const stats: UserStats = statsQuery.data ?? { completed: 0, pending: 0, overdue: 0 };
  const milestoneSummary = summaryQuery.data ?? { milestoneOverdue: 0, milestoneUpcoming: 0 };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>个人中心</h2>

      {/* 统计面板 */}
      <div className={styles.statsRow}>
        <Card className={styles.statCard} onClick={() => { setTaskModalTab('completed'); setTaskModalOpen(true); }}>
          <Statistic
            title="已完成"
            value={stats.completed}
            prefix={<CheckCircleOutlined style={{ color: token.colorSuccess }} />}
            styles={{ content: { color: token.colorSuccess } }}
          />
        </Card>
        <Card className={styles.statCard} onClick={() => { setTaskModalTab('pending'); setTaskModalOpen(true); }}>
          <Statistic
            title="待完成"
            value={stats.pending}
            prefix={<ClockCircleOutlined style={{ color: token.colorInfo }} />}
            styles={{ content: { color: token.colorInfo } }}
          />
        </Card>
        <Card className={styles.statCard} onClick={() => { setTaskModalTab('overdue'); setTaskModalOpen(true); }}>
          <Statistic
            title="已逾期"
            value={stats.overdue}
            prefix={<ExclamationCircleOutlined style={{ color: token.colorError }} />}
            styles={{ content: { color: token.colorError } }}
          />
        </Card>
      </div>

      {(milestoneSummary.milestoneOverdue > 0 || milestoneSummary.milestoneUpcoming > 0) && (
        <div className={styles.statsRow}>
          {milestoneSummary.milestoneOverdue > 0 && (
            <Card className={styles.statCard}>
              <Statistic
                title="里程碑逾期"
                value={milestoneSummary.milestoneOverdue}
                styles={{ content: { color: token.colorError } }}
              />
            </Card>
          )}
          {milestoneSummary.milestoneUpcoming > 0 && (
            <Card className={styles.statCard}>
              <Statistic
                title="⏰ 近日截止"
                value={milestoneSummary.milestoneUpcoming}
                styles={{ content: { color: token.colorWarning } }}
              />
            </Card>
          )}
        </div>
      )}

      <PointsPanel />

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

      {/* 年度任务热力图 */}
      <Card title="年度任务热力图" style={{ marginBottom: 16 }}>
        <TaskCalendar />
      </Card>

      {/* 个人信息 */}
      <Card title="个人信息" className={styles.profileCard}>
        <div className={styles.profileIdentity}>
          <Avatar size={64} src={user.avatar_url || undefined} icon={<UserOutlined />} />
          <div>
            <div className={styles.profileName}>{user.name}</div>
            <div className={styles.profileSub}>
              {getDepartmentLabel(user.department)} · {getRoleLabel(user.role)}
            </div>
          </div>
        </div>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="姓名">{user.name}</Descriptions.Item>
          <Descriptions.Item label="学号">{user.student_id}</Descriptions.Item>
          <Descriptions.Item label="部门">{getDepartmentLabel(user.department)}</Descriptions.Item>
          <Descriptions.Item label="角色">{getRoleLabel(user.role)}</Descriptions.Item>
          <Descriptions.Item label="联系方式">{user.contact_phone || '未填写'}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{user.contact_email || '未填写'}</Descriptions.Item>
          <Descriptions.Item label="注册时间">{user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}</Descriptions.Item>
          <Descriptions.Item label="操作">
            <Space>
              <Button icon={<EditOutlined />} size="small" type="primary" onClick={() => setShowEdit(true)}>
                编辑资料
              </Button>
              <Button icon={<LockOutlined />} size="small" onClick={() => setShowPassword(true)}>
                修改密码
              </Button>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <ProfileEditModal open={showEdit} onClose={() => setShowEdit(false)} />

      <TaskListModal
        open={taskModalOpen}
        initialTab={taskModalTab}
        userId={user.id}
        onClose={() => setTaskModalOpen(false)}
      />

      <Modal
        open={showPassword}
        onCancel={() => setShowPassword(false)}
        footer={null}
        width={400}
        destroyOnHidden
      >
        <ChangePassword onClose={() => { setShowPassword(false); message.success('密码修改成功'); }} />
      </Modal>
    </div>
  );
}
