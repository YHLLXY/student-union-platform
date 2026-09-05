import { Card, theme } from 'antd';
import { CountUpNumber } from '@/components/motion';
import type { ReactNode } from 'react';
import styles from './StatCard.module.css';

/* === 统计卡（仪表盘通用公式，规格依据 docs/research/07）===
   图标容器 40px 圆角方 + 语义色 12% 底色；数值 28px/700 tabular-nums；
   hover 抬升 2px + 卡片阴影；整卡可点击跳转 */

export interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  /** 语义色（token.colorWarning 等），缺省用主题色 */
  color?: string;
  suffix?: string;
  loading?: boolean;
  onClick?: () => void;
}

export default function StatCard({
  icon,
  label,
  value,
  color,
  suffix,
  loading = false,
  onClick,
}: StatCardProps) {
  const { token } = theme.useToken();
  const semantic = color ?? token.colorPrimary;

  return (
    <Card
      className={styles.card}
      hoverable={!!onClick}
      onClick={onClick}
      styles={{ body: { padding: '18px 20px' } }}
      aria-label={label}
    >
      <div className={styles.top}>
        <span
          className={styles.iconBox}
          style={{ color: semantic, background: `color-mix(in srgb, ${semantic} 12%, transparent)` }}
        >
          {icon}
        </span>
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.valueRow}>
        <span
          className={styles.value}
          style={{ color: value === 0 ? token.colorTextTertiary : semantic }}
        >
          {loading ? '—' : <CountUpNumber value={value} />}
        </span>
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
    </Card>
  );
}
