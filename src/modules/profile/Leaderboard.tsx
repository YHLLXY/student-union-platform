import { useState, useEffect } from 'react';
import { Spin, Empty, Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole } from '../../utils/helpers';
import { fetchLeaderboard } from './profileService';
import type { LeaderboardEntry } from './profileService';
import styles from './profile.module.css';

const PODIUM_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];
const PODIUM_BG = ['#fffbe6', '#f5f5f5', '#fdf2e9'];
const PODIUM_LABELS = ['🥇', '🥈', '🥉'];

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

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const maxCount = entries.length > 0 ? entries[0].completed : 1;

  return (
    <div className={styles.leaderboardContainer}>
      <div className={styles.leaderboardHeader}>
        <span className={styles.leaderboardTitle}>🏆 本月任务排行</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
      ) : entries.length === 0 ? (
        <Empty description="本月暂无完成记录" />
      ) : (
        <>
          {/* 前三名领奖台 */}
          <div className={styles.podiumRow}>
            {top3.map((e, i) => (
              <div
                key={e.user_id}
                className={styles.podiumCard}
                style={{ background: PODIUM_BG[i] }}
              >
                <div className={styles.podiumMedal}>{PODIUM_LABELS[i]}</div>
                <Avatar
                  size={i === 0 ? 48 : 40}
                  src={e.avatar_url}
                  icon={<UserOutlined />}
                  style={{ border: `2px solid ${PODIUM_COLORS[i]}`, marginBottom: 8 }}
                />
                <div className={styles.podiumName}>{e.name}</div>
                <div className={styles.podiumCount} style={{ color: PODIUM_COLORS[i] }}>
                  {e.completed} 个任务
                </div>
              </div>
            ))}
          </div>

          {/* 第四名及以后 */}
          {rest.length > 0 && (
            <div className={styles.rankList}>
              {rest.map((e) => {
                const isMe = e.user_id === user.id;
                const barWidth = maxCount > 0 ? (e.completed / maxCount) * 100 : 0;
                return (
                  <div
                    key={e.user_id}
                    className={`${styles.rankItem} ${isMe ? styles.rankItemMe : ''}`}
                  >
                    <span className={styles.rankNumber}>{e.rank}</span>
                    <Avatar
                      size={28}
                      src={e.avatar_url}
                      icon={<UserOutlined />}
                      style={{ marginRight: 10, flexShrink: 0 }}
                    />
                    <div className={styles.rankInfo}>
                      <div className={styles.rankName}>
                        {e.name}
                        {isMe && <span className={styles.rankMeTag}>我</span>}
                      </div>
                      <div className={styles.rankBar}>
                        <div
                          className={styles.rankBarFill}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <span className={styles.rankCount}>{e.completed}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
