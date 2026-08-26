# Ant Design 6 设计令牌与反馈态设计范式

> 调研时点：2026-08。适用：本项目 React 19 + antd 6.4.5。

## 一、Design Token 三层体系（官方推荐用法）

| 层级 | 作用 | 示例 |
|------|------|------|
| Seed Token | 设计意图种子，影响面最大 | `colorPrimary`、`borderRadius` |
| Map Token | 算法从 Seed 派生的梯度色板 | `colorPrimaryBg`、`colorPrimaryHover` |
| Alias Token | 批量控制组件通用样式 | `colorBgContainer`、`colorLink` |

**核心原则：只改 Seed Token，让算法派生其余**，而不是手动覆盖几十个派生值。

组件内消费 token（替代硬编码色值的正道）：

```tsx
import { theme } from "antd";
const { token } = theme.useToken();
<div style={{ background: token.colorPrimaryBg, borderRadius: token.borderRadius }} />
```

### 与项目自有 CSS 变量的协同（关键决策依据）

- antd v6 已默认启用纯 CSS 变量架构（所有 token 以 `--ant-xxx` 注入 DOM），与项目 `variables.css` 天然并存不冲突
- 单一事实来源：品牌变量作为 Seed Token 注入 ConfigProvider；自定义组件通过 `useToken()` 取值——保证两边永远一致，而不是两套各写一份 #1a3a5c
- 项目现状问题：`variables.css` 与 `theme.ts` 人工同步同一套色值（双源），长期应收敛为「theme.ts 为源，CSS 变量引用之」或至少加注释互指

### antd 6 行为差异备忘（v5 → v6）

| 变化项 | 内容 | 对本项目影响 |
|--------|------|--------------|
| CSS Variables 默认启用 | 放弃 IE | 无 |
| 弹层蒙层模糊 | v6.0~6.2 默认开，**v6.3+ 默认关**（需 `mask:{blur:true}`） | 毛玻璃质感要显式开 |
| 尺寸枚举 | `size="middle"` → `"medium"` | 控制台废弃警告，顺手修 |
| Tag 边距 | 移除末尾默认 margin-inline-end | 连排 Tag 间距变小 |
| `destroyOnClose` | Modal/Drawer 弃用，改语义化新 API | 项目有 14 处待迁移（技术债 T1） |
| 静态方法主题丢失 | message.xxx/Modal.xxx 不经过 ConfigProvider | 官方方案：`<App>` 包裹 + `App.useApp()` |

⚠️ 已知坑：v6 下部分尺寸 Token（如 DatePicker 的 borderRadiusSM/LG）不像 v5 生效（issue #56013），需 CSS 覆盖。

来源：https://ant.design/docs/react/customize-theme.md 、https://ant.design/docs/react/migration-v6.md 、https://dev.to/zombiej/ant-design-60-is-released-bfa 、https://github.com/ant-design/ant-design/issues/56013

## 二、Loading 态：骨架屏 vs Spin 场景划分

判据：**用户在等内容出现（→骨架屏），还是在等系统完成动作（→Spin）**。

| 场景 | 用什么 | 理由 |
|------|--------|------|
| 首屏 / 页面级加载 | Skeleton（布局模拟最终结构） | 用户能预读布局，感知等待缩短约 30% |
| 卡片流 / 列表 / Dashboard 统计卡 | Skeleton | 结构可预测 |
| 表单提交 / 登录 / 删除 | 按钮 loading 态 | 确认动作已注册，防重复提交 |
| 区块局部刷新 | 小型 Spin 或局部 Skeleton | 不打断整页 |
| 操作 < 300ms | 什么都不显示 | 闪烁的 loading 反而显得慢 |

骨架屏三铁律：
1. 必须与真实布局一致（否则是假承诺，加载完跳动更糟）
2. 带 shimmer/pulse 表明没卡死（antd Skeleton 内置）
3. 加 ARIA 标注加载状态

来源：https://www.onething.design/post/skeleton-screens-vs-loading-spinners 、https://72technologies.com/blog/skeleton-screens-vs-spinners-when-each-wins

## 三、错误态三件套（展示 / 重试 / 上报）

没用 react-query 时的原生等价封装：

