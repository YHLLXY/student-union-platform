import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Select, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, CopyOutlined } from '@ant-design/icons';
import { DEPARTMENTS, ROLES } from '../../utils/constants';
import { getDepartmentLabel, getRoleLabel, hasMinRole } from '../../utils/helpers';
import { fetchInviteCodes, generateInviteCode, deactivateInviteCode, deleteInviteCode } from './adminService';
import type { InviteCode } from './adminService';

const deptOptions = Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label }));
const roleOptions = Object.entries(ROLES).map(([key, label]) => ({ value: key, label }));

interface InviteCodeManageProps {
  userRole: string;
  userDept: string;
}

export default function InviteCodeManage({ userRole, userDept }: InviteCodeManageProps) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [genDept, setGenDept] = useState(userDept);
  const [genRole, setGenRole] = useState('volunteer');
  const [genLoading, setGenLoading] = useState(false);

  // 部门负责人只看本部门（hasMinRole 替代硬编码字符串比较）
  const isDeptHead = hasMinRole(userRole, 'dept_head') && !hasMinRole(userRole, 'presidium');
  const canDelete = hasMinRole(userRole, 'presidium');
  const isGlobalAdmin = hasMinRole(userRole, 'president');

  const loadCodes = useCallback(async () => {
    const data = await fetchInviteCodes(isDeptHead ? userDept : undefined);
    setCodes(data);
    setLoading(false);
  }, [userRole, userDept]);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const handleGenerate = async () => {
    setGenLoading(true);
    const code = await generateInviteCode(genDept, genRole);
    setGenLoading(false);

    if (code) {
      message.success(`邀请码已生成: ${code}`);
      loadCodes();
    } else {
      message.error('生成失败');
    }
  };

  const handleDeactivate = async (id: string) => {
    const ok = await deactivateInviteCode(id);
    if (ok) {
      message.success('已停用');
      loadCodes();
    } else {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteInviteCode(id);
    if (ok) {
      message.success('已删除');
      loadCodes();
    } else {
      message.error('删除失败');
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).then(
      () => message.success('已复制到剪贴板'),
    );
  };

  // 部门负责人只能生成本部门志愿者邀请码（isDeptHead 已在组件顶部定义）

  const columns = [
    { title: '邀请码', dataIndex: 'code', key: 'code' },
    {
      title: '部门', dataIndex: 'department', key: 'department',
      render: (d: string) => getDepartmentLabel(d),
    },
    {
      title: '角色', dataIndex: 'role', key: 'role',
      render: (r: string) => getRoleLabel(r),
    },
    {
      title: '状态', dataIndex: 'is_used', key: 'status',
      render: (_: boolean, record: InviteCode) => {
        if (!record.is_used) return <Tag color="green">可用</Tag>;
        if (record.used_by) return <Tag color="default">已使用</Tag>;
        return <Tag color="red">已停用</Tag>;
      },
    },
    { title: '使用者', dataIndex: 'used_by_name', key: 'used_by_name' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ margin: 0 }}>🔑 邀请码管理</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select
            value={genDept}
            onChange={setGenDept}
            options={deptOptions}
            size="small"
            style={{ width: 140 }}
            disabled={isDeptHead}
          />
          <Select
            value={genRole}
            onChange={setGenRole}
            options={isDeptHead ? [{ value: 'volunteer', label: '常驻志愿者' }] : roleOptions}
            size="small"
            style={{ width: 130 }}
            disabled={isDeptHead}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleGenerate}
            loading={genLoading}
          >
            生成邀请码
          </Button>
        </div>
      </div>

      <Table
        dataSource={codes}
        columns={[
          ...columns,
          {
            title: '操作', key: 'actions',
            render: (_: unknown, record: InviteCode) => {
              const isAvailable = !record.is_used;
              const isDeactivated = record.is_used && !record.used_by;
              const canDeleteThis = (isAvailable || isDeactivated)
                && (isGlobalAdmin || (canDelete && record.department === userDept));

              return (
                <div style={{ display: 'flex', gap: 4 }}>
                  {isAvailable && (
                    <>
                      <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(record.code)}>
                        复制
                      </Button>
                      <Button size="small" danger onClick={() => handleDeactivate(record.id)}>
                        停用
                      </Button>
                    </>
                  )}
                  {canDeleteThis && (
                    <Popconfirm
                      title="确认删除该邀请码？删除后不可恢复"
                      onConfirm={() => handleDelete(record.id)}
                      okText="确认"
                      cancelText="取消"
                    >
                      <Button size="small" danger>删除</Button>
                    </Popconfirm>
                  )}
                </div>
              );
            },
          },
        ]}
        rowKey="id"
        size="small"
        scroll={{ x: 'max-content' }}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
}
