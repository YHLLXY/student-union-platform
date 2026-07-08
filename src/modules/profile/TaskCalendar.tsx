import { useState, useEffect, useMemo } from 'react';
import { Spin, Empty, Popover } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { fetchYearHeatmapData } from './profileService';
import type { YearHeatmapDay } from './profileService';
import styles from './profile.module.css';

const LEVEL_COLORS = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'];
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/** 将 Date → 'YYYY-MM-DD' */
function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function TaskCalendar() {
  const user = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [dataMap, setDataMap] = useState<Record<string, YearHeatmapDay>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchYearHeatmapData(user.id, year).then((days) => {
      const map: Record<string, YearHeatmapDay> = {};
      for (const d of days) map[d.date] = d;
      setDataMap(map);
      setLoading(false);
    });
  }, [user.id, year]);

  // 构建 列(周)×7(日) 网格
  const { weeks, monthCols } = useMemo(() => {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31);

    // 网格从 Jan 1 所在周的周日开始
    const gridStart = new Date(startOfYear);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    // 网格到 Dec 31 所在周的周六结束
    const gridEnd = new Date(endOfYear);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const today = fmt(now);
    const weeks: {
      days: (YearHeatmapDay | null)[];
      isFuture: boolean; // 整列都在今年之后
    }[] = [];

    // 计算每个月份第一天的列索引
    const monthCols: { label: string; col: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const firstDay = new Date(year, m, 1);
      const diffDays = Math.floor((firstDay.getTime() - gridStart.getTime()) / 86400000);
      const col = Math.floor(diffDays / 7);
      monthCols.push({ label: MONTH_NAMES[m], col });
    }

    const cursor = new Date(gridStart);
    let currentWeek: (YearHeatmapDay | null)[] = [];

    while (cursor <= gridEnd) {
      const dateStr = fmt(cursor);
      const inYear = cursor >= startOfYear && cursor <= endOfYear;
      // 未来日期（今年还没到的日期）显示为空
      const isFutureDay = dateStr > today;

      if (!inYear) {
        currentWeek.push(null);
      } else if (isFutureDay) {
        currentWeek.push(null);
      } else {
        currentWeek.push(dataMap[dateStr] ?? { date: dateStr, count: 0, level: 0, tasks: [] });
      }

      if (cursor.getDay() === 6) {
        weeks.push({ days: currentWeek, isFuture: false });
        currentWeek = [];
      }

      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) {
      weeks.push({ days: currentWeek, isFuture: false });
    }

    return { weeks, monthCols };
  }, [dataMap, year, now]);

  const handlePrev = () => setYear((y) => y - 1);
  const handleNext = () => setYear((y) => y + 1);
  const isCurrentYear = year === now.getFullYear();

  const totalSubmissions = Object.values(dataMap).reduce((s, d) => s + d.count, 0);
  const activeDays = Object.values(dataMap).filter((d) => d.count > 0).length;

  return (
    <div className={styles.yearHeatmapContainer}>
      <div className={styles.yearHeatmapHeader}>
        <span className={styles.yearHeatmapTitle}>📊 年度任务热力图</span>
        <span className={styles.yearHeatmapStats}>
          {totalSubmissions} 次提交 · {activeDays} 天活跃
        </span>
      </div>

      <div className={styles.yearHeatmapNav}>
        <LeftOutlined onClick={handlePrev} className={styles.yearNavBtn} />
        <span className={styles.yearLabel}>{year}</span>
        <RightOutlined
          onClick={isCurrentYear ? undefined : handleNext}
          className={`${styles.yearNavBtn} ${isCurrentYear ? styles.yearNavDisabled : ''}`}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : activeDays === 0 ? (
        <Empty description={`${year} 年暂无任务提交记录`} />
      ) : (
        <div className={styles.yearHeatmapGrid}>
          {/* 月份标签 */}
          <div className={styles.yearMonthRow}>
            {/* 占位：给星期标签留空 */}
            <div style={{ width: 28, flexShrink: 0 }} />
            <div className={styles.yearMonthLabels}>
              {monthCols.map(({ label, col }) => (
                <span
                  key={label}
                  className={styles.yearMonthLabel}
                  style={{ gridColumn: col + 1 }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.yearGridBody}>
            {/* 星期标签 */}
            <div className={styles.yearWeekLabels}>
              {WEEK_LABELS.map((d) => (
                <div key={d} className={styles.yearWeekLabel}>{d}</div>
              ))}
            </div>

            {/* 格子区域 */}
            <div className={styles.yearCellsWrapper}>
              <div className={styles.yearCellsGrid}>
                {weeks.map((week, wi) => (
                  <div key={wi} className={styles.yearWeekColumn}>
                    {week.days.map((day, di) => {
                      const cell = (
                        <div
                          key={di}
                          className={styles.yearCell}
                          style={{
                            background: day && day.count > 0
                              ? LEVEL_COLORS[day.level]
                              : '#ebedf0',
                          }}
                          title={day ? `${day.date} · ${day.count} 次提交` : ''}
                        />
                      );
                      if (day && day.tasks.length > 0) {
                        const content = (
                          <div style={{ maxWidth: 240 }}>
                            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>
                              {day.date} — {day.count} 次提交
                            </div>
                            {day.tasks.map((t) => (
                              <div
                                key={t.id}
                                style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}
                              >
                                {t.title}
                              </div>
                            ))}
                          </div>
                        );
                        return (
                          <Popover key={di} content={content} title="当日任务" trigger="click">
                            {cell}
                          </Popover>
                        );
                      }
                      return cell;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 图例 */}
          <div className={styles.yearLegend}>
            <span className={styles.yearLegendLabel}>少</span>
            {LEVEL_COLORS.map((c) => (
              <div key={c} className={styles.yearLegendCell} style={{ background: c }} />
            ))}
            <span className={styles.yearLegendLabel}>多</span>
          </div>
        </div>
      )}
    </div>
  );
}
