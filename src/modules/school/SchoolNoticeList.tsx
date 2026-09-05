import { useState, useEffect } from 'react';
import { Card, Tag, Button, Modal, Grid, theme } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusOutlined, PushpinFilled, BankOutlined } from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { CardStreamSkeleton } from '@/components/SkeletonBlocks';
import { EmptyState, PageHeader } from '@/components/common';
import { hasMinRole, formatDateTime } from '@/utils/helpers';
import { fetchSchoolNotices, subscribeToSchoolNotices } from './schoolService';
import SchoolNoticeForm from './SchoolNoticeForm';
import styles from './school.module.css';

export default function SchoolNoticeList() {
  const { token } = theme.useToken();
  const { md } = Grid.useBreakpoint();
  const user = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const noticesQuery = useQuery({
    queryKey: ['schoolNotices'],
    queryFn: fetchSchoolNotices,
  });

  const notices = noticesQuery.data ?? [];
  const loadNotices = () => queryClient.invalidateQueries({ queryKey: ['schoolNotices'] });

  // Realtime：新校讯 → 刷新列表
  useEffect(() => {
    const unsubscribe = subscribeToSchoolNotices(loadNotices);
    return unsubscribe;
  }, []);

  const canCreate = hasMinRole(user.role, 'presidium');

  return (
    <div>
      <PageHeader
        icon={<BankOutlined />}
        title="学校信息"
        subtitle="校级通知与重要安排"
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
            发布校讯
          </Button>
        )}
      />

      {noticesQuery.isPending ? (
        <CardStreamSkeleton />
      ) : noticesQuery.isError ? (
        <EmptyState
          icon={<BankOutlined />}
          title="加载失败"
          description="网络异常或服务暂时不可用，请稍后重试"
          action={<Button type="primary" onClick={() => noticesQuery.refetch()}>重新加载</Button>}
        />
      ) : notices.length === 0 ? (
        <EmptyState
          icon={<BankOutlined />}
          title="暂无校级通知"
          description="学校发布的最新通知会出现在这里"
        />
      ) : (
        notices.map((notice) => (
          <Card
            key={notice.id}
            className={`${styles.noticeCard} ${notice.is_pinned ? styles.pinnedCard : styles.normalCard}`}
            onClick={() => setExpandedId(expandedId === notice.id ? null : notice.id)}
          >
            <div className={styles.cardHeader}>
              {notice.is_pinned && <PushpinFilled style={{ color: token.colorError }} />}
              <Tag color="red">校级</Tag>
              <span className={styles.cardTitle}>{notice.title}</span>
            </div>
            <div className={styles.cardMeta}>
              {notice.creator_name} · {formatDateTime(notice.created_at)}
            </div>
            {expandedId === notice.id && (
              <div className={styles.cardContent}>{notice.content || '暂无详细内容'}</div>
            )}
          </Card>
        ))
      )}

      <Modal
        open={showForm}
        onCancel={() => setShowForm(false)}
        footer={null}
        width={md ? 600 : undefined}
        destroyOnHidden
      >
        <SchoolNoticeForm
          onSuccess={() => { setShowForm(false); loadNotices(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
