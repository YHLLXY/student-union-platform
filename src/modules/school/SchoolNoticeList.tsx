import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Modal, Spin, Empty } from 'antd';
import { PlusOutlined, PushpinFilled } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole, formatDateTime } from '../../utils/helpers';
import { fetchSchoolNotices, subscribeToSchoolNotices } from './schoolService';
import type { SchoolNotice } from './schoolService';
import SchoolNoticeForm from './SchoolNoticeForm';
import styles from './school.module.css';

export default function SchoolNoticeList() {
  const user = useAuth();
  const [notices, setNotices] = useState<SchoolNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    const data = await fetchSchoolNotices();
    setNotices(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotices();
    const unsubscribe = subscribeToSchoolNotices(loadNotices);
    return unsubscribe;
  }, [loadNotices]);

  const canCreate = hasMinRole(user.role, 'presidium');

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>🏫 学校信息</h2>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
            发布校讯
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : notices.length === 0 ? (
        <Empty description="暂无校级通知" />
      ) : (
        notices.map((notice) => (
          <Card
            key={notice.id}
            className={`${styles.noticeCard} ${notice.is_pinned ? styles.pinnedCard : styles.normalCard}`}
            onClick={() => setExpandedId(expandedId === notice.id ? null : notice.id)}
          >
            <div className={styles.cardHeader}>
              {notice.is_pinned && <PushpinFilled style={{ color: '#e74c3c' }} />}
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
        width={600}
        destroyOnClose
      >
        <SchoolNoticeForm
          onSuccess={() => { setShowForm(false); loadNotices(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
