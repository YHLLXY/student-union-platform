import { useState, useEffect } from 'react';
import { Spin, Empty, Popover } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { fetchHeatmapData } from './profileService';
import type { HeatmapDay } from './profileService';
import styles from './profile.module.css';

const LEVEL_COLORS = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'];

export default function Heatmap() {
  const user = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchHeatmapData(user.id, year, month).then((d) => { setData(d); setLoading(false); });
  }, [user.id, year, month]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else { setMonth(month - 1); }
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else { setMonth(month + 1); }
  };

  const firstDay = new Date(year, month - 1, 1).getDay();
  const padded = [...Array(firstDay).fill(null), ...data];

  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  const weekDayLabels = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className={styles.heatmapContainer}>
      <div className={styles.heatmapHeader}>
        <span className={styles.heatmapTitle}>📊 工作量热力图</span>
        <div className={styles.heatmapNav}>
          <LeftOutlined onClick={prevMonth} style={{ cursor: 'pointer' }} />
          <span style={{ margin: '0 8px', fontWeight: 500 }}>{year}年{month}月</span>
          <RightOutlined onClick={nextMonth} style={{ cursor: 'pointer' }} />
        </div>
      </div>

      {loading ? <Spin /> : data.length === 0 ? <Empty description="本月无任务记录" /> : (
        <div className={styles.heatmapGrid}>
          <div className={styles.heatmapLabels}>
            {weekDayLabels.map((d) => (
              <div key={d} className={styles.heatmapLabel}>{d}</div>
            ))}
          </div>
          <div className={styles.heatmapCells}>
            {weeks.map((week, wi) => (
              <div key={wi} className={styles.heatmapWeek}>
                {week.map((day, di) => {
                  const cell = (
                    <div
                      key={di}
                      className={styles.heatmapCell}
                      style={{
                        background: day ? LEVEL_COLORS[day.level] : 'transparent',
                        cursor: day && day.count > 0 ? 'pointer' : 'default',
                      }}
                    />
                  );
                  if (day && day.tasks.length > 0) {
                    const content = (
                      <div style={{ maxWidth: 220 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>
                          {day.date} — {day.count} 次提交
                        </div>
                        {day.tasks.map((t) => (
                          <div key={t.id} style={{ fontSize: 12, padding: '2px 0', borderBottom: '1px solid #f5f5f5' }}>
                            {t.title}
                          </div>
                        ))}
                      </div>
                    );
                    return (
                      <Popover key={di} content={content} title="当日提交" trigger="click">
                        {cell}
                      </Popover>
                    );
                  }
                  return cell;
                })}
              </div>
            ))}
          </div>
          <div className={styles.heatmapLegend}>
            <span>少</span>
            {LEVEL_COLORS.map((c) => (
              <div key={c} className={styles.heatmapLegendCell} style={{ background: c }} />
            ))}
            <span>多</span>
          </div>
        </div>
      )}
    </div>
  );
}
