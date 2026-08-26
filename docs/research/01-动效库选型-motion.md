# 动效库选型：motion（原 framer-motion）

> 调研时点：2026-08。结论已验证可落地，本项目 v3.6 起采用。

## 一、候选库横向对比（结论先行）

| 维度 | **motion** ✅ | @formkit/auto-animate | react-spring | anime.js v4 |
|---|---|---|---|---|
| 最新版 | 13.1.1（2026-08-18） | 0.9.0 | 10.1.2 | 4.2.x |
| npm 周下载 | ~1600 万 | ~57 万 | ~79 万 | 数十万 |
| React 19 | ✅ 官方 peer `^18\|\|^19`，13.x 修复 StrictMode 下 AnimatePresence 兼容 | ⚠️ 可用但有 StrictMode 坑 | ✅（曾滞后数月） | 非 React 组件化 |
| bundle(gzip) | m+LazyMotion 拆分后 **4.6KB + domAnimation ~15KB**；全量 motion 34KB | 3.28KB | 15-17KB | 全量 24.5KB |
| 退出动画 | ✅ AnimatePresence（核心优势） | ❌ | ✅ useTransition | ❌ 手动管理 |

**选型理由**：
- anime.js v4 是命令式引擎，React 里要 createScope+useEffect 手动挂载，做 CRUD 动效样板代码多 → 不当主力
- react-spring 定位弹簧物理，生态位被 motion 挤压 → 无引入理由
- auto-animate 只覆盖列表 FLIP 补间，Modal 过渡/数字滚动都要另找 → 当补充件都不需要
- 纯 CSS 的天花板：**做不了卸载退出动画、跨组件 stagger 编排、数字滚动**——这正是本项目的三个需求
- motion 是 2026 年 React 社区事实标准（Framer/Cursor/Linear 赞助，全职维护）

## 二、正确用法范式（本项目约定）

### 2.1 LazyMotion 严格模式（体积关键）

```tsx
// main.tsx 应用根部包一次
import { LazyMotion, domAnimation, MotionConfig } from "motion/react";

<LazyMotion features={domAnimation} strict>
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>
</LazyMotion>
```

- **全项目只用 `m` 不用 `motion`**（`strict` 开启后误用会直接报错，防止体积优化失效）
- `domAnimation` 含动画/variants/exit/tap/hover/**whileInView**——本项目全部所需；不要用 domMax（多 10KB 的拖拽/layout 用不上）
- `MotionConfig reducedMotion="user"` 自动把 transform 类动画降级为透明度过渡（尊重系统"减弱动态效果"）

### 2.2 列表交错入场

```tsx
const list = {
  hidden: {},
  visible: { transition: { delayChildren: stagger(0.06) } } // 每项错开 60ms
};
const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 }
};
<m.div variants={list} initial="hidden" animate="visible">
  {cards.map(c => <m.div key={c.id} variants={item}>...</m.div>)}
</m.div>
```

### 2.3 Modal / Tab 内容过渡

```tsx
<AnimatePresence mode="wait">
  {open && (
    <m.div key={activeTab} initial={{opacity:0, y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
      ...
    </m.div>
  )}
</AnimatePresence>
```

⚠️ **与 antd Modal 配合的红线**：保留 antd 自身的开合动画，motion 只动 Modal **内部内容**；禁止清掉 antd transitionName 让 motion 接管整个弹层（破坏焦点管理和遮罩逻辑）。

### 2.4 数字滚动（零额外依赖，替代 react-countup）

```tsx
const count = useMotionValue(0);
useEffect(() => {
  const c = animate(count, target, { duration: 0.8, ease: "easeOut" });
  return () => c.stop();
}, [target]);
return <m.span>{count}</m.span>; // MotionValue 直接渲染，绕过 React 重渲染
```

千分位用 `useTransform(count, v => Math.round(v).toLocaleString())`。

### 2.5 滚动触发（长页面用）

```tsx
<m.div whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} />
```

`once: true` 必须——避免反复触发；视口外元素不参与动画。

## 三、性能红线（业界共识，违反=掉帧）

按 motion 官方性能分级：

| 层级 | 属性 | 说明 |
|---|---|---|
| S（合成器线程） | transform、opacity、filter、clip-path | 随便动 |
| F（禁区） | width/height/top/left/margin/padding | 每帧 reflow，**绝对禁止逐帧动画** |

守则：
1. 只逐帧动 transform 和 opacity；尺寸位置变化用 scale/translate 替代
2. `will-change` 克制使用——每层占 GPU 内存，移动端滥用会撑爆显存
3. **大量列表项不同时动画**：stagger 错开 + `once:true` + 超长列表只动画首屏可见项
4. 大半径 blur() 动画成本指数增长，Dashboard 卡片慎用毛玻璃动画
5. 低端机验证：DevTools CPU 6x throttling + 中端安卓真机；MacBook 60fps ≠ 红米不卡

## 四、降级策略（依赖失败不影响功能）

1. **渐进增强**：现有 CSS transition 全部保留，motion 只接管 CSS 做不到的场景
2. features 异步加载失败时，m 组件仍正常静态渲染（只是没动画）
3. 动画统一封装成内部组件（`FadeIn`/`StaggerList`/`CountUpNumber`），将来移除 motion 只改这几个文件
4. `prefers-reduced-motion` 双保险：CSS 层 @media 归零（已有 animations.css:113）+ MotionConfig reducedMotion="user"

## 来源

- https://www.npmjs.com/package/motion （v13.1.1，周下载 1606 万）
- https://motion.dev/changelog （13.x React 19 StrictMode 修复）
- https://motion.dev/docs/react-lazy-motion ；https://motion.dev/docs/react-reduce-bundle-size
- https://motion.dev/docs/react-animation （stagger/MotionValue 计数器官方模式）
- https://motion.dev/magazine/web-animation-performance-tier-list （性能分级）
- https://motion.dev/docs/react-accessibility （reducedMotion）
- https://blog.logrocket.com/best-react-animation-libraries/ （2026-03 对比基准）
