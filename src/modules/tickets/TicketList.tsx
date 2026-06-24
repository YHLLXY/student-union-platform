import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Tabs, Modal, Spin, Empty, message } from 'antd';
import { PlusOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole, formatDateTime } from '../../utils/helpers';
import { fetchTickets, grabTicket, subscribeToTickets } from './ticketService';
import type { Ticket } from './ticketService';
import TicketForm from './TicketForm';
import MyTickets from './MyTickets';
import styles from './tickets.module.css';

export default function TicketList() {
  const user = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('available');

  const loadTickets = useCallback(async () => {
    const data = await fetchTickets();
    setTickets(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTickets();
    const unsubscribe = subscribeToTickets(loadTickets);
    return unsubscribe;
  }, [loadTickets]);

  const handleGrab = async (ticket: Ticket) => {
    const result = await grabTicket(ticket.id, user.id, user.student_id, user.name);
    if (result.success) {
      message.success(result.message);
      loadTickets();
    } else {
      message.error(result.message);
    }
  };

  const canCreate = hasMinRole(user.role, 'dept_head');

  const tabItems = [
    {
      key: 'available',
      label: '可抢票务',
      children: loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : tickets.length === 0 ? (
        <Empty description="暂无票务" />
      ) : (
        <div className={styles.ticketGrid}>
          {tickets.map((ticket) => {
            const isOpen = new Date(ticket.open_time) <= new Date();
            const soldOut = (ticket.remaining_count ?? 0) <= 0;
            const canGrab = isOpen && !soldOut;

            return (
              <Card key={ticket.id} className={styles.ticketCard}>
                <div className={styles.cardCover}>🎫</div>
                <div className={styles.cardBody}>
                  <div className={styles.cardTitle}>{ticket.title}</div>
                  <div className={styles.cardMeta}>
                    <span>🕐 开抢：{formatDateTime(ticket.open_time)}</span>
                    <span>👤 发布者：{ticket.creator_name}</span>
                    <span>📦 每人限抢 {ticket.per_user_limit} 张</span>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <span className={`${styles.remaining} ${soldOut ? styles.remainingZero : ''}`}>
                    {soldOut ? '已售罄' : `剩余 ${ticket.remaining_count}/${ticket.total_count}`}
                  </span>
                  {isOpen ? (
                    <Button
                      type="primary"
                      size="small"
                      disabled={!canGrab}
                      onClick={() => handleGrab(ticket)}
                    >
                      {soldOut ? '已售罄' : '抢票'}
                    </Button>
                  ) : (
                    <Tag icon={<ClockCircleOutlined />} color="default">未开抢</Tag>
                  )}
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
  ];

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>🎫 活动抢票</h2>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
            发布票务
          </Button>
        )}
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal
        open={showForm}
        onCancel={() => setShowForm(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        <TicketForm
          onSuccess={() => { setShowForm(false); loadTickets(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
