import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Modal, Spin, Empty } from 'antd';
import { PlusOutlined, PushpinFilled } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole, formatDateTime } from '../../utils/helpers';
import { NOTICE_TYPES } from '../../utils/constants';
import { fetchNotices, subscribeToNotices } from './noticeService';
import type { Notice } from './noticeService';
import NoticeForm from './NoticeForm';
import styles from './notices.module.css';

export default function NoticeList() {
  const user = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    const data = await fetchNotices(user.department);
    setNotices(data);
    setLoading(false);
  }, [user.department]);

  useEffect(() => {
    loadNotices();
    const unsubscribe = subscribeToNotices(user.department, loadNotices);
    return unsubscribe;
  }, [loadNotices, user.department]);

  const canCreate = hasMinRole(user.role, 'dept_head');

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>📢 部门公告</h2>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
            发布公告
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : notices.length === 0 ? (
        <Empty description="暂无公告" />
      ) : (
        notices.map((notice) => (
          <Card
            key={notice.id}
            className={`${styles.noticeCard} ${notice.is_pinned ? styles.pinnedCard : styles.normalCard}`}
            onClick={() => setExpandedId(expandedId === notice.id ? null : notice.id)}
          >
            <div className={styles.cardHeader}>
              {notice.is_pinned && <PushpinFilled style={{ color: '#e67e22' }} />}
              <Tag>{NOTICE_TYPES[notice.type] ?? '通知'}</Tag>
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
        width={600}
        destroyOnClose
      >
        <NoticeForm
          onSuccess={() => { setShowForm(false); loadNotices(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
