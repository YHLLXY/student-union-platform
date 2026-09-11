import { useState, useEffect, useCallback } from 'react';
import { Card, Select, Tag, Avatar, Progress, theme, Segmented, Table, Button, Space, message } from 'antd';
import { UserOutlined, ExclamationCircleOutlined, DownloadOutlined, TrophyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthContext';
import { ListSkeleton } from '@/components/SkeletonBlocks';
import { EmptyState } from '@/components/common';
import { getDepartmentLabel, getRoleLabel, hasMinRole, currentSemester, formatSemester } from '@/utils/helpers';
import { exportCsv } from '@/utils/export';
import { PODIUM_COLORS } from '@/utils/themeColors';
import { fetchMemberWorkSummaries, fetchPointsStandings } from './adminService';
import type { MemberWorkSummary, PointsStanding } from './adminService';
import styles from './admin.module.css';

type SortKey = 'overdue' | 'completed' | 'department';

export default function WorkOverview() {
  const { token } = theme.useToken();
  const user = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<MemberWorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('overdue');

  // 积分排行：范围切换（部门负责人只能看本部门，服务端也会再收窄一次）
  const canSwitchScope = hasMinRole(user.role, 'presidium');
  const [scope, setScope] = useState<'department' | 'all'>('department');
  const semester = currentSemester();

  const standingsQuery = useQuery({
    queryKey: ['pointsStandings', scope, user.role, user.department],
    queryFn: () => fetchPointsStandings(scope, user.role, user.department),
  });
  const standings: PointsStanding[] = standingsQuery.data ?? [];

  const handleExportStandings = useCallback(() => {
    if (standings.length === 0) return;
    const count = exportCsv(standings, [
      { title: '排名', value: (s) => s.rank },
      { title: '姓名', value: (s) => s.name },
      { title: '部门', value: (s) => getDepartmentLabel(s.department) },
      { title: '角色', value: (s) => getRoleLabel(s.role) },
      { title: '本学期积分', value: (s) => s.total },
      { title: '审核通过次数', value: (s) => s.approved },
      { title: '按时提交次数', value: (s) => s.onTime },
      { title: '逾期提交次数', value: (s) => s.late },
      { title: '签到次数', value: (s) => s.checkins },
    ], `积分排行_${scope === 'all' ? '全校' : '部门内'}_${semester}`);
    if (count > 0) message.success(`已导出 ${count} 条`);
  }, [standings, scope, semester]);

  useEffect(() => {
    setLoading(true);
    fetchMemberWorkSummaries(user.role, user.department)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [user.role, user.department]);

  const sorted = [...data].sort((a, b) => {
    if (sortBy === 'overdue') return b.overdue - a.overdue;
    if (sortBy === 'completed') return b.completed - a.completed;
    return a.user.department.localeCompare(b.user.department);
  });

  const handleCardClick = (memberId: string) => {
    navigate(`/tasks?member=${memberId}`);
  };

  if (loading) return <ListSkeleton />;
  if (data.length === 0) return <EmptyState title="暂无成员数据" description="当前权限范围内没有可查看的成员" />;

  return (
    <div>
      {/* 本学期积分排行（A3 考核积分，v4.4.0）：积分由数据库触发器记账，这里只读 */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <TrophyOutlined style={{ color: token.colorWarning }} />
            本学期积分排行
            <Tag color="blue">{formatSemester(semester)}</Tag>
          </span>
        }
        extra={
          <Space>
            {canSwitchScope && (
              <Segmented
                size="small"
                value={scope}
                onChange={(v) => setScope(v as 'department' | 'all')}
                options={[
                  { label: '部门内', value: 'department' },
                  { label: '全校', value: 'all' },
                ]}
              />
            )}
            <Button
              size="small"
              icon={<DownloadOutlined />}
              disabled={standings.length === 0}
              onClick={handleExportStandings}
            >
              导出排行
            </Button>
          </Space>
        }
      >
        {standingsQuery.isPending ? (
          <ListSkeleton count={3} avatar />
        ) : standingsQuery.isError ? (
          <EmptyState
            compact
            title="积分排行加载失败"
            description="网络异常或服务暂时不可用，请稍后重试"
            action={<Button type="primary" onClick={() => standingsQuery.refetch()}>重新加载</Button>}
          />
        ) : standings.length === 0 ? (
          <EmptyState compact title="权限范围内没有成员" description="换一个范围试试，或确认成员是否已加入部门" />
        ) : (
          <Table<PointsStanding>
            dataSource={standings}
            rowKey="user_id"
            size="small"
            pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
            columns={[
              {
                title: '排名', dataIndex: 'rank', width: 70,
                render: (rank: number) =>
                  rank <= 3 ? (
                    <span style={{ color: PODIUM_COLORS[rank - 1], fontWeight: 700 }}>{rank}</span>
                  ) : (
                    <span style={{ color: token.colorTextTertiary }}>{rank}</span>
                  ),
              },
              { title: '姓名', dataIndex: 'name' },
              {
                title: '部门', dataIndex: 'department',
                render: (d: string) => getDepartmentLabel(d),
              },
              {
                title: '积分', dataIndex: 'total', width: 80,
                sorter: (a: PointsStanding, b: PointsStanding) => a.total - b.total,
                render: (t: number) => (
                  <span style={{ fontWeight: 600, color: t >= 0 ? token.colorSuccess : token.colorError }}>{t}</span>
                ),
              },
              {
                title: '构成', key: 'breakdown',
                render: (_: unknown, s: PointsStanding) => (
                  <span style={{ fontSize: 12 }}>
                    <Tag color="green">通过 {s.approved}</Tag>
                    <Tag color="blue">按时 {s.onTime}</Tag>
                    {s.late > 0 && <Tag color="red">逾期 {s.late}</Tag>}
                    {s.checkins > 0 && <Tag color="purple">签到 {s.checkins}</Tag>}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>

      <div className={styles.overviewHeader}>
        <span className={styles.overviewTitle}>
          成员工作看板
          <span style={{ fontSize: 13, fontWeight: 400, color: token.colorTextSecondary, marginLeft: 8 }}>
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
                <Avatar size={36} icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
                <div className={styles.memberCardInfo}>
                  <div className={styles.memberCardName}>
                    {m.user.name}
                    {m.overdue > 0 && (
                      <ExclamationCircleOutlined style={{ color: token.colorError, marginLeft: 6, fontSize: 14 }} />
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
                    strokeColor={completionRate >= 80 ? token.colorSuccess : completionRate >= 50 ? token.colorWarning : token.colorError}
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
