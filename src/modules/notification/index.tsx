export { default as NotificationBell } from './NotificationBell';
export {
  fetchNotifications,
  fetchUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  createBatchNotifications,
  fetchDeptMemberIds,
  subscribeToNotifications,
} from './notificationService';
export type { Notification, NotificationType } from './notificationService';
