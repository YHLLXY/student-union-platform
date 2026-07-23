import { useState, useEffect } from 'react';
import { Card, Statistic, Table, Spin, message, Row, Col, Empty } from 'antd';
import {
  EyeOutlined, UserOutlined, ThunderboltOutlined, TrophyOutlined,
} from '@ant-design/icons';
import { fetchAnalyticsSummary } from './adminService';
import type { AnalyticsSummary } from './adminService';
import styles from './AnalyticsDashboard.module.css';

const EVENT_LABELS: Record<string, string> = {
  page_view: '📄 页面访问',
  login: '👤 登录',
  task_complete: '✅ 任务完成',
  notice_read: '📢 公告已读',
  ticket_action: '🎫 抢票操作',
  error: '❌ 错误',
};

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsSummary()
      .then(setData)
      .catch(() => message.error('数据加载失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  if (!data) return <Empty description="暂无数据" />;

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
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>📈 数据看板</h2>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}>
          <Card><Statistic title="近7天事件数" value={data.recent7d} prefix={<ThunderboltOutlined />} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="近7天活跃用户" value={data.activeUsers7d} prefix={<UserOutlined />} suffix="人" /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="总事件数" value={data.totalEvents} prefix={<EyeOutlined />} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="最热模块" value={data.topModule} prefix={<TrophyOutlined />} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card title="📄 页面访问排名（近7天）" size="small">
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
          <Card title="📊 事件类型统计（近7天）" size="small">
            <Table
              dataSource={data.eventStats}
              columns={[
                { title: '类型', dataIndex: 'event_type', key: 'event_type',
                  render: (t: string) => EVENT_LABELS[t] ?? t },
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

      <Card title="❌ 最近错误（最多10条）" size="small">
        <Table
          dataSource={data.recentErrors}
          columns={errorColumns}
          rowKey={(_, i) => String(i)}
          pagination={false}
          size="small"
          locale={{ emptyText: '🎉 暂无错误记录' }}
        />
      </Card>
    </div>
  );
}
