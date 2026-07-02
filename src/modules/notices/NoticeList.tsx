import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Modal, Spin, Empty, Form, Input, Select, DatePicker, message } from 'antd';
import { PlusOutlined, PushpinFilled, FileTextOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole, formatDateTime } from '../../utils/helpers';
import { NOTICE_TYPES, TASK_STATUSES } from '../../utils/constants';
import { fetchNotices, subscribeToNotices, fetchLinkedTaskInfos, createTaskFromNotice } from './noticeService';
import type { Notice } from './noticeService';
import NoticeForm from './NoticeForm';
import styles from './notices.module.css';

export default function NoticeList() {
  const user = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkedTasks, setLinkedTasks] = useState<Record<string, { id: string; title: string; status: string; assignee_name?: string }[]>>({});
  const [convertTarget, setConvertTarget] = useState<Notice | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertForm] = Form.useForm();

  const loadNotices = useCallback(async () => {
    const data = await fetchNotices(user.department);
    setNotices(data);
    setLoading(false);
    const allTaskIds = [...new Set(data.flatMap((n) => n.linked_tasks ?? []))];
    if (allTaskIds.length > 0) {
      const infos = await fetchLinkedTaskInfos(allTaskIds);
      const map: Record<string, typeof infos> = {};
      for (const n of data) {
        if (n.linked_tasks && n.linked_tasks.length > 0) {
          map[n.id] = infos.filter((t) => n.linked_tasks!.includes(t.id));
        }
      }
      setLinkedTasks(map);
    }
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
              {notice.linked_tasks && notice.linked_tasks.length > 0 && (
                <Tag color="orange" style={{ fontSize: 11 }}>🔗 {notice.linked_tasks.length} 个关联任务</Tag>
              )}
              <span className={styles.cardTitle}>{notice.title}</span>
            </div>
            <div className={styles.cardMeta}>
              {notice.creator_name} · {formatDateTime(notice.created_at)}
            </div>
            {expandedId === notice.id && (
              <div className={styles.cardContent}>
                {notice.content || '暂无详细内容'}
                {linkedTasks[notice.id] && linkedTasks[notice.id].length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                    <p style={{ fontWeight: 500, marginBottom: 8, fontSize: 14 }}>🔗 关联任务</p>
                    {linkedTasks[notice.id].map((t) => {
                      const st = TASK_STATUSES[t.status] ?? TASK_STATUSES.pending;
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Tag color={st.color} style={{ fontSize: 11 }}>{st.label}</Tag>
                          <span style={{ fontSize: 14 }}>{t.title}</span>
                          {t.assignee_name && (
                            <span style={{ fontSize: 12, color: '#7f8c8d' }}>— {t.assignee_name}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {canCreate && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                    <Button
                      icon={<FileTextOutlined />}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConvertTarget(notice);
                        convertForm.resetFields();
                        convertForm.setFieldsValue({
                          title: notice.title,
                          priority: 'normal',
                        });
                      }}
                    >
                      转为任务
                    </Button>
                  </div>
                )}
              </div>
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

      <Modal
        open={!!convertTarget}
        onCancel={() => setConvertTarget(null)}
        footer={null}
        width={500}
        destroyOnClose
      >
        <div>
          <h3 style={{ marginBottom: 16 }}>📋 从公告创建任务</h3>
          {convertTarget && (
            <>
              <p style={{ fontSize: 13, color: '#7f8c8d', marginBottom: 16 }}>
                来源公告：{convertTarget.title}
              </p>
              <Form
                form={convertForm}
                layout="vertical"
                onFinish={async (values: {
                  title: string;
                  priority: string;
                  deadline: unknown;
                  assigned_to?: string;
                }) => {
                  setConvertLoading(true);
                  const result = await createTaskFromNotice({
                    title: values.title,
                    priority: values.priority,
                    assigned_department: user.department,
                    assigned_to: values.assigned_to || null,
                    deadline: (values.deadline as { toISOString?: () => string } | null)?.toISOString?.() ?? null,
                    created_by: user.id,
                    linked_notice_id: convertTarget.id,
                  });
                  setConvertLoading(false);
                  if (result.success) {
                    message.success('任务创建成功');
                    setConvertTarget(null);
                    loadNotices();
                  } else {
                    message.error(result.error ?? '创建失败');
                  }
                }}
              >
                <Form.Item name="title" label="任务标题" rules={[{ required: true }]}>
                  <Input placeholder="任务标题" maxLength={100} />
                </Form.Item>
                <Form.Item name="priority" label="优先级" initialValue="normal">
                  <Select
                    options={[
                      { value: 'normal', label: '🔵 普通' },
                      { value: 'important', label: '🟠 重要' },
                      { value: 'urgent', label: '🔴 紧急' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="deadline" label="截止时间" rules={[{ required: true, message: '请选择截止时间' }]}>
                  <DatePicker showTime style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                  <Button onClick={() => setConvertTarget(null)} style={{ marginRight: 8 }}>取消</Button>
                  <Button type="primary" htmlType="submit" loading={convertLoading}>创建任务</Button>
                </Form.Item>
              </Form>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
