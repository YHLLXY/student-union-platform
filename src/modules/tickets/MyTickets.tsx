import { useState, useEffect, useCallback } from 'react';
import { Tag, Empty, Spin, Button, Popconfirm, message } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { formatDateTime } from '../../utils/helpers';
import { trackEvent } from '../../utils/analytics';
import { fetchMyTickets, refundTicket } from './ticketService';
import type { MyTicket } from './ticketService';
import styles from './tickets.module.css';

export default function MyTickets() {
  const user = useAuth();
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refunding, setRefunding] = useState<string | null>(null);

  const loadMyTickets = useCallback(async () => {
    const data = await fetchMyTickets(user.id);
    setTickets(data);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadMyTickets(); }, [loadMyTickets]);

  const handleRefund = async (t: MyTicket) => {
    setRefunding(t.id);
    const result = await refundTicket(t.id, t.ticket_id, t.event_time);
    setRefunding(null);
    if (result.success) {
      message.success(result.message);
      trackEvent({
        event_type: 'ticket_action',
        userId: user.id,
        module: 'tickets',
        action: 'refunded',
        metadata: { ticket_id: t.ticket_id },
      });
      loadMyTickets();
    } else {
      message.error(result.message);
    }
  };

  const canRefund = (eventTime: string) => {
    if (!eventTime) return false;
    const event = new Date(eventTime);
    const now = new Date();
    const fiveHours = 5 * 60 * 60 * 1000;
    return event.getTime() - now.getTime() > fiveHours;
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  if (tickets.length === 0) {
    return <Empty description="你还没有抢到票" />;
  }

  return (
    <div>
      {tickets.map((t) => {
        const refundable = canRefund(t.event_time);
        return (
          <div key={t.id} className={styles.myTicketItem}>
            <div>
              <div style={{ fontWeight: 500 }}>{t.ticket_title}</div>
              <div style={{ fontSize: 12, color: '#95a5a6' }}>
                {t.event_time && `活动时间：${formatDateTime(t.event_time)} · `}
                抢票时间：{formatDateTime(t.grabbed_at)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Tag color="green">已抢到</Tag>
              {refundable ? (
                <Popconfirm
                  title="确认退票？"
                  onConfirm={() => handleRefund(t)}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button size="small" danger loading={refunding === t.id}>
                    退票
                  </Button>
                </Popconfirm>
              ) : (
                <Tag color="default" title="距活动开始不足 5 小时，无法退票">不可退</Tag>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
