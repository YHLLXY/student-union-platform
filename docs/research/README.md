# 研究资料索引

> v3.6「UI 精致化 + 动效升级」（2026-08-26）、v4.0「架构现代化 + UI 升级」（2026-09-03）
> 与 v4.1「首屏性能优化」（2026-09-05）三轮迭代的调研沉淀。
> 资料来源：网络调研 + 本地依赖类型定义逐字验证 + 实测数据。

## 文档地图

| 文档 | 内容 | 什么时候看 |
|------|------|-----------|
| [01-动效库选型-motion.md](./01-动效库选型-motion.md) | React 动画库横向对比、motion 正确用法范式、性能红线 | 写任何 JS 动效之前 |
| [02-antd6令牌与反馈态范式.md](./02-antd6令牌与反馈态范式.md) | Design Token 三层体系、Loading/空态/错误态设计规范、a11y 最小集 | 改主题/改反馈态之前 |
| [03-微交互清单.md](./03-微交互清单.md) | 20 项微交互的具体参数（时长/缓动/优先级）、全局动效基座变量 | 做任何微交互时直接抄参数 |
| [04-开源同类项目调研.md](./04-开源同类项目调研.md) | 8 个同类开源项目的 UI 分析、可提炼的排版规则 | 做 Dashboard/任务页布局决策时 |
| [05-构建优化与代码分割.md](./05-构建优化与代码分割.md) | Vite8/Rolldown `codeSplitting.groups` 精确 API、entriesAware、chunk 审计方法论、v3.6→v4.0 对比数据 | 动 vite.config.ts 之前必读 |
| [06-Supabase类型与TanStackQuery实践.md](./06-Supabase类型与TanStackQuery实践.md) | 手写 Database 类型、双外键嵌入提示语法、unwrap 错误约定、RQ 迁移场景映射表 | 写 service / 数据层之前必读 |
| [07-暗色模式与仪表盘UI参考.md](./07-暗色模式与仪表盘UI参考.md) | antd6 双算法、首帧防闪、StatCard 设计公式、Dashboard IA、登录页双栏、emoji 退出边界 | 改主题/新增页面之前 |
| [08-首屏性能与ServiceWorker策略.md](./08-首屏性能与ServiceWorker策略.md) | SW 导航策略 SWR 化、保留 2 代缓存与 PURGE_ALL 更新链路、懒壳层、认证启动快速路径、chunk 审计工具、motion 拆分失败记录 | 动 sw.js / 启动路径 / 分包之前必读 |

## 核心结论速览

**v3.6（UI 层）**
1. 动效主方案：`motion` 包（LazyMotion strict + domAnimation），纯 CSS 负责 hover/按压微交互
2. 令牌铁律：语义色只从 token 取（antd `useToken()` / CSS 变量），禁止 tsx 内联 hex
3. 反馈态分工：页面级加载用骨架屏，错误态必须带重试按钮
4. 不可破坏红线：桌面 ≥1024px 零回归、移动端禁拖拽、`prefers-reduced-motion` 全局降级、触摸目标 ≥44px

**v4.0（架构层，新增）**
1. 分包：`output.codeSplitting.groups`（manualChunks/advancedChunks 均已失效/废弃），antd 组开 `entriesAware`；API 以本机 rolldown 类型定义为准
2. 数据层：路由级读数据一律 `unwrap + useQuery`；Realtime → invalidateQueries；乐观更新 → setQueryData；弹窗数据可命令式但必须 .catch
3. 类型：Database 类型手写维护（事实来源 supabase-migration.sql），双外键嵌入必须 `别名:目标表!列名()` 提示
4. 主题：`darkAlgorithm` + `[data-theme='dark']` CSS 覆盖双轨同步，head 内联脚本防首帧闪烁

**v4.1（性能层，新增）**
1. SW 导航一律 stale-while-revalidate 服务统一 shell 键（SPA 所有导航同一份 HTML）；`controllerchange` 必须用 `pendingActivate` 区分用户主动更新（首访 claim 也会触发）
2. activate 保留最近 2 代缓存（数字感知版本排序），防止旧 HTML 会话引用被清资源而白屏
3. codeSplitting 组是"整组同载"语义：独占依赖（@dnd-kit）必须独立分组，否则被组内急加载成员陪绑；"拆出 chunk"≠"移出关键路径"，最终判据是 dist/index.html 的 modulepreload 清单
4. 懒壳层是登录页最大瘦身项：AppLayout 子树整体 lazy；认证启动用"本地会话 + 缓存档案 + 后台校正"消除阻塞往返
