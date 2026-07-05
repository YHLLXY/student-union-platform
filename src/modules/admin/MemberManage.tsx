import { useState, useEffect, useCallback } from 'react';
import { Table, Select, Button, Popconfirm, message, Spin, Tabs } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { getDepartmentLabel, getRoleLabel, isAdmin } from '../../utils/helpers';
import { ROLES, DEPARTMENTS } from '../../utils/constants';
import { fetchAllMembers, updateMemberRole, removeMember, transferMember, resetMemberPassword } from './adminService';
import type { UserProfile } from '../auth';
import InviteCodeManage from './InviteCodeManage';
import WorkOverview from './WorkOverview';
import styles from './admin.module.css';

const roleOptions = Object.entries(ROLES).map(([key, label]) => ({ value: key, label }));
const deptOptions = Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label }));

export default function MemberManage() {
  const user = useAuth();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');

  const loadMembers = useCallback(async () => {
    const data = await fetchAllMembers(user.role, user.department);
    setMembers(data);
    setLoading(false);
  }, [user.role, user.department]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

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
    const ok = await resetMemberPassword(authId);
    if (ok) {
      message.success(`${name} 的密码已重置为 123456`);
    } else {
      message.error('重置失败，请检查 SQL 函数是否已创建');
    }
  };

  const adminAccess = isAdmin(user.role); // 主席、老师或开发者

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '学号/工号', dataIndex: 'student_id', key: 'student_id' },
    {
      title: '部门', dataIndex: 'department', key: 'department',
      render: (d: string, record: UserProfile) => {
        if (adminAccess) {
          return (
            <Select
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

  if (loading) return <Spin />;

  const memberContent = (
    <div>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>👥 成员管理</div>
        <Table
          dataSource={members}
          columns={columns}
          rowKey="id"
          size="small"
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
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>⚙️ 权限管理</h2>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'members', label: '👥 成员管理', children: memberContent },
          { key: 'overview', label: '📊 工作看板', children: <WorkOverview /> },
        ]}
      />
    </div>
  );
}
