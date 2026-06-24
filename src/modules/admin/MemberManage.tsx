import { useState, useEffect, useCallback } from 'react';
import { Table, Select, Button, Popconfirm, message, Spin } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { getDepartmentLabel } from '../../utils/helpers';
import { ROLES } from '../../utils/constants';
import { fetchAllMembers, updateMemberRole, removeMember } from './adminService';
import type { UserProfile } from '../auth';
import InviteCodeManage from './InviteCodeManage';
import styles from './admin.module.css';

const roleOptions = Object.entries(ROLES).map(([key, label]) => ({ value: key, label }));

export default function MemberManage() {
  const user = useAuth();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleRemove = async (memberId: string) => {
    const ok = await removeMember(memberId);
    if (ok) {
      message.success('成员已移除');
      loadMembers();
    } else {
      message.error('移除失败');
    }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '学号', dataIndex: 'student_id', key: 'student_id' },
    {
      title: '部门', dataIndex: 'department', key: 'department',
      render: (d: string) => getDepartmentLabel(d),
    },
    {
      title: '角色', dataIndex: 'role', key: 'role',
      render: (r: string, record: UserProfile) => (
        <Select
          value={r}
          size="small"
          style={{ width: 120 }}
          options={roleOptions}
          onChange={(val) => handleRoleChange(record.id, val)}
        />
      ),
    },
    {
      title: '操作', key: 'actions',
      render: (_: unknown, record: UserProfile) => (
        <Popconfirm
          title="确认移除该成员？"
          onConfirm={() => handleRemove(record.id)}
          okText="确认"
          cancelText="取消"
        >
          <Button type="link" danger size="small">移除</Button>
        </Popconfirm>
      ),
    },
  ];

  if (loading) return <Spin />;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>⚙️ 权限管理</h2>

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
}
