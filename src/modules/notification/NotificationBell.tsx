import { useState, useEffect, useCallback } from 'react';
import { Popover, Spin } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { formatDateTime } from '../../utils/helpers';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
} from './notificationService';
import type { Notification } from './notificationService';
import styles from './notification.module.css';

/** 通知类型 → 图标映射 */
const TYPE_ICON: Record<string, string> = {
  task_assigned: '📋',
  submission_approved: '✅',
  submission_rejected: '↩️',
  forum_reply: '💬',
  new_notice: '📢',
  milestone_overdue: '⚠️',
};

export default function NotificationBell() {
  const user = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadData = useCallback(async () => {
    const [list, count] = await Promise.all([
      fetchNotifications(user.id),
      fetchUnreadCount(user.id),
    ]);
    setNotifications(list);
    setUnreadCount(count);
  }, [user.id]);

  // 初次加载 + 面板打开时刷新
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime 订阅新通知
  useEffect(() => {
    const unsubscribe = subscribeToNotifications(user.id, () => {
      loadData();
    });
    return unsubscribe;
  }, [user.id, loadData]);

  const handlePanelOpen = (visible: boolean) => {
    setOpen(visible);
    if (visible) {
      setLoading(true);
      loadData().finally(() => setLoading(false));
    }
  };

  const handleClick = async (notif: Notification) => {
    // 标记已读
    if (!notif.is_read) {
      await markAsRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    // 跳转
    if (notif.related_link) {
      setOpen(false);
      navigate(notif.related_link);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const panel = (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>🔔 消息通知</span>
        {unreadCount > 0 && (
          <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
            全部已读
          </button>
        )}
      </div>
      <div className={styles.panelList}>
        {loading ? (
          <div className={styles.panelLoading}><Spin size="small" /> 加载中...</div>
        ) : notifications.length === 0 ? (
          <div className={styles.panelEmpty}>暂无通知</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`${styles.notifItem} ${!n.is_read ? styles.notifUnread : ''}`}
              onClick={() => handleClick(n)}
            >
              <span className={styles.notifIcon}>{TYPE_ICON[n.type] ?? '🔔'}</span>
              <span
                className={`${styles.notifDot} ${n.is_read ? styles.notifDotRead : ''}`}
              />
              <div className={styles.notifBody}>
                <div className={styles.notifTitle}>{n.title}</div>
                {n.content && <div className={styles.notifContent}>{n.content}</div>}
                <div className={styles.notifTime}>{formatDateTime(n.created_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Popover
      content={panel}
      trigger="click"
      open={open}
      onOpenChange={handlePanelOpen}
      placement="bottomRight"
      overlayStyle={{ padding: 0 }}
      overlayInnerStyle={{ maxWidth: 'calc(100vw - 32px)' }}
    >
      <span className={`${styles.bell} ${unreadCount > 0 ? styles.bellHasUnread : ''}`}>
        <BellOutlined />
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </span>
    </Popover>
  );
}
