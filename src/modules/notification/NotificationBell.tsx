import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Popover, Drawer, Grid, Tabs, Switch, Button } from 'antd';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import {
  BellOutlined, FileAddOutlined, CheckCircleOutlined, RollbackOutlined,
  MessageOutlined, NotificationOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthContext';
import { EmptyState } from '@/components/common';
import { ListSkeleton } from '@/components/SkeletonBlocks';
import { formatDateTime } from '@/utils/helpers';
import {
  fetchNotifications,
  fetchNotificationCounts,
  fetchUnreadCount,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
} from './notificationService';
import type { Notification, NotificationCategory, NotificationCounts, NotificationPage } from './notificationService';
import styles from './notification.module.css';

/** 通知类型 → 图标映射（图标由主题 token 着色，数据层只存纯文本） */
const TYPE_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  task_assigned: { icon: <FileAddOutlined />, color: '#3498db' },
  submission_approved: { icon: <CheckCircleOutlined />, color: '#27ae60' },
  submission_rejected: { icon: <RollbackOutlined />, color: '#e67e22' },
  forum_reply: { icon: <MessageOutlined />, color: '#8e44ad' },
  new_notice: { icon: <NotificationOutlined />, color: '#1a6ea0' },
  milestone_overdue: { icon: <WarningOutlined />, color: '#e74c3c' },
};

const CATEGORY_TABS: { key: NotificationCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'tasks', label: '任务' },
  { key: 'notices', label: '公告' },
  { key: 'forum', label: '论坛' },
  { key: 'system', label: '系统' },
];

/** 分页结果带上本次偏移，供 getNextPageParam 推导下一页起点 */
type PagedNotificationPage = NotificationPage & { offset: number };

/** 同类聚合组：连续的「同类型 + 同跳转目标」通知合并为一条展示 */
interface NotifGroup {
  key: string;
  type: string;
  relatedLink: string | null;
  items: Notification[];
}

/** 把时间倒序的列表按「连续同类同目标」切组（顺序不连续的不合并，避免误导） */
function groupConsecutive(items: Notification[]): NotifGroup[] {
  const groups: NotifGroup[] = [];
  for (const n of items) {
    const last = groups[groups.length - 1];
    if (last && last.type === n.type && last.relatedLink === n.related_link) {
      last.items.push(n);
    } else {
      groups.push({ key: n.id, type: n.type, relatedLink: n.related_link, items: [n] });
    }
  }
  return groups;
}

