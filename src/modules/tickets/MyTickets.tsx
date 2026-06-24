import { useState, useEffect, useCallback } from 'react';
import { Tag, Empty, Spin } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { formatDateTime } from '../../utils/helpers';
import { fetchMyTickets } from './ticketService';
import type { MyTicket } from './ticketService';
import styles from './tickets.module.css';

export default function MyTickets() {
  const user = useAuth();
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMyTickets = useCallback(async () => {
    const data = await fetchMyTickets(user.id);
    setTickets(data);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadMyTickets(); }, [loadMyTickets]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  if (tickets.length === 0) {
    return <Empty description="你还没有抢到票" />;
  }

  return (
    <div>
      {tickets.map((t) => (
        <div key={t.id} className={styles.myTicketItem}>
          <div>
            <div style={{ fontWeight: 500 }}>{t.ticket_title}</div>
            <div style={{ fontSize: 12, color: '#95a5a6' }}>
              抢票时间：{formatDateTime(t.grabbed_at)}
            </div>
          </div>
          <Tag color="green">已抢到</Tag>
        </div>
      ))}
    </div>
  );
}
