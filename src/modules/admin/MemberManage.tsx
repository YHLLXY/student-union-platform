import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, Select, Button, Popconfirm, message, Tabs, Grid } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { RouteSkeleton } from '@/components/SkeletonBlocks';
import { getDepartmentLabel, getRoleLabel, isAdmin, formatDateTime } from '@/utils/helpers';
import { ROLES, DEPARTMENTS } from '@/utils/constants';
import { exportCsv } from '@/utils/export';
import { fetchAllMembers, updateMemberRole, removeMember, transferMember, resetMemberPassword } from './adminService';
import type { UserProfile } from '@/modules/auth';
import InviteCodeManage from './InviteCodeManage';
import WorkOverview from './WorkOverview';
import AnalyticsDashboard from './AnalyticsDashboard';
import styles from './admin.module.css';

const roleOptions = Object.entries(ROLES).map(([key, label]) => ({ value: key, label }));
const deptOptions = Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label }));

export default function MemberManage() {
  const user = useAuth();
  const { md } = Grid.useBreakpoint();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('members');

  const membersQuery = useQuery({
    queryKey: ['members', user.role, user.department],
    queryFn: () => fetchAllMembers(user.role, user.department),
  });

  const members = membersQuery.data ?? [];
  const loadMembers = () => queryClient.invalidateQueries({ queryKey: ['members'] });

  const handleRoleChange = async (memberId: string, newRole: string) => {
    const ok = await updateMemberRole(memberId, newRole);
    if (ok) {
      message.success('角色已更新');
      loadMembers();
    } else {
      message.error('更新失败');
    }
  };

  const handleDeptChange = async (memberId: string, newDept: string) => {
    const ok = await transferMember(memberId, newDept);
    if (ok) {
      message.success('部门已调动');
      loadMembers();
    } else {
      message.error('调动失败');
    }
  };

  const handleRemove = async (memberId: string) => {
    const ok = await removeMember(memberId);
    if (ok) {
      message.success('成员已移除');
      loadMembers();
    } else {
      message.error('移除失败');
    }
  };

  const handleResetPassword = async (authId: string, name: string) => {
    const newPwd = await resetMemberPassword(authId);
    if (newPwd) {
      message.success(`${name} 的密码已重置为 ${newPwd}`);
    } else {
      message.error('重置失败，请检查 SQL 函数是否已创建');
    }
  };

  const adminAccess = isAdmin(user.role); // 主席、老师或开发者

  // 导出当前可见的成员名单（权限过滤在 fetchAllMembers 内完成，导出的就是屏幕上这份）
  const handleExport = () => {
    if (members.length === 0) {
      message.warning('暂无可导出的成员');
      return;
    }
    const count = exportCsv(members, [
      { title: '姓名', value: (m) => m.name },
      { title: '学号/工号', value: (m) => m.student_id },
      { title: '部门', value: (m) => getDepartmentLabel(m.department) },
      { title: '角色', value: (m) => getRoleLabel(m.role) },
      { title: '加入时间', value: (m) => formatDateTime(m.created_at) },
    ], '成员名单');
    message.success(`已导出 ${count} 条成员记录`);
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    // 移动端隐藏学号列，减少横向滚动（操作列更容易到达）
    ...(md ? [{ title: '学号/工号', dataIndex: 'student_id', key: 'student_id' }] : []),
    {
      title: '部门', dataIndex: 'department', key: 'department',
      render: (d: string, record: UserProfile) => {
        if (adminAccess) {
          return (
            <Select
              aria-label={`调整 ${record.name} 的所属部门`}
              value={d}
              size="small"
              style={{ width: 140 }}
              options={deptOptions}
              onChange={(val) => handleDeptChange(record.id, val)}
            />
          );
        }
        return getDepartmentLabel(d);
      },
    },
    {
      title: '角色', dataIndex: 'role', key: 'role',
      render: (r: string, record: UserProfile) => {
        if (adminAccess) {
          return (
            <Select
              aria-label={`调整 ${record.name} 的角色`}
              value={r}
              size="small"
              style={{ width: 120 }}
              options={roleOptions}
              onChange={(val) => handleRoleChange(record.id, val)}
            />
          );
        }
        return getRoleLabel(r);
      },
    },
    ...(adminAccess
      ? [{
          title: '操作', key: 'actions',
          render: (_: unknown, record: UserProfile) => (
            <div style={{ display: 'flex', gap: 4 }}>
              <Popconfirm
                title={`确认重置 ${record.name} 的密码为 123456？`}
                onConfirm={() => handleResetPassword(record.auth_id, record.name)}
                okText="确认"
                cancelText="取消"
              >
                <Button type="link" size="small">重置密码</Button>
              </Popconfirm>
              <Popconfirm
                title="确认移除该成员？"
                onConfirm={() => handleRemove(record.id)}
                okText="确认"
                cancelText="取消"
              >
                <Button type="link" danger size="small">移除</Button>
              </Popconfirm>
            </div>
          ),
        }]
      : []),
  ];

  if (membersQuery.isPending) return <RouteSkeleton />;

  const memberContent = (
    <div>
      <div className={styles.section}>
        <div className={styles.headerRow}>
          <div className={styles.sectionTitleInline}>成员管理</div>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={members.length === 0}
          >
            导出名单
          </Button>
        </div>
        <Table
          dataSource={members}
          columns={columns}
          rowKey="id"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20 }}
        />
      </div>
      <div className={styles.section}>
        <InviteCodeManage userRole={user.role} userDept={user.department} />
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>权限管理</h2>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'members', label: '成员管理', children: memberContent },
          { key: 'overview', label: '工作看板', children: <WorkOverview /> },
          ...(adminAccess ? [{ key: 'analytics', label: '数据看板', children: <AnalyticsDashboard /> }] : []),
        ]}
      />
    </div>
  );
}
