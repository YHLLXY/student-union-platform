import { useState, useEffect } from 'react';
import { Card, Spin, Tag, Button } from 'antd';
import { BarChartOutlined, RiseOutlined, FallOutlined, TrophyOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { fetchWeeklyBrief, fetchMonthlyReport } from './dashboardService';
import type { WeeklyBrief, MonthlyReport } from './dashboardService';
import ReportModal from './ReportModal';
import styles from './brief.module.css';

export default function WeeklyBriefCard() {
  const user = useAuth();
  const [brief, setBrief] = useState<WeeklyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportData, setReportData] = useState<MonthlyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    fetchWeeklyBrief(user.department, user.role).then((data) => {
      setBrief(data);
      setLoading(false);
    });
  }, [user.department, user.role]);

  // 没有权限或数据加载中
  if (loading) {
    return (
      <Card className={styles.briefCard}>
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      </Card>
    );
  }

  if (!brief) return null; // 无权限，不渲染

  const weekChange = brief.completedLastWeek > 0
    ? Math.round(((brief.completedThisWeek - brief.completedLastWeek) / brief.completedLastWeek) * 100)
    : brief.completedThisWeek > 0
      ? 100
      : 0;

  const overdueRate = brief.totalThisWeek > 0
    ? Math.round((brief.overdueThisWeek / brief.totalThisWeek) * 100)
    : 0;

  const handleOpenReport = async () => {
    setReportOpen(true);
    setReportLoading(true);
    const data = await fetchMonthlyReport(user.department, user.role);
    setReportData(data);
    setReportLoading(false);
  };

  return (
    <>
      <Card className={styles.briefCard}>
        <div className={styles.briefHeader}>
          <span className={styles.briefTitle}>
            <BarChartOutlined style={{ marginRight: 8 }} />
            本周简报
          </span>
          <Tag color="blue">{brief.weekLabel}</Tag>
        </div>

        <div className={styles.briefBody}>
          {/* 本周完成 */}
          <div className={styles.briefStat}>
            <span className={styles.briefStatLabel}>本周完成任务</span>
            <span className={styles.briefStatValue}>
              {brief.completedThisWeek} 个
              {weekChange !== 0 && (
                <span className={weekChange > 0 ? styles.trendUp : styles.trendDown}>
                  {weekChange > 0 ? <RiseOutlined /> : <FallOutlined />}
                  {Math.abs(weekChange)}%
                </span>
              )}
            </span>
          </div>

          {/* 最活跃部门 */}
          {brief.topDepartment && (
            <div className={styles.briefStat}>
              <span className={styles.briefStatLabel}>
                <TrophyOutlined style={{ marginRight: 4, color: '#f39c12' }} />
                最活跃部门
              </span>
              <span className={styles.briefStatValue}>
                {brief.topDepartment.label}
                <Tag color="gold" style={{ marginLeft: 6 }}>{brief.topDepartment.count} 个任务</Tag>
              </span>
            </div>
          )}

          {/* 逾期率 */}
          <div className={styles.briefStat}>
            <span className={styles.briefStatLabel}>当前逾期率</span>
            <span className={styles.briefStatValue}>
              <span style={{ color: overdueRate > 30 ? '#e74c3c' : overdueRate > 10 ? '#e67e22' : '#27ae60' }}>
                {overdueRate}%
              </span>
              <span className={styles.briefStatHint}>
                （{brief.overdueThisWeek} 个逾期 / {brief.totalThisWeek} 个任务）
              </span>
            </span>
          </div>
        </div>

        <div className={styles.briefFooter}>
          <Button type="primary" ghost onClick={handleOpenReport}>
            生成完整简报
          </Button>
        </div>
      </Card>

      <ReportModal
        open={reportOpen}
        loading={reportLoading}
        data={reportData}
        onClose={() => setReportOpen(false)}
        weekBrief={brief}
      />
    </>
  );
}
