import { theme } from 'antd';
import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

/* === 统一空态 ===
   图标落位于浅色圆底 + 标题 + 说明 + 可选行动按钮（参考 GitHub/Linear 空态三段式），
   替代裸 <Empty>，让空态也承担「下一步去哪」的引导职责 */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** 行动按钮（如「发布第一个任务」） */
  action?: ReactNode;
  /** compact 用于卡片内嵌的小空态 */
  compact?: boolean;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const { token } = theme.useToken();

  return (
    <div className={className ? `${compact ? styles.compact : styles.wrapper} ${className}` : (compact ? styles.compact : styles.wrapper)}>
      {icon && (
        <div className={styles.iconCircle} style={{ color: token.colorTextTertiary }}>
          {icon}
        </div>
      )}
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.description}>{description}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
