import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

/* === 统一页头 ===
   左侧：图标方块 + 标题 + 副标题；右侧：操作区。
   各模块页头由此统一，替代各页面手写的 h2 + emoji */

export interface PageHeaderProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  /** 右侧操作区（按钮组等） */
  extra?: ReactNode;
}

export default function PageHeader({ icon, title, subtitle, extra }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        {icon && <span className={styles.iconBox}>{icon}</span>}
        <div>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
      </div>
      {extra && <div className={styles.extra}>{extra}</div>}
    </div>
  );
}
