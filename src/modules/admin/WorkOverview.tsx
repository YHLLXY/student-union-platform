import { useState, useEffect } from 'react';
import { Card, Select, Spin, Empty, Tag, Avatar, Progress } from 'antd';
import { UserOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { getDepartmentLabel, getRoleLabel } from '../../utils/helpers';
import { fetchMemberWorkSummaries } from './adminService';
import type { MemberWorkSummary } from './adminService';
import styles from './admin.module.css';

type SortKey = 'overdue' | 'completed' | 'department';

export default function WorkOverview() {
  const user = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<MemberWorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('overdue');

  useEffect(() => {
    setLoading(true);
    fetchMemberWorkSummaries(user.role, user.department).then((d) => { setData(d); setLoading(false); });
  }, [user.role, user.department]);

  const sorted = [...data].sort((a, b) => {
    if (sortBy === 'overdue') return b.overdue - a.overdue;
    if (sortBy === 'completed') return b.completed - a.completed;
    return a.user.department.localeCompare(b.user.department);
  });

  const handleCardClick = (memberId: string) => {
    navigate(`/tasks?member=${memberId}`);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (data.length === 0) return <Empty description="暂无成员数据" />;

  return (
    <div>
      <div className={styles.overviewHeader}>
        <span className={styles.overviewTitle}>
          📊 成员工作看板
          <span style={{ fontSize: 13, fontWeight: 400, color: '#7f8c8d', marginLeft: 8 }}>
            ({data.length} 人)
          </span>
        </span>
        <Select
          size="small"
          value={sortBy}
          onChange={setSortBy}
          style={{ width: 150 }}
          options={[
            { value: 'overdue', label: '按逾期数 ↓' },
            { value: 'completed', label: '按完成数 ↓' },
            { value: 'department', label: '按部门分组' },
          ]}
        />
      </div>

      <div className={styles.overviewGrid}>
        {sorted.map((m) => {
          const totalActive = m.pending + m.in_progress + m.review;
          const completionRate = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
          return (
            <Card
              key={m.user.id}
              className={styles.memberCard}
              hoverable
              onClick={() => handleCardClick(m.user.id)}
              size="small"
            >
              <div className={styles.memberCardHeader}>
                <Avatar size={36} icon={<UserOutlined />} style={{ background: '#1a3a5c' }} />
                <div className={styles.memberCardInfo}>
                  <div className={styles.memberCardName}>
                    {m.user.name}
                    {m.overdue > 0 && (
                      <ExclamationCircleOutlined style={{ color: '#e74c3c', marginLeft: 6, fontSize: 14 }} />
                    )}
                  </div>
                  <div className={styles.memberCardDept}>
                    {getDepartmentLabel(m.user.department)} · {getRoleLabel(m.user.role)}
                  </div>
                </div>
              </div>

              <div className={styles.statusBar}>
                {m.pending > 0 && (
                  <div className={styles.statusBarPending} style={{ flex: m.pending }} title={`待开始 ${m.pending}`} />
                )}
                {m.in_progress > 0 && (
                  <div className={styles.statusBarProgress} style={{ flex: m.in_progress }} title={`进行中 ${m.in_progress}`} />
                )}
                {m.review > 0 && (
                  <div className={styles.statusBarReview} style={{ flex: m.review }} title={`待审核 ${m.review}`} />
                )}
                {m.completed > 0 && (
                  <div className={styles.statusBarCompleted} style={{ flex: m.completed }} title={`已完成 ${m.completed}`} />
                )}
              </div>

              <div className={styles.memberCardStats}>
                <div className={styles.memberStat}>
                  <Tag color="blue">{totalActive} 进行中</Tag>
                </div>
                <div className={styles.memberStat}>
                  <Tag color="green">{m.completed} 已完成</Tag>
                </div>
                {m.overdue > 0 && (
                  <div className={styles.memberStat}>
                    <Tag color="red">{m.overdue} 逾期</Tag>
                  </div>
                )}
                <div className={styles.memberStat}>
                  <Progress
                    percent={completionRate}
                    size="small"
                    style={{ width: 80, margin: 0 }}
                    strokeColor={completionRate >= 80 ? '#27ae60' : completionRate >= 50 ? '#e67e22' : '#e74c3c'}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
