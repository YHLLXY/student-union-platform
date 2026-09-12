import { useCallback } from 'react';
import { Drawer, Tabs, Button, Tag, Progress, Table, Descriptions, Space, message, theme } from 'antd';
import { GiftOutlined, DownloadOutlined, QrcodeOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { ListSkeleton } from '@/components/SkeletonBlocks';
import { EmptyState } from '@/components/common';
import { formatDateTime } from '@/utils/helpers';
import { exportCsv } from '@/utils/export';
import { fetchTicketRoster, fetchTicketCheckInStats } from './ticketService';
import type { Ticket, TicketRosterEntry } from './ticketService';
import styles from './tickets.module.css';

interface TicketDetailDrawerProps {
  open: boolean;
  ticket: Ticket | null;
  /** 组织者（部门负责人及以上）才看得到签到名单 Tab */
  canManage: boolean;
  grabbed: boolean;
  canGrab: boolean;
  onGrab: (ticket: Ticket) => void;
  onOpenMyTickets: () => void;
  onClose: () => void;
}

/**
 * 票务详情（A1 票务闭环）
 *
 * 用 Drawer 而不是路由页：遵守「不改路由、不新增页面」的模块规范（见计划第四节）。
 * 参与者看活动说明与领取入口；组织者多一个「签到名单」Tab（领取/签到统计 + 导出）。
 */
export default function TicketDetailDrawer({
  open, ticket, canManage, grabbed, canGrab, onGrab, onOpenMyTickets, onClose,
}: TicketDetailDrawerProps) {
  const { token } = theme.useToken();
  const ticketId = ticket?.id ?? '';

  const rosterQuery = useQuery({
    queryKey: ['ticketRoster', ticketId],
    queryFn: () => fetchTicketRoster(ticketId),
    // 组织者打开详情且是在管活动时才拉名单
    enabled: open && canManage && !!ticketId,
  });
  const statsQuery = useQuery({
    queryKey: ['ticketCheckInStats', ticketId],
    queryFn: () => fetchTicketCheckInStats(ticketId),
    enabled: open && canManage && !!ticketId,
  });

  const roster: TicketRosterEntry[] = rosterQuery.data ?? [];
  const stats = statsQuery.data ?? { issued: 0, checkedIn: 0 };

  const handleExportRoster = useCallback(() => {
    if (roster.length === 0) return;
    const count = exportCsv(roster, [
      { title: '姓名', value: (r) => r.name },
      { title: '学号', value: (r) => r.student_id },
      { title: '领票时间', value: (r) => formatDateTime(r.grabbed_at) },
      { title: '签到状态', value: (r) => (r.checked_in_at ? '已签到' : '未签到') },
      { title: '签到时间', value: (r) => (r.checked_in_at ? formatDateTime(r.checked_in_at) : '') },
    ], `签到名单_${ticket?.title ?? ''}`);
    if (count > 0) message.success(`已导出 ${count} 条`);
  }, [roster, ticket]);

  if (!ticket) return null;

  const remaining = ticket.remaining_count ?? 0;
  const claimed = Math.max(0, ticket.total_count - remaining);
  const percent = ticket.total_count > 0 ? Math.round((claimed / ticket.total_count) * 100) : 0;
  const isOpen = new Date(ticket.open_time) <= new Date();
  const soldOut = remaining <= 0;

  const description = (
    <div>
      <div className={styles.detailCover}><GiftOutlined /></div>

      <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
        <Descriptions.Item label="活动时间">{formatDateTime(ticket.event_time)}</Descriptions.Item>
        <Descriptions.Item label="开抢时间">{formatDateTime(ticket.open_time)}</Descriptions.Item>
        <Descriptions.Item label="发布者">{ticket.creator_name ?? '未知'}</Descriptions.Item>
        <Descriptions.Item label="每人限抢">{ticket.per_user_limit} 张</Descriptions.Item>
      </Descriptions>

      <div className={styles.detailProgress}>
        <div className={styles.detailProgressLabel}>
          <span>{soldOut ? '已售罄' : `剩余 ${remaining} / ${ticket.total_count}`}</span>
          <span style={{ color: token.colorTextTertiary }}>已领 {claimed} 张</span>
        </div>
        <Progress
          percent={100 - percent}
          showInfo={false}
          strokeColor={soldOut ? token.colorError : token.colorPrimary}
          size="small"
        />
      </div>

      <div className={styles.detailSection}>
        <div className={styles.detailSectionTitle}>活动说明</div>
        <div className={styles.detailText}>{ticket.description || '发布者未填写活动说明。'}</div>
      </div>

      <Space style={{ marginTop: 16 }} wrap>
        {isOpen ? (
          grabbed ? (
            <Button type="primary" icon={<QrcodeOutlined />} onClick={onOpenMyTickets}>
              查看我的签到码
            </Button>
          ) : (
            <Button type="primary" disabled={!canGrab || soldOut} onClick={() => onGrab(ticket)}>
              {soldOut ? '已售罄' : '抢票'}
            </Button>
          )
        ) : (
          <Tag icon={<ClockCircleOutlined />} color="default">未开抢</Tag>
        )}
        <Button onClick={onOpenMyTickets}>前往「我的票券」</Button>
      </Space>
    </div>
  );

  const rosterPane = rosterQuery.isPending ? (
    <ListSkeleton count={4} />
  ) : roster.length === 0 ? (
    <EmptyState compact title="还没有人领票" description="有人抢到票后会出现在这里" />
  ) : (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Tag color="blue">已领 {stats.issued}</Tag>
        <Tag color="green" icon={<CheckCircleOutlined />}>已签到 {stats.checkedIn}</Tag>
        <Tag color="default">未签到 {Math.max(0, stats.issued - stats.checkedIn)}</Tag>
        <Button size="small" icon={<DownloadOutlined />} onClick={handleExportRoster}>导出名单</Button>
      </Space>
      <Table<TicketRosterEntry>
        dataSource={roster}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: '姓名', dataIndex: 'name' },
          { title: '学号', dataIndex: 'student_id' },
          {
            title: '领票时间', dataIndex: 'grabbed_at',
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '签到', dataIndex: 'checked_in_at',
            render: (v: string | null) =>
              v ? <Tag color="green">{formatDateTime(v)}</Tag> : <Tag color="default">未签到</Tag>,
          },
        ]}
      />
    </>
  );

  const tabItems = canManage
    ? [
        { key: 'info', label: '活动说明', children: description },
        { key: 'roster', label: '签到名单', children: rosterPane },
      ]
    : [{ key: 'info', label: '活动说明', children: description }];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={480}
      title={ticket.title}
      destroyOnHidden
    >
      <Tabs items={tabItems} />
    </Drawer>
  );
}
