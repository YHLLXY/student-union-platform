import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Modal, Form, Input, Select, DatePicker, message, Grid, theme } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusOutlined, PushpinFilled, FileTextOutlined, EyeOutlined, BellOutlined } from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { CardStreamSkeleton } from '@/components/SkeletonBlocks';
import { EmptyState, PageHeader } from '@/components/common';
import supabase from '@/supabaseClient';
import { hasMinRole, formatDateTime } from '@/utils/helpers';
import { trackEvent } from '@/utils/analytics';
import { NOTICE_TYPES, TASK_STATUSES } from '@/utils/constants';
import { fetchNotices, subscribeToNotices, fetchLinkedTaskInfos, createTaskFromNotice, markNoticeRead, fetchNoticeReaders } from './noticeService';
import type { Notice } from './noticeService';
import NoticeForm from './NoticeForm';
import FileList from '@/components/FileList';
import styles from './notices.module.css';

export default function NoticeList() {
  const { token } = theme.useToken();
  const user = useAuth();
  const { md } = Grid.useBreakpoint();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<Notice | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertForm] = Form.useForm();
  const [readersModal, setReadersModal] = useState<{ open: boolean; noticeId: string; readers: { read: { id: string; name: string }[]; unread: { id: string; name: string }[] } } | null>(null);

  // 公告列表 + 已读统计 + 关联任务（单查询聚合，贴近真实渲染所需）
  const noticesQuery = useQuery({
    queryKey: ['notices', user.department, user.id],
    queryFn: async () => {
      const data = await fetchNotices(user.department);
      const ids = data.map((n) => n.id);

      const [allReads, deptCount, allTaskIds] = await Promise.all([
        ids.length > 0
          ? supabase.from('notice_reads').select('notice_id, user_id').in('notice_id', ids)
          : Promise.resolve({ data: [] as { notice_id: string; user_id: string }[], count: null }),
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('department', user.department)
          .neq('role', 'removed'),
        [...new Set(data.flatMap((n) => n.linked_tasks ?? []))],
      ]);

      const total = deptCount.count ?? 0;
      const readMap: Record<string, number> = {};
      const myReadSet = new Set<string>();
      for (const r of allReads.data ?? []) {
        readMap[r.notice_id] = (readMap[r.notice_id] || 0) + 1;
        if (r.user_id === user.id) myReadSet.add(r.notice_id);
      }
      const stats: Record<string, { read: number; total: number }> = {};
      for (const nid of ids) stats[nid] = { read: readMap[nid] ?? 0, total };

      const infos = allTaskIds.length > 0 ? await fetchLinkedTaskInfos(allTaskIds) : [];
      const linkedMap: Record<string, typeof infos> = {};
      for (const n of data) {
        if (n.linked_tasks && n.linked_tasks.length > 0) {
          linkedMap[n.id] = infos.filter((t) => n.linked_tasks!.includes(t.id));
        }
      }

      return { notices: data, readStats: stats, myReadIds: myReadSet, linkedTasks: linkedMap };
    },
  });

  const notices = noticesQuery.data?.notices ?? [];
  const readStats = noticesQuery.data?.readStats ?? {};
  const myReadIds = noticesQuery.data?.myReadIds ?? new Set<string>();
  const linkedTasks = noticesQuery.data?.linkedTasks ?? {};
  const loading = noticesQuery.isPending;

  const loadNotices = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notices'] });
  }, [queryClient]);

  // Realtime：新公告 → 刷新列表
  useEffect(() => {
    const unsubscribe = subscribeToNotices(user.department, loadNotices);
    return unsubscribe;
  }, [user.department, loadNotices]);

  const canCreate = hasMinRole(user.role, 'dept_head');

  const handleExpand = async (noticeId: string) => {
    const isCurrentlyExpanded = expandedId === noticeId;
    setExpandedId(isCurrentlyExpanded ? null : noticeId);
    // 展开时标记已读
    if (!isCurrentlyExpanded && !myReadIds.has(noticeId)) {
      // 乐观更新：直接写查询缓存，避免整页重取
      queryClient.setQueryData<{
        notices: Notice[];
        readStats: Record<string, { read: number; total: number }>;
        myReadIds: Set<string>;
        linkedTasks: Record<string, { id: string; title: string; status: string; assignee_name?: string }[]>;
      }>(['notices', user.department, user.id], (old) => {
        if (!old) return old;
        const cur = old.readStats[noticeId];
        return {
          ...old,
          readStats: { ...old.readStats, [noticeId]: { read: (cur?.read ?? 0) + 1, total: cur?.total ?? 0 } },
          myReadIds: new Set(old.myReadIds).add(noticeId),
        };
      });
      markNoticeRead(noticeId, user.id).catch(() => {});
      trackEvent({
        event_type: 'notice_read',
        userId: user.id,
        module: 'notices',
        action: 'read',
        metadata: { notice_id: noticeId },
      });
    }
  };

  const handleShowReaders = async (noticeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canCreate) return; // 仅 dept_head+ 可查看具体已读/未读人名单
    const readers = await fetchNoticeReaders(noticeId, user.department).catch(() => null);
    if (!readers) { message.error('获取已读名单失败'); return; }
    setReadersModal({ open: true, noticeId, readers });
  };

  return (
    <div>
      <PageHeader
        icon={<BellOutlined />}
        title="部门公告"
        subtitle="部门内部的通知、会议纪要与活动安排"
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
            发布公告
          </Button>
        )}
      />

      {loading ? (
        <CardStreamSkeleton />
      ) : notices.length === 0 ? (
        <EmptyState
          icon={<BellOutlined />}
          title="暂无公告"
          description={canCreate ? '点击右上角「发布公告」发布第一条公告' : '部门发布的新公告会出现在这里'}
        />
      ) : (
        notices.map((notice, i) => (
          <Card
            key={notice.id}
            style={{ animation: `fadeInUp var(--dur-slow) var(--ease-enter) ${Math.min(i * 0.06, 0.42)}s backwards` }}
            className={`${styles.noticeCard} ${notice.is_pinned ? styles.pinnedCard : styles.normalCard} ${myReadIds.has(notice.id) ? styles.readCard : ''}`}
            onClick={() => handleExpand(notice.id)}
          >
            <div className={styles.cardHeader}>
              {notice.is_pinned && <PushpinFilled style={{ color: token.colorWarning }} />}
              <Tag>{NOTICE_TYPES[notice.type] ?? '通知'}</Tag>
              {notice.linked_tasks && notice.linked_tasks.length > 0 && (
                <Tag color="orange" style={{ fontSize: 11 }}>🔗 {notice.linked_tasks.length} 个关联任务</Tag>
              )}
              <span className={`${styles.cardTitle} ${myReadIds.has(notice.id) ? styles.readTitle : ''}`}>{notice.title}</span>
            </div>
            <div className={styles.cardMeta}>
              {notice.creator_name} · {formatDateTime(notice.created_at)}
              {readStats[notice.id] && (
                <span
                  className={styles.readCount}
                  style={canCreate ? {} : { cursor: 'default' }}
                  onClick={canCreate ? (e) => handleShowReaders(notice.id, e) : undefined}
                  title={canCreate ? '点击查看已读/未读名单' : undefined}
                >
                  <EyeOutlined style={{ marginRight: 2 }} />
                  {readStats[notice.id].read}/{readStats[notice.id].total}
                </span>
              )}
            </div>
            {expandedId === notice.id && (
              <div className={styles.cardContent}>
                {notice.content || '暂无详细内容'}
                <FileList attachments={notice.attachments} />
                {linkedTasks[notice.id] && linkedTasks[notice.id].length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                    <p style={{ fontWeight: 500, marginBottom: 8, fontSize: 14 }}>🔗 关联任务</p>
                    {linkedTasks[notice.id].map((t) => {
                      const st = TASK_STATUSES[t.status] ?? TASK_STATUSES.pending;
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Tag color={st.color} style={{ fontSize: 11 }}>{st.label}</Tag>
                          <span style={{ fontSize: 14 }}>{t.title}</span>
                          {t.assignee_name && (
                            <span style={{ fontSize: 12, color: token.colorTextSecondary }}>— {t.assignee_name}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {canCreate && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}`, textAlign: 'right' }}>
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
        width={md ? 600 : undefined}
        destroyOnHidden
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
        width={md ? 500 : undefined}
        destroyOnHidden
      >
        <div>
          <h3 style={{ marginBottom: 16 }}>从公告创建任务</h3>
          {convertTarget && (
            <>
              <p style={{ fontSize: 13, color: token.colorTextSecondary, marginBottom: 16 }}>
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
                      { value: 'normal', label: '普通' },
                      { value: 'important', label: '重要' },
                      { value: 'urgent', label: '紧急' },
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

      {/* 已读/未读名单弹窗 */}
      <Modal
        open={readersModal?.open ?? false}
        onCancel={() => setReadersModal(null)}
        footer={null}
        width={md ? 420 : undefined}
        title="📊 已读确认详情"
        destroyOnHidden
      >
        {readersModal && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 500, color: token.colorSuccess, marginBottom: 4 }}>
                ✅ 已读 ({readersModal.readers.read.length} 人)
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {readersModal.readers.read.length === 0 ? (
                  <span style={{ color: token.colorTextQuaternary, fontSize: 13 }}>暂无</span>
                ) : (
                  readersModal.readers.read.map((u) => (
                    <Tag key={u.id} color="green">{u.name}</Tag>
                  ))
                )}
              </div>
            </div>
            <div>
              <p style={{ fontWeight: 500, color: token.colorWarning, marginBottom: 4 }}>
                ⏳ 未读 ({readersModal.readers.unread.length} 人)
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {readersModal.readers.unread.length === 0 ? (
                  <span style={{ color: token.colorTextQuaternary, fontSize: 13 }}>全部已读</span>
                ) : (
                  readersModal.readers.unread.map((u) => (
                    <Tag key={u.id} color="orange">{u.name}</Tag>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
