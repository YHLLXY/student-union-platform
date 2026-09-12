import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Select, message, Tag, Popconfirm, InputNumber, Modal, Alert, Space, theme } from 'antd';
import { PlusOutlined, CopyOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { DEPARTMENTS, ROLES } from '@/utils/constants';
import { getDepartmentLabel, getRoleLabel, hasMinRole } from '@/utils/helpers';
import { exportCsv } from '@/utils/export';
import { fetchInviteCodes, generateInviteCode, generateInviteCodeBatch, deactivateInviteCode, deleteInviteCode } from './adminService';
import type { InviteCode } from './adminService';

const deptOptions = Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label }));
const roleOptions = Object.entries(ROLES).map(([key, label]) => ({ value: key, label }));

interface InviteCodeManageProps {
  userRole: string;
  userDept: string;
}

export default function InviteCodeManage({ userRole, userDept }: InviteCodeManageProps) {
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [genDept, setGenDept] = useState(userDept);
  const [genRole, setGenRole] = useState('volunteer');
  const [genLoading, setGenLoading] = useState(false);
  const [genMaxUses, setGenMaxUses] = useState(1);
  const [genExpiresDays, setGenExpiresDays] = useState<number | null>(null);
  // 批量生成：数量 + 本批结果（生成后同框展示，便于复制/导出）
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCount, setBatchCount] = useState(10);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchCodes, setBatchCodes] = useState<string[]>([]);

  // 部门负责人只看本部门（hasMinRole 替代硬编码字符串比较）
  const isDeptHead = hasMinRole(userRole, 'dept_head') && !hasMinRole(userRole, 'presidium');
  const canDelete = hasMinRole(userRole, 'presidium');
  const isGlobalAdmin = hasMinRole(userRole, 'president');

  const codesQuery = useQuery({
    queryKey: ['inviteCodes', userRole, isDeptHead ? userDept : 'all'],
    queryFn: () => fetchInviteCodes(isDeptHead ? userDept : undefined),
  });

  const codes: InviteCode[] = codesQuery.data ?? [];
  const loading = codesQuery.isPending;
  const loadCodes = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['inviteCodes'] });
  }, [queryClient]);

  const handleGenerate = async () => {
    setGenLoading(true);
    const code = await generateInviteCode(genDept, genRole, genMaxUses, genExpiresDays);
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

  /** 批量生成：按当前头部这组参数（部门/角色/次数/有效期）一次生成 N 个，同批共用 batch_id */
  const handleBatchGenerate = async () => {
    setBatchLoading(true);
    const result = await generateInviteCodeBatch({
      count: batchCount,
      department: genDept,
      role: isDeptHead ? 'volunteer' : genRole,
      maxUses: genMaxUses,
      expiresInDays: genExpiresDays,
    });
    setBatchLoading(false);

    if (!result) {
      message.error('批量生成失败，请重试');
      return;
    }
    setBatchCodes(result.codes);
    message.success(`已生成 ${result.codes.length} 个邀请码`);
    loadCodes();
  };

  const handleCopyBatch = () => {
    navigator.clipboard.writeText(batchCodes.join('\n')).then(
      () => message.success(`已复制 ${batchCodes.length} 个邀请码`),
    );
  };

  const handleExportBatch = () => {
    if (batchCodes.length === 0) return;
    const rows = batchCodes.map((code, i) => ({
      index: i + 1,
      code,
      department: getDepartmentLabel(genDept),
      role: getRoleLabel(isDeptHead ? 'volunteer' : genRole),
      expires: genExpiresDays ? `${genExpiresDays} 天后` : '永不过期',
    }));
    const n = exportCsv(rows, [
      { title: '序号', value: (r) => r.index },
      { title: '邀请码', value: (r) => r.code },
      { title: '部门', value: (r) => r.department },
      { title: '角色', value: (r) => r.role },
      { title: '有效期', value: (r) => r.expires },
    ], `邀请码批次_${new Date().toISOString().slice(0, 10)}`);
    if (n > 0) message.success(`已导出 ${n} 条`);
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
        if (record.revoked_at) return <Tag color="red">已撤销</Tag>;
        if (record.expires_at && new Date(record.expires_at) < new Date()) return <Tag color="orange">已过期</Tag>;
        if (record.used_count >= record.max_uses) return <Tag color="default">已用完</Tag>;
        return <Tag color="green">可用</Tag>;
      },
    },
    { title: '使用者', dataIndex: 'used_by_name', key: 'used_by_name' },
    {
      title: '次数', key: 'usage',
      render: (_: unknown, record: InviteCode) => `${record.used_count}/${record.max_uses}`,
      width: 70,
    },
    {
      title: '过期', dataIndex: 'expires_at', key: 'expires',
      render: (v: string | null) => v ? new Date(v).toLocaleDateString('zh-CN') : '—',
      width: 100,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ margin: 0 }}>邀请码管理</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select
            aria-label="邀请码所属部门"
            value={genDept}
            onChange={setGenDept}
            options={deptOptions}
            size="small"
            style={{ width: 140 }}
            disabled={isDeptHead}
          />
          <Select
            aria-label="邀请码对应角色"
            value={genRole}
            onChange={setGenRole}
            options={isDeptHead ? [{ value: 'volunteer', label: '常驻志愿者' }] : roleOptions}
            size="small"
            style={{ width: 130 }}
            disabled={isDeptHead}
          />
          <InputNumber
            min={1}
            max={999}
            value={genMaxUses}
            onChange={v => setGenMaxUses(v ?? 1)}
            size="small"
            style={{ width: 70 }}
            disabled={isDeptHead}
            title="可使用次数"
          />
          <Select
            aria-label="邀请码有效期"
            value={genExpiresDays}
            onChange={setGenExpiresDays}
            size="small"
            style={{ width: 100 }}
            disabled={isDeptHead}
            placeholder="永不过期"
            allowClear
            options={[
              { value: 1, label: '1天' },
              { value: 3, label: '3天' },
              { value: 7, label: '7天' },
              { value: 30, label: '30天' },
              { value: 90, label: '90天' },
            ]}
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
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => { setBatchCodes([]); setBatchOpen(true); }}
          >
            批量生成
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
              const isAvailable = !record.revoked_at
                && record.used_count < record.max_uses
                && (!record.expires_at || new Date(record.expires_at) > new Date());
              const isDeactivated = !!record.revoked_at;
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

      <Modal
        open={batchOpen}
        onCancel={() => setBatchOpen(false)}
        title="批量生成邀请码"
        footer={null}
        width={520}
        destroyOnHidden
      >
        {/* 参数取自页面顶部那一排控件，此处只回显——避免同一组参数出现两份可编辑副本 */}
        <div style={{ marginBottom: 12, fontSize: 13, color: token.colorTextSecondary }}>
          按当前参数生成：
          <Tag>{getDepartmentLabel(genDept)}</Tag>
          <Tag>{getRoleLabel(isDeptHead ? 'volunteer' : genRole)}</Tag>
          <Tag>可用 {genMaxUses} 次</Tag>
          <Tag>{genExpiresDays ? `${genExpiresDays} 天后过期` : '永不过期'}</Tag>
          <span>（要改参数请关掉本窗口，改上面那一排）</span>
        </div>

        {batchCodes.length === 0 ? (
          <>
            <Space style={{ marginBottom: 12 }}>
              <span>生成数量</span>
              <InputNumber
                min={1}
                max={50}
                value={batchCount}
                onChange={(v) => setBatchCount(v ?? 10)}
                style={{ width: 90 }}
              />
              <span style={{ fontSize: 12, color: token.colorTextTertiary }}>一次最多 50 个</span>
            </Space>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              title="同一批生成会记同一个批次号，便于整批导出、整批作废。"
              description="生成结果可一键复制或导出 CSV，适合打印后线下分发。"
            />
            <Button type="primary" block loading={batchLoading} onClick={handleBatchGenerate}>
              生成 {batchCount} 个邀请码
            </Button>
          </>
        ) : (
          <>
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 12 }}
              title={`已生成 ${batchCodes.length} 个邀请码（部门/角色/有效期同上方回显）`}
            />
            <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: 8 }}>
              {batchCodes.map((code, i) => (
                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span style={{ width: 32, color: token.colorTextTertiary, fontSize: 12 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontFamily: 'monospace', letterSpacing: 1 }}>{code}</span>
                  <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => handleCopy(code)}>
                    复制
                  </Button>
                </div>
              ))}
            </div>
            <Space style={{ marginTop: 12 }}>
              <Button icon={<CopyOutlined />} onClick={handleCopyBatch}>复制全部</Button>
              <Button icon={<DownloadOutlined />} onClick={handleExportBatch}>导出 CSV</Button>
              <Button type="primary" onClick={() => setBatchOpen(false)}>完成</Button>
            </Space>
          </>
        )}
      </Modal>
    </div>
  );
}
