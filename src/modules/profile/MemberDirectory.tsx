import { useState, useEffect, useMemo } from 'react';
import { Card, Input, Tag, Avatar, Empty, Spin, Tooltip } from 'antd';
import { SearchOutlined, UserOutlined } from '@ant-design/icons';
import { fetchAllMembers } from './profileService';
import type { MemberInfo } from './profileService';
import { getDepartmentLabel, getRoleLabel } from '../../utils/helpers';
import { DEPARTMENTS } from '../../utils/constants';
import { logger } from '../../diagnostics';
import styles from './profile.module.css';

const log = logger.for('profile/MemberDirectory');

export default function MemberDirectory() {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  useEffect(() => {
    fetchAllMembers().then((data) => {
      setMembers(data);
      setLoading(false);
      log.info('通讯录加载完成', { count: data.length });
    });
  }, []);

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
      <Card title="📇 通讯录" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      </Card>
    );
  }

  return (
    <Card title="📇 通讯录" style={{ marginBottom: 16 }}>
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
                  <div style={{ fontSize: 12, color: '#7f8c8d' }}>
                    {getDepartmentLabel(m.department)} · {getRoleLabel(m.role)}
                  </div>
                </div>
              </div>
              <div className={styles.memberStats}>
                <Tooltip title="进行中任务">
                  <span className={styles.memberStatItem}>
                    🟢 {m.in_progress}
                  </span>
                </Tooltip>
                <Tooltip title="逾期任务">
                  <span className={styles.memberStatItem} style={m.overdue > 0 ? { color: '#e74c3c', fontWeight: 600 } : {}}>
                    {m.overdue > 0 ? '🔴' : '⭕'} {m.overdue}
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
