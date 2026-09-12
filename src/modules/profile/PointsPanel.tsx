import { useState } from 'react';
import { Card, Statistic, Button, Tag, Modal, message, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { TrophyOutlined, DownloadOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useAuth } from '@/components/AuthContext';
import { CountUpNumber, StaggerGroup, StaggerItem } from '@/components/motion';
import { EmptyState } from '@/components/common';
import { ListSkeleton } from '@/components/SkeletonBlocks';
import { formatDateTime, formatSemester } from '@/utils/helpers';
import { exportCsv } from '@/utils/export';
import { fetchMyPoints, getPointsReasonLabel } from './profileService';
import styles from './profile.module.css';

/**
 * 我的积分（A3 考核积分，v4.4.0）
 *
 * 积分由数据库触发器在四个事件上自动记账（审核通过 +2 / 按时提交 +1 /
 * 逾期提交 -1 / 活动签到 +1），前端只读——所以这里没有任何「加分」按钮，
 * 只有明细与导出。
 */
export default function PointsPanel() {
  const { token } = theme.useToken();
  const user = useAuth();
  const [detailOpen, setDetailOpen] = useState(false);

  const pointsQuery = useQuery({
    queryKey: ['myPoints', user.id],
    queryFn: () => fetchMyPoints(user.id),
  });

  const points = pointsQuery.data;
  const entries = points?.entries ?? [];

  const handleExport = () => {
    if (entries.length === 0) return;
    const count = exportCsv(entries, [
      { title: '时间', value: (e) => formatDateTime(e.created_at) },
      { title: '事项', value: (e) => getPointsReasonLabel(e.reason) },
      { title: '积分变化', value: (e) => e.delta },
      { title: '学期', value: (e) => e.semester },
    ], `我的积分_${points?.semester ?? ''}`);
    if (count > 0) message.success(`已导出 ${count} 条明细`);
  };

  return (
    <Card
      className={styles.pointsCard}
      title={
        /* 文字保持整体（nowrap），学期 Tag 是可折行的兄弟节点——
           小屏放不下时整组「我的积分」落到第二行，而不是把文字逐字拆断 */
        <span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <TrophyOutlined style={{ color: token.colorWarning }} />
            我的积分
          </span>
          {points && <Tag color="blue">{formatSemester(points.semester)}</Tag>}
        </span>
      }
      extra={
        <Button
          size="small"
          icon={<UnorderedListOutlined />}
          disabled={entries.length === 0}
          onClick={() => setDetailOpen(true)}
        >
          明细
        </Button>
      }
    >
      {pointsQuery.isPending ? (
        <ListSkeleton count={2} />
      ) : pointsQuery.isError ? (
        <EmptyState
          compact
          title="积分加载失败"
          description="网络异常或服务暂时不可用，请稍后重试"
          action={<Button type="primary" onClick={() => pointsQuery.refetch()}>重新加载</Button>}
        />
      ) : (
        <>
          <div className={styles.pointsSummary}>
            <Statistic
              title="本学期累计"
              value={points?.total ?? 0}
              prefix={<TrophyOutlined style={{ color: token.colorWarning }} />}
              styles={{ content: { color: (points?.total ?? 0) >= 0 ? token.colorSuccess : token.colorError } }}
              formatter={() => <CountUpNumber value={points?.total ?? 0} />}
            />
            <div className={styles.pointsHint}>
              <div>审核通过 +2 · 按时提交 +1</div>
              <div>逾期提交 -1 · 活动签到 +1</div>
              <div style={{ color: token.colorTextTertiary }}>共 {entries.length} 条记录</div>
            </div>
          </div>

          {entries.length === 0 && (
            <EmptyState
              compact
              title="本学期还没有积分记录"
              description="完成任务并通过审核、或参加活动签到后，积分会自动记在这里"
            />
          )}

          {entries.length > 0 && (
            <StaggerGroup className={styles.pointsRecent}>
              {entries.slice(0, 5).map((e) => (
                <StaggerItem key={e.id} className={styles.pointsEntry}>
                  <span className={styles.pointsReason}>{getPointsReasonLabel(e.reason)}</span>
                  <span className={styles.pointsDate}>{formatDateTime(e.created_at)}</span>
                  <span
                    className={styles.pointsDelta}
                    style={{ color: e.delta >= 0 ? token.colorSuccess : token.colorError }}
                  >
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </span>
                </StaggerItem>
              ))}
            </StaggerGroup>
          )}
        </>
      )}

      <Modal
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        title={`我的积分明细 · ${formatSemester(points?.semester ?? '')}`}
        footer={
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={entries.length === 0}>
            导出明细
          </Button>
        }
        width={560}
        destroyOnHidden
      >
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {entries.map((e) => (
            <div key={e.id} className={styles.pointsEntry}>
              <span className={styles.pointsReason}>{getPointsReasonLabel(e.reason)}</span>
              <span className={styles.pointsDate}>{formatDateTime(e.created_at)}</span>
              <span
                className={styles.pointsDelta}
                style={{ color: e.delta >= 0 ? token.colorSuccess : token.colorError }}
              >
                {e.delta > 0 ? `+${e.delta}` : e.delta}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </Card>
  );
}