export default function NotificationBell() {
  const user = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const [category, setCategory] = useState<NotificationCategory>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  /** 展开查看全部分组的组 key（默认只显示最新一条 + 「共 N 条」） */
  const [expanded, setExpanded] = useState<string[]>([]);
  const prevCountRef = useRef(0);
  const { md } = Grid.useBreakpoint();

  const listKey = ['notifications', user.id, category, unreadOnly] as const;

  // 铃铛角标：常驻的唯一一条请求（head 计数，走 is_read=false 的部分索引）
  const unreadQuery = useQuery({
    queryKey: ['notificationUnread', user.id],
    queryFn: () => fetchUnreadCount(user.id),
    // 角标是环境提示，失败静默保持上次值
    throwOnError: false,
  });

  // 分页列表（每页 20 条，「加载更多」续取）——面板打开才拉，避免每次进应用都白跑
  const listQuery = useInfiniteQuery({
    queryKey: listKey,
    enabled: open,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = await fetchNotifications(user.id, {
        category,
        unreadOnly,
        offset: pageParam,
      });
      return { ...page, offset: pageParam };
    },
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
  });

  // 各栏条数（Tab 角标）；同样等面板打开再拉
  const countsQuery = useQuery({
    queryKey: ['notificationCounts', user.id],
    queryFn: () => fetchNotificationCounts(user.id),
    enabled: open,
  });

  const notifications = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [listQuery.data],
  );
  const counts = countsQuery.data;
  const unreadCount = unreadQuery.data ?? 0;
  const loading = listQuery.isPending;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notificationCounts'] });
    queryClient.invalidateQueries({ queryKey: ['notificationUnread'] });
  }, [queryClient]);

  // Realtime 订阅
  useEffect(() => {
    const unsubscribe = subscribeToNotifications(user.id, refresh);
    return unsubscribe;
  }, [user.id, refresh]);

  // 切栏 / 切只看未读时收起展开态（组 key 已变，留着会错位）
  useEffect(() => {
    setExpanded([]);
  }, [category, unreadOnly]);

  // Bell 摇晃：新通知到达时触发一次
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), 600);
      prevCountRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  // 面板打开时刷新数据（桌面 + 移动公用）
  const handleOpen = useCallback((visible: boolean) => {
    setOpen(visible);
    if (visible) refresh();
  }, [refresh]);

  /**
   * 乐观置为已读：列表内命中的行标已读；计数侧**只减 unread**——
   * 分栏计数是「该栏总数」，标记已读不改变总数，不该为它多发 5 个计数请求。
   */
  const patchReadLocally = (ids: string[]) => {
    const idSet = new Set(ids);
    queryClient.setQueryData<InfiniteData<PagedNotificationPage>>(listKey, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.map((n) => (idSet.has(n.id) ? { ...n, is_read: true } : n)),
            })),
          }
        : old,
    );
    queryClient.setQueryData<NotificationCounts>(['notificationCounts', user.id], (old) =>
      old ? { ...old, unread: Math.max(0, old.unread - ids.length) } : old,
    );
    queryClient.setQueryData<number>(['notificationUnread', user.id], (old) =>
      old === undefined ? old : Math.max(0, old - ids.length),
    );
  };

  /** 标记一组已读：先本地置位，再落库；失败则整批重取兜底 */
  const handleGroupRead = async (group: NotifGroup) => {
    const unreadIds = group.items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    patchReadLocally(unreadIds);
    const results = await Promise.all(unreadIds.map((id) => markAsRead(id)));
    if (results.some((ok) => !ok)) refresh();
  };

  const handleGroupClick = async (group: NotifGroup) => {
    await handleGroupRead(group);
    const link = group.items[0].related_link;
    if (link) {
      setOpen(false);
      navigate(link);
    }
  };

  const handleMarkAllRead = async () => {
    const ok = await markAllAsRead(user.id, category);
    if (ok) refresh();
  };

  const groups = useMemo(() => groupConsecutive(notifications), [notifications]);
  const hasUnreadInView = notifications.some((n) => !n.is_read);

  // 图表渲染（桌面 Popover + 移动 Drawer 共用）
  const toggleExpand = (key: string) =>
    setExpanded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const renderItem = (n: Notification, nested: boolean, onClick: () => void) => (
    <div
      key={n.id}
      role="button"
      tabIndex={0}
      className={`${styles.notifItem} ${nested ? styles.notifItemNested : ''} ${!n.is_read ? styles.notifUnread : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className={styles.notifIcon} style={{ color: TYPE_ICON[n.type]?.color }}>
        {TYPE_ICON[n.type]?.icon ?? <BellOutlined />}
      </span>
      <span className={`${styles.notifDot} ${n.is_read ? styles.notifDotRead : ''}`} />
      <div className={styles.notifBody}>
        <div className={styles.notifTitle}>{n.title}</div>
        {n.content && <div className={styles.notifContent}>{n.content}</div>}
        <div className={styles.notifTime}>{formatDateTime(n.created_at)}</div>
      </div>
    </div>
  );

  /** 单条点击：本条置已读 + 跳转 */
  const openSingle = (n: Notification) => {
    handleGroupRead({ key: n.id, type: n.type, relatedLink: n.related_link, items: [n] });
    if (n.related_link) {
      setOpen(false);
      navigate(n.related_link);
    }
  };

  const notifList = (
    <div className={styles.panelList}>
      {loading ? (
        <ListSkeleton count={3} />
      ) : groups.length === 0 ? (
        <EmptyState
          compact
          icon={<BellOutlined />}
          title={unreadOnly ? '没有未读通知' : '暂无通知'}
          description={unreadOnly ? '关掉「只看未读」可以查看历史通知' : '有新任务、公告或回复时会出现在这里'}
        />
      ) : (
        <>
          {groups.map((group) => {
            const isExpanded = expanded.includes(group.key);
            const extra = group.items.length - 1;
            const groupUnread = group.items.filter((n) => !n.is_read).length;
            return (
              <div key={group.key}>
                {renderItem(group.items[0], false, () => handleGroupClick(group))}
                {extra > 0 && (
                  <button
                    type="button"
                    className={styles.groupToggle}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(group.key);
                    }}
                  >
                    {isExpanded ? '收起' : `还有 ${extra} 条同类通知`}
                    {!isExpanded && groupUnread > 1 && `（${groupUnread} 条未读）`}
                  </button>
                )}
                {isExpanded && group.items.slice(1).map((n) => renderItem(n, true, () => openSingle(n)))}
              </div>
            );
          })}
          {listQuery.hasNextPage && (
            <div className={styles.loadMore}>
              <Button
                type="link"
                size="small"
                loading={listQuery.isFetchingNextPage}
                onClick={() => listQuery.fetchNextPage()}
              >
                加载更多
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  /** 分栏 + 只看未读（桌面/移动共用同一份控件） */
  const filters = (
    <div className={styles.panelFilters}>
      <Tabs
        size="small"
        activeKey={category}
        onChange={(k) => setCategory(k as NotificationCategory)}
        tabBarStyle={{ marginBottom: 0 }}
        items={CATEGORY_TABS.map((t) => ({
          key: t.key,
          label: counts ? `${t.label} ${counts[t.key]}` : t.label,
        }))}
      />
      <label className={styles.unreadSwitch}>
        <Switch size="small" checked={unreadOnly} onChange={setUnreadOnly} />
        只看未读
      </label>
    </div>
  );

  const bellTrigger = (
    <span className={`${styles.bell} ${unreadCount > 0 ? styles.bellHasUnread : ''} ${shake ? styles.bellShaking : ''}`}>
      <BellOutlined />
      {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </span>
  );

  // ---- 移动端：Drawer 从右侧滑出 ----
  if (!md) {
    return (
      <>
        <span onClick={() => handleOpen(true)}>
          {bellTrigger}
        </span>
        <Drawer
          title="消息通知"
          open={open}
          onClose={() => setOpen(false)}
          placement="right"
          width="min(380px, 92vw)"
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
          extra={
            hasUnreadInView && (
              <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                {category === 'all' ? '全部已读' : '本栏已读'}
              </button>
            )
          }
        >
          {filters}
          {notifList}
        </Drawer>
      </>
    );
  }

  // ---- 桌面端：Popover 悬浮 ----
  const panel = (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>消息通知</span>
        {hasUnreadInView && (
          <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
            {category === 'all' ? '全部已读' : '本栏已读'}
          </button>
        )}
      </div>
      {filters}
      {notifList}
    </div>
  );

  return (
    <Popover
      content={panel}
      trigger="click"
      open={open}
      onOpenChange={handleOpen}
      placement="bottomRight"
      overlayStyle={{ padding: 0 }}
    >
      {bellTrigger}
    </Popover>
  );
}