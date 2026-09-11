import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Tag, Button, Tabs, Modal, message, Grid } from 'antd';
import { PlusOutlined, ClockCircleOutlined, GiftOutlined, ReloadOutlined, QrcodeOutlined, FileTextOutlined } from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { CardStreamSkeleton } from '@/components/SkeletonBlocks';
import { EmptyState } from '@/components/common';
import { hasMinRole, formatDateTime } from '@/utils/helpers';
import { trackEvent } from '@/utils/analytics';
import { fetchTickets, grabTicket, subscribeToTickets, fetchMyGrabbedIds } from './ticketService';
import type { Ticket } from './ticketService';
import TicketForm from './TicketForm';
import MyTickets from './MyTickets';
import TicketDetailDrawer from './TicketDetailDrawer';
import CheckInScanner from './CheckInScanner';
import styles from './tickets.module.css';

export default function TicketList() {
  const user = useAuth();
  const { md } = Grid.useBreakpoint();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('available');
  // 详情用 Drawer（不改路由）；签到码由「我的票券」自己弹出，这里只负责切 Tab
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // 票务列表 + 已抢 ID 一次拉齐
  const ticketsQuery = useQuery({
    queryKey: ['tickets', user.id],
    queryFn: async () => {
      const [data, ids] = await Promise.all([
        fetchTickets(),
        fetchMyGrabbedIds(user.id),
      ]);
      return { tickets: data, grabbedIds: ids };
    },
  });

  const tickets = ticketsQuery.data?.tickets ?? [];
  const grabbedIds = ticketsQuery.data?.grabbedIds ?? new Set<string>();

  const loadTickets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  }, [queryClient]);

  // Realtime：票务变更（新票/他人抢票）→ 刷新剩余数
  useEffect(() => {
    const unsubscribe = subscribeToTickets(loadTickets);
    return unsubscribe;
  }, [loadTickets]);

  const handleGrab = useCallback(async (ticket: Ticket) => {
    const result = await grabTicket(ticket.id, user.id, user.student_id, user.name);
    if (result.success) {
      message.success(result.message);
      trackEvent({
        event_type: 'ticket_action',
        userId: user.id,
        module: 'tickets',
        action: 'grabbed',
        metadata: { ticket_id: ticket.id, ticket_title: ticket.title?.slice(0, 50) ?? '' },
      });
      loadTickets();
    } else {
      message.error(result.message);
    }
  }, [user.id, user.student_id, user.name, loadTickets]);

  const canCreate = hasMinRole(user.role, 'dept_head');

  const detailTicket = useMemo(
    () => (detailTicketId ? tickets.find((t) => t.id === detailTicketId) ?? null : null),
    [tickets, detailTicketId],
  );

  /** 签到成功后刷新名单/统计与我的票券（扫码窗口可连续签多人） */
  const handleCheckedIn = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['ticketRoster'] });
    queryClient.invalidateQueries({ queryKey: ['ticketCheckInStats'] });
    queryClient.invalidateQueries({ queryKey: ['myTickets'] });
  }, [queryClient]);

  const tabItems = useMemo(() => [
    {
      key: 'available',
      label: '可抢票务',
      children: ticketsQuery.isPending ? (
        <CardStreamSkeleton />
      ) : ticketsQuery.isError ? (
        <div style={{ paddingTop: 40 }}>
          <EmptyState
            icon={<ReloadOutlined />}
            title="票务加载失败"
            description="网络异常或服务暂时不可用，请稍后重试"
            action={
              <Button type="primary" onClick={() => ticketsQuery.refetch()}>重新加载</Button>
            }
          />
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState compact icon={<GiftOutlined />} title="暂无可抢票务" description="有新活动上线时会出现在这里" />
      ) : (
        <div className={styles.ticketGrid}>
          {tickets.map((ticket, i) => {
            const isOpen = new Date(ticket.open_time) <= new Date();
            const soldOut = (ticket.remaining_count ?? 0) <= 0;
            const alreadyGrabbed = grabbedIds.has(ticket.id);
const canGrab = isOpen && !soldOut && !alreadyGrabbed;

            return (
              <Card
                key={ticket.id}
                style={{ animation: `fadeInUp var(--dur-slow) var(--ease-enter) ${Math.min(i * 0.06, 0.42)}s backwards` }}
                className={styles.ticketCard}
              >
                <div className={styles.cardCover}><GiftOutlined /></div>
                <div className={styles.cardBody}>
                  <div className={styles.cardTitle}>{ticket.title}</div>
                  <div className={styles.cardMeta}>
                    <span>活动：{formatDateTime(ticket.event_time)}</span>
                    <span>开抢：{formatDateTime(ticket.open_time)}</span>
                    <span>发布者：{ticket.creator_name}</span>
                    <span>每人限抢 {ticket.per_user_limit} 张</span>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <span className={`${styles.remaining} ${soldOut ? styles.remainingZero : ''}`}>
                    {soldOut ? '已售罄' : `剩余 ${ticket.remaining_count}/${ticket.total_count}`}
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Button size="small" type="text" icon={<FileTextOutlined />} onClick={() => setDetailTicketId(ticket.id)}>
                      详情
                    </Button>
                    {isOpen ? (
                      alreadyGrabbed ? (
                        <Tag color="blue">已抢票</Tag>
                      ) : (
                        <Button
                          type="primary"
                          size="small"
                          disabled={!canGrab}
                          onClick={() => handleGrab(ticket)}
                        >
                          {soldOut ? '已售罄' : '抢票'}
                        </Button>
                      )
                    ) : (
                      <Tag icon={<ClockCircleOutlined />} color="default">未开抢</Tag>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ),
    },
    {
      key: 'my',
      label: '我的票券',
      children: <MyTickets />,
    },
  ], [ticketsQuery, tickets, grabbedIds, handleGrab]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>活动抢票</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {canCreate && (
            <Button icon={<QrcodeOutlined />} onClick={() => setScanOpen(true)}>
              扫码签到
            </Button>
          )}
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
              发布票务
            </Button>
          )}
        </div>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <TicketDetailDrawer
        open={!!detailTicket}
        ticket={detailTicket}
        canManage={canCreate}
        grabbed={detailTicket ? grabbedIds.has(detailTicket.id) : false}
        canGrab={
          !!detailTicket
          && new Date(detailTicket.open_time) <= new Date()
          && (detailTicket.remaining_count ?? 0) > 0
          && !grabbedIds.has(detailTicket.id)
        }
        onGrab={handleGrab}
        onOpenMyTickets={() => { setDetailTicketId(null); setActiveTab('my'); }}
        onClose={() => setDetailTicketId(null)}
      />

      {canCreate && (
        <CheckInScanner
          open={scanOpen}
          onCheckedIn={handleCheckedIn}
          onClose={() => setScanOpen(false)}
        />
      )}

      <Modal
        open={showForm}
        onCancel={() => setShowForm(false)}
        footer={null}
        width={md ? 600 : undefined}
        destroyOnHidden
      >
        <TicketForm
          onSuccess={() => { setShowForm(false); loadTickets(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
