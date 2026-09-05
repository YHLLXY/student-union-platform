import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Input, Tag, Avatar, Empty, Tooltip, theme } from 'antd';
import { SearchOutlined, UserOutlined } from '@ant-design/icons';
import { fetchAllMembers } from './profileService';
import type { MemberInfo } from './profileService';
import { getDepartmentLabel, getRoleLabel } from '@/utils/helpers';
import { ListSkeleton } from '@/components/SkeletonBlocks';
import { DEPARTMENTS } from '@/utils/constants';
import styles from './profile.module.css';

export default function MemberDirectory() {
  const { token } = theme.useToken();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const membersQuery = useQuery({
    queryKey: ['directory'],
    queryFn: fetchAllMembers,
  });

  const members: MemberInfo[] = membersQuery.data ?? [];
  const loading = membersQuery.isPending;

  const filtered = useMemo(() => members.filter((m) => {
    const matchSearch =
      !search ||
      m.name.includes(search) ||
      getDepartmentLabel(m.department).includes(search) ||
      getRoleLabel(m.role).includes(search);
    const matchDept = deptFilter === 'all' || m.department === deptFilter;
    return matchSearch && matchDept;
  }), [members, search, deptFilter]);

  if (loading) {
    return (
      <Card title="通讯录" style={{ marginBottom: 16 }}>
        <ListSkeleton />
      </Card>
    );
  }

  return (
    <Card title="通讯录" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索姓名、部门、角色"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
          allowClear
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Tag
          color={deptFilter === 'all' ? 'blue' : 'default'}
          style={{ cursor: 'pointer' }}
          onClick={() => setDeptFilter('all')}
        >
          全部
        </Tag>
        {Object.keys(DEPARTMENTS).map((key) => (
          <Tag
            key={key}
            color={deptFilter === key ? 'blue' : 'default'}
            style={{ cursor: 'pointer' }}
            onClick={() => setDeptFilter(key)}
          >
            {DEPARTMENTS[key]}
          </Tag>
        ))}
      </div>
      {filtered.length === 0 ? (
        <Empty description="无匹配成员" />
      ) : (
        <div className={styles.directoryGrid}>
          {filtered.map((m) => (
            <Card
              key={m.id}
              size="small"
              className={styles.memberCard}
            >
              <div className={styles.memberCardBody}>
                <Avatar size={40} icon={<UserOutlined />} src={m.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.memberName}>{m.name}</div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    {getDepartmentLabel(m.department)} · {getRoleLabel(m.role)}
                  </div>
                </div>
              </div>
              <div className={styles.memberStats}>
                <Tooltip title="进行中任务">
                  <span className={styles.memberStatItem} style={{ color: token.colorSuccess }}>
                    ● {m.in_progress}
                  </span>
                </Tooltip>
                <Tooltip title="逾期任务">
                  <span className={styles.memberStatItem} style={m.overdue > 0 ? { color: token.colorError, fontWeight: 600 } : { color: token.colorTextQuaternary }}>
                    ● {m.overdue}
                  </span>
                </Tooltip>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
