import { Card, Table, Row, Col, Button, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  EyeOutlined,
  UserOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  BarChartOutlined,
  AlertOutlined,
  ArrowUpOutlined,
  FileDoneOutlined,
  BellOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { fetchAnalyticsSummary } from './adminService';
import { StatCard, EmptyState } from '@/components/common';
import { ListSkeleton } from '@/components/SkeletonBlocks';
import styles from './AnalyticsDashboard.module.css';

const EVENT_ICONS: Record<string, { icon: React.ReactNode; label: string }> = {
  page_view: { icon: <ArrowUpOutlined />, label: '页面访问' },
  login: { icon: <UserOutlined />, label: '登录' },
  task_complete: { icon: <FileDoneOutlined />, label: '任务完成' },
  notice_read: { icon: <BellOutlined />, label: '公告已读' },
  ticket_action: { icon: <TagsOutlined />, label: '抢票操作' },
  error: { icon: <AlertOutlined />, label: '错误' },
};

export default function AnalyticsDashboard() {
  const { token } = theme.useToken();

  const summaryQuery = useQuery({
    queryKey: ['analyticsSummary'],
    queryFn: fetchAnalyticsSummary,
  });

  if (summaryQuery.isPending) return <ListSkeleton />;

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <EmptyState
        icon={<BarChartOutlined />}
        title="数据看板加载失败"
        description="网络异常或服务暂时不可用，请稍后重试"
        action={
          <Button type="primary" onClick={() => summaryQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    );
  }

  const data = summaryQuery.data;

  const pageColumns = [
    { title: '模块', dataIndex: 'module', key: 'module', render: (m: string) => m || '未知' },
    { title: '访问次数', dataIndex: 'count', key: 'count', render: (c: number) => `${c} 次` },
  ];

  const errorColumns = [
    { title: '时间', dataIndex: 'created_at', key: 'created_at',
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
      width: 160 },
    { title: '模块', dataIndex: 'module', key: 'module', width: 120 },
    { title: '错误信息', dataIndex: 'metadata', key: 'metadata',
      render: (m: unknown) => {
        const meta = m as Record<string, string> | null;
        return meta?.error ?? meta?.message ?? JSON.stringify(m).slice(0, 100);
      },
      ellipsis: true },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} className={styles.statRow}>
        <Col xs={12} md={6}>
          <StatCard icon={<ThunderboltOutlined />} label="近7天事件数" value={data.recent7d} color={token.colorInfo} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard icon={<UserOutlined />} label="近7天活跃用户" value={data.activeUsers7d} color={token.colorSuccess} suffix="人" />
        </Col>
        <Col xs={12} md={6}>
          <StatCard icon={<EyeOutlined />} label="总事件数" value={data.totalEvents} color={token.colorPrimary} />
        </Col>
        <Col xs={12} md={6}>
          <Card className={styles.topModuleCard} styles={{ body: { padding: '18px 20px' } }}>
            <div className={styles.topModuleTop}>
              <span
                className={styles.topModuleIcon}
                style={{ color: token.colorWarning, background: `color-mix(in srgb, ${token.colorWarning} 12%, transparent)` }}
              >
                <TrophyOutlined />
              </span>
              <span className={styles.topModuleLabel}>最热模块</span>
            </div>
            <div className={styles.topModuleName}>{data.topModule || '暂无数据'}</div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className={styles.tableRow}>
        <Col xs={24} md={12}>
          <Card title="页面访问排名（近7天）" size="small">
            <Table
              dataSource={data.pageRanking}
              columns={pageColumns}
              rowKey="module"
              pagination={false}
              size="small"
              showHeader={false}
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="事件类型统计（近7天）" size="small">
            <Table
              dataSource={data.eventStats}
              columns={[
                { title: '类型', dataIndex: 'event_type', key: 'event_type',
                  render: (t: string) => {
                    const meta = EVENT_ICONS[t];
                    return meta ? (
                      <span>{meta.icon && <span className={styles.eventIcon}>{meta.icon}</span>}{meta.label}</span>
                    ) : t;
                  },
                },
                { title: '次数', dataIndex: 'count', key: 'count',
                  render: (c: number) => `${c} 次` },
              ]}
              rowKey="event_type"
              pagination={false}
              size="small"
              showHeader={false}
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="最近错误（最多10条）" size="small">
        <Table
          dataSource={data.recentErrors}
          columns={errorColumns}
          rowKey={(_, i) => String(i)}
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无错误记录' }}
        />
      </Card>
    </div>
  );
}