```tsx
// 1. 异步错误桥接到 ErrorBoundary（fetch 错误不会被边界自动捕获！）
const { showBoundary } = useErrorBoundary();
useEffect(() => {
  loadData().then(setData).catch(showBoundary);   // 必须显式 .catch
}, []);

// 2. 分级边界 + 重试（onReset 换 key 强制重挂载重拉）
<ErrorBoundary
  onReset={() => setRetryKey(k => k + 1)}
  fallbackRender={({ resetErrorBoundary }) => (
    <Result status="warning" title="加载失败"
      extra={<Button onClick={resetErrorBoundary}>重试</Button>} />
  )}>
  <Data key={retryKey} />
</ErrorBoundary>
```

要点：
- **分级包裹**：主内容、各 widget 独立 ErrorBoundary，一处崩不全局白屏
- onReset 必须真正重新发请求（换 key 重挂载是最简单实现）
- Promise.all 必须有 catch——静默失败的 loading 会永远转圈（本项目 DashBoardPage.tsx:38-45 曾存在此 bug）

## 四、空态五分类文案公式

公式：**说明现状（哪里空）→ 解释原因（为什么空）→ 给一个下一步动作**

| 类型 | 文案策略 | CTA |
|------|---------|-----|
| 首次使用 | 「还没有活动，创建第一个开始吧」 | 主按钮放 Empty 内部 |
| 筛选无结果 | 「没有找到匹配项，试试放宽条件」 | 「清空筛选」 |
| 已清空 | 确认状态正常：「列表已清空」 | 「新建」 |
| 权限不足 | 明确缺什么：「请联系管理员开通」 | 申请入口/联系方式 |
| 加载失败 | 并入错误态 | 重试按钮 |

来源：https://kompassify.com/blog/empty-states-guide 、https://memorable.design/empty-state-design-examples/

## 五、a11y 最小实践集

| 项 | 做法 |
|----|------|
| focus ring | `:focus-visible { outline: 2px solid var(--color-primary-light); outline-offset: 2px }`（鼠标点击不显示、键盘 Tab 才显示） |
| aria-label | 补齐纯图标按钮：关闭×、汉堡、搜索、更多…；可见文本必须包含在 accessible name（WCAG 2.5.3） |
| 动态播报 | Toast 成功提示 `aria-live="polite"`；错误 `role="alert"` |
| 键盘 | Esc 关弹层；Modal 焦点圈闭 + 关闭后焦点归还；禁正 tabindex |
| reduced-motion | 约 5% 成年人有前庭障碍——不是偏好是健康问题，全局归零必须保留 |
| 触控目标 | ≥24px WCAG 硬线 / 44px 平台推荐值（本项目已定 44px） |

验证：axe/Lighthouse 扫描 + 键盘全程走查（不碰鼠标）。

来源：https://thefrontkit.com/blogs/wcag-aa-checklist-for-web-apps 、https://humanstandards.org/checklists-playbooks/accessibility-checklist/

## 六、PWA 移动端细节

### safe-area 三步套路（本项目已有基础，注意横屏）

```css
.app-header { padding-top: max(12px, env(safe-area-inset-top)); }
main { padding-bottom: calc(env(safe-area-inset-bottom) + 1rem); }
```
- `viewport-fit=cover` 缺失则 env() 恒 0（项目 index.html 已配 ✓）
- iOS 只有 PWA standalone + cover 同时满足才非零；真机验证别信桌面模拟
- 横屏左右 inset 非零，悬浮元素要处理 left/right

### 下拉刷新选型（若引入）

- **react-simple-pull-to-refresh**：0 依赖 TS、周下载 ~59k、持续维护 → 首选
- react-use-pull-to-refresh：4.2kB、iOS 原生手感、`enableOnlyInPWA` → PWA 专属场景最优
- 参数惯例：pullThreshold 100px / maxPull 150px；仅移动端启用防劫持滚轮

### Modal vs Drawer 决策口诀

**Modal 管中断决策，Drawer 管上下文任务。**
- 危险确认/必填认证 → Modal
- 需对照背后页面（筛选/详情/快编）→ Drawer
- 任务长/多步 → Drawer 或独立页
- 移动端单手 → 底部 Bottom Sheet（placement="bottom"）
- 同一功能桌面 Dialog / 窄屏 Drawer(bottom)，共享 open state 即可
