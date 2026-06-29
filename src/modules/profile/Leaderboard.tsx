import { useState, useEffect } from 'react';
import { Spin, Empty } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole } from '../../utils/helpers';
import { fetchLeaderboard } from './profileService';
import type { LeaderboardEntry } from './profileService';
import styles from './profile.module.css';

const MEDAL_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

export default function Leaderboard() {
  const user = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const canView = hasMinRole(user.role, 'dept_head');

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    fetchLeaderboard(user.department).then((d) => { setEntries(d); setLoading(false); });
  }, [user.department, canView]);

  if (!canView) return null;

  return (
    <div className={styles.leaderboardContainer}>
      <div className={styles.leaderboardHeader}>
        <span className={styles.leaderboardTitle}>🏆 本月任务排行</span>
      </div>
      {loading ? <Spin /> : entries.length === 0 ? <Empty description="暂无数据" /> : (
        <div className={styles.leaderboardList}>
          {entries.map((e) => (
            <div key={e.user_id} className={styles.leaderboardItem}>
              <span className={styles.leaderboardRank}>
                {e.rank <= 3 ? (
                  <TrophyOutlined style={{ color: MEDAL_COLORS[e.rank - 1], fontSize: 18 }} />
                ) : (
                  <span style={{ color: '#95a5a6', width: 20, textAlign: 'center' }}>{e.rank}</span>
                )}
              </span>
              <span className={styles.leaderboardName} style={e.rank <= 3 ? { fontWeight: 600 } : {}}>
                {e.name}
              </span>
              <span className={styles.leaderboardCount}>{e.completed} 个任务</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
