import { m } from 'motion/react';
import { useEffect } from 'react';
import { animate, useMotionValue, useTransform } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';

/* === 动效封装层（唯一出口） ===
   全项目 JS 动效统一经由本文件组件实现，业务代码禁止直接 import 'motion/react-m'。
   将来若需移除 motion 依赖，只需重写本文件内部实现，业务零改动。
   参数规范见 docs/research/03-微交互清单.md */

const EASE_ENTER: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface BoxProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** 单元素入场：淡入 + 上移 16px，250ms */
export function FadeIn({ children, delay = 0, className, style }: BoxProps & { delay?: number }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_ENTER, delay }}
      className={className}
      style={style}
    >
      {children}
    </m.div>
  );
}

/** 交错容器：子元素依次错峰入场（配合 StaggerItem 使用） */
export function StaggerGroup({ children, stagger = 0.06, className, style }: BoxProps & { stagger?: number }) {
  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: stagger } } }}
      className={className}
      style={style}
    >
      {children}
    </m.div>
  );
}

/** 交错子项：必须作为 StaggerGroup 直接子元素使用 */
export function StaggerItem({ children, className, style }: BoxProps) {
  return (
    <m.div
      variants={{
        hidden: { opacity: 0, y: 14 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE_ENTER } },
      }}
      className={className}
      style={style}
    >
      {children}
    </m.div>
  );
}

/** 数字滚动：从 0 滚到目标值或平滑过渡到新值；MotionValue 直写 DOM 不触发重渲染 */
export function CountUpNumber({ value, duration = 0.8 }: { value: number; duration?: number }) {
  const count = useMotionValue(0);
  const text = useTransform(count, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    const controls = animate(count, value, { duration, ease: 'easeOut' });
    return () => controls.stop();
  }, [value, count, duration]);

  return <m.span style={{ display: 'inline-block' }}>{text}</m.span>;
}
