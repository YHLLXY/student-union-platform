import type { ReactNode } from 'react';
import {
  CheckSquareOutlined,
  NotificationOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import styles from './auth.module.css';

/* === 登录页视觉外壳 ===
   桌面 ≥900px：左品牌叙事区 + 右表单卡；移动端上下堆叠。
   纯 CSS 实现（渐变 + 光斑），不引入图片资源，亮暗主题自适应 */

const FEATURES = [
  { icon: <CheckSquareOutlined />, title: '任务协作', desc: '任务分派、里程碑跟踪与成果审核' },
  { icon: <NotificationOutlined />, title: '公告通知', desc: '部门公告精准触达，已读确认一目了然' },
  { icon: <MessageOutlined />, title: '部门论坛', desc: '工作讨论、资料共享与知识沉淀' },
];

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.loginContainer}>
      <div className={styles.brandPanel}>
        <div className={styles.brandInner}>
          <div className={styles.brandBadge}>CQUPT</div>
          <h1 className={styles.brandTitle}>学生会<br />线上交流平台</h1>
          <p className={styles.brandSlogan}>
            重庆邮电大学学生会内部办公与协作的一站式工具
          </p>
          <ul className={styles.featureList}>
            {FEATURES.map((f) => (
              <li key={f.title} className={styles.featureItem}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <span>
                  <span className={styles.featureTitle}>{f.title}</span>
                  <span className={styles.featureDesc}>{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.loginCard}>{children}</div>
        <div className={styles.tipText}>仅限学生会内部成员使用</div>
      </div>
    </div>
  );
}
