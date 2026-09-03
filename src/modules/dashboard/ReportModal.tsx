import { Modal, Table, Tag, Descriptions, Empty, Spin, Grid, theme } from 'antd';
import { TrophyOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MonthlyReport, WeeklyBrief } from './dashboardService';
import { PODIUM_COLORS } from '@/utils/themeColors';
import styles from './brief.module.css';

interface ReportModalProps {
  open: boolean;
  loading: boolean;
  data: MonthlyReport | null;
  onClose: () => void;
  weekBrief: WeeklyBrief | null;
}

interface DeptRow {
  key: string;
  dept: string;
  label: string;
  completed: number;
  total: number;
  rate: string;
}

interface PersonRow {
  key: string;
  name: string;
  completed: number;
  rank: number;
}

const deptColumns: ColumnsType<DeptRow> = [
  { title: '部门', dataIndex: 'label', key: 'label', width: 140 },
  { title: '完成数', dataIndex: 'completed', key: 'completed', width: 80, align: 'right' },
  { title: '总任务', dataIndex: 'total', key: 'total', width: 80, align: 'right' },
  {
    title: '完成率', dataIndex: 'rate', key: 'rate', width: 100,
    render: (_: unknown, row: DeptRow) => {
      const pct = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
      return (
        <Tag color={pct >= 80 ? 'green' : pct >= 50 ? 'orange' : 'red'}>
          {pct}%
        </Tag>
      );
    },
  },
];

const personColumns: ColumnsType<PersonRow> = [
  {
    title: '排名', dataIndex: 'rank', key: 'rank', width: 60,
    render: (_: unknown, row: PersonRow) => {
      if (row.rank === 1) return <TrophyOutlined style={{ color: PODIUM_COLORS[0], fontSize: 16 }} />;
      if (row.rank === 2) return <span style={{ color: PODIUM_COLORS[1], fontWeight: 600 }}>🥈</span>;
      if (row.rank === 3) return <span style={{ color: PODIUM_COLORS[2], fontWeight: 600 }}>🥉</span>;
      return row.rank;
    },
  },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '完成任务', dataIndex: 'completed', key: 'completed', width: 80, align: 'right' },
];

export default function ReportModal({ open, loading, data, onClose, weekBrief }: ReportModalProps) {
  const { token } = theme.useToken();
  const { md } = Grid.useBreakpoint();
  const weekChange = weekBrief && weekBrief.completedLastWeek > 0
    ? Math.round(((weekBrief.completedThisWeek - weekBrief.completedLastWeek) / weekBrief.completedLastWeek) * 100)
    : null;

  const overdueRate = data && data.totalTasks > 0
    ? Math.round((data.totalOverdue / data.totalTasks) * 100)
    : 0;

  const deptRows: DeptRow[] = (data?.byDepartment ?? []).map((d) => ({
    key: d.dept,
    dept: d.dept,
    label: d.label,
    completed: d.completed,
    total: d.total,
    rate: d.total > 0 ? `${Math.round((d.completed / d.total) * 100)}%` : '0%',
  }));

  const personRows: PersonRow[] = (data?.byPerson ?? []).map((p, i) => ({
    key: p.userId,
    name: p.name,
    completed: p.completed,
    rank: i + 1,
  }));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={md ? 720 : undefined}
      title="📊 月度工作简报"
      destroyOnHidden
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : !data ? (
        <Empty description="暂无数据" style={{ padding: 48 }} />
      ) : (
        <div className={styles.reportBody}>
          {/* 概览 */}
          <Descriptions bordered size="small" column={md ? 3 : 2} style={{ marginBottom: 20 }}>
            <Descriptions.Item label="统计月份">
              <Tag color="blue">{data.monthLabel}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={<><CheckCircleOutlined /> 已完成</>}>
              <span style={{ color: token.colorSuccess, fontWeight: 600 }}>{data.totalCompleted}</span>
            </Descriptions.Item>
            <Descriptions.Item label={<><WarningOutlined /> 逾期</>}>
              <span style={{ color: token.colorError, fontWeight: 600 }}>{data.totalOverdue}</span>
            </Descriptions.Item>
            <Descriptions.Item label="总任务数">{data.totalTasks}</Descriptions.Item>
            <Descriptions.Item label="逾期率">
              <span style={{ color: overdueRate > 30 ? token.colorError : token.colorSuccess }}>
                {overdueRate}%
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="环比上周">
              {weekChange !== null ? (
                <span style={{ color: weekChange >= 0 ? token.colorSuccess : token.colorError }}>
                  {weekChange >= 0 ? '↑' : '↓'} {Math.abs(weekChange)}%
                </span>
              ) : '-'}
            </Descriptions.Item>
          </Descriptions>

          {/* 按部门 */}
          <h4 className={styles.reportSectionTitle}>📋 按部门统计</h4>
          {deptRows.length === 0 ? (
            <div className={styles.reportEmpty}>本月暂无部门数据</div>
          ) : (
            <Table
              columns={deptColumns}
              dataSource={deptRows}
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
              style={{ marginBottom: 20 }}
            />
          )}

          {/* 按人排行榜 */}
          <h4 className={styles.reportSectionTitle}>🏆 月度完成榜 Top 10</h4>
          {personRows.length === 0 ? (
            <div className={styles.reportEmpty}>本月暂无个人数据</div>
          ) : (
            <Table
              columns={personColumns}
              dataSource={personRows}
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
