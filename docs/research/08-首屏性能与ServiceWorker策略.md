# 08 - 首屏性能与 Service Worker 策略

> v4.1「首屏性能优化」（2026-09-05）的调研与实测沉淀。
> 触发：用户反馈"打开很慢"。方法：受控浏览器对线上站点实测 → sourcemap 字节审计 → 定位根因 → 对照业界成熟方案 → 实施验证。

## 一、诊断方法论（可复用）

### 1. 真实时序测量（Performance API）

在受控浏览器中对线上站执行（冷 = 新 tab 首访；热 = reload 且 SW 已接管）：

```js
const n = performance.getEntriesByType('navigation')[0];
performance.getEntriesByType('paint');        // FCP
performance.getEntriesByType('resource');     // 每个资源的 transferSize / duration / startTime
```

关键判读：
- `transferSize === 0` → 命中 Service Worker / 内存缓存；`> 0` → 走了网络
- FCP 明显晚于 `load` 事件 → 应用首帧被 JS 之后的逻辑（如认证请求）阻塞
- 所有资源 startTime 几乎相同 → modulepreload 生效，瓶颈是带宽×总量而非发现顺序

### 2. Chunk 构成审计（sourcemap 字节聚合）

对构建产物的 `.map` 按 `node_modules/<pkg>` 与 `antd/es/<组件>` 聚合 sourcesContent 字节：
仓库工具 `node scripts/audit-chunk.mjs "<chunk名>.map"`（支持包级与组件级两级下钻）。

### 3. v4.1 实测结论（优化前）

| 指标 | 数值 |
|------|------|
| 冷加载 FCP | 2268ms（TTFB 479ms + 434KB gz 下载 ~1.4s + 渲染） |
| 热加载 DCL | 834ms，其中 **714ms 是 HTML 网络优先强制的往返**（10 个子资源全部缓存命中、0 字节走网） |
| 登录页急加载 | 431KB gz，其中两个 antd 块 224KB（49%）；壳层组件（NotificationBell/GlobalSearch/GuideDrawer/FeedbackModal）全部在入口静态图 |
| @dnd-kit | 仅任务页使用，却因与 react-router 同在 vendor 组被"陪绑"急加载 |

## 二、Service Worker 导航策略：网络优先 → stale-while-revalidate

**来源**：[Workbox 缓存策略总览](https://developer.chrome.com/docs/workbox/caching-strategies-overview)、[SPA 离线实践](https://samvloeberghs.be/posts/lessons-learned-on-offline-capabilities-with-service-workers-using-workbox/)

- SWR 语义：**立即回缓存副本，同时后台拉新写回缓存**。适合"打开速度优先、更新可延后一拍"的 SPA shell。
- 业界共识（Workbox `NavigationRoute` + `createHandlerBoundToURL`）：SPA 所有导航统一服务预缓存的 `index.html`，不按 URL 逐个匹配。
- 本项目为手写 SW（无 Workbox 依赖），等价实现要点：
  1. **服务统一 shell 键**（`BASE + '/index.html'`），而非 `caches.match(event.request)`——用户可能从 `/` 进入，键不一致会静默脱靶（审查阶段发现的坑）；
  2. 后台更新也固定写回 shell 键；
  3. 后台更新必须 `.catch` 兜底，离线时不能产生 unhandled rejection。

### 版本更新链路（保持原有 UX 语义）

**前提事实**：本项目 SW 沿用 v4.0 的自激活设计——install 即 `skipWaiting()`、activate 里 `clients.claim()`，新版本不等待用户授权即接管；toast 是"立即换新 + 顺手清理"的入口而非激活开关。

| 环节 | 设计 |
|------|------|
| 更新检测 | 浏览器导航时自动 byte-diff `sw.js`；另有 10 分钟 `registration.update()` 轮询 |
| 自动生效 | 自激活 + SWR 只服务**本代**预缓存 shell → 新 SW 接管后的下一次导航自动是新版，无需任何用户动作 |
| 提示 | `updatefound` → toast"新版本已就绪"（install 完成过快时 trackUpdate 可能错过 installing/waiting 状态，toast 偶发不弹——v4.0 起既有行为，更新不受影响） |
| 点击 toast | `postMessage({type:'ACTIVATE_AND_PURGE_OLD'})` 给新 Worker + 300ms 后直接 `reload()` |

### v4.1.1：生产实测暴露的两个竞态/遮蔽坑（v4.1.0 首版实现踩中）

1. **清理竞态**：首版把 PURGE_ALL 挂在"主线程收到 controllerchange 后回发消息"上——生产机上 300ms 的 reload 跑赢了新 SW 激活，controllerchange 在旧页面没来得及触发，清理被跳过（本地机器快，测试两次都没暴露）。**修复**：清理整体移入 Worker 侧——`ACTIVATE_AND_PURGE_OLD` 消息处理器内部 `skipWaiting → claim → 删旧代`，用 `waitUntil` 保证执行；Worker 在状态切换后是同一执行环境，完全不依赖页面存活与主线程时序。
2. **旧代 shell 遮蔽**：SWR 首版用全局 `caches.match(SHELL_URL)`，而 CacheStorage 按缓存**创建顺序**返回第一个命中——版本更迭后旧代 shell（先创建）会永久遮蔽新代预缓存，用户永远拿旧 HTML。**修复**：导航只查本代 `caches.open(APP_SHELL)` 的 shell 键，代际之间天然隔离。

### 旧资源保护：activate 保留 2 代

SWR 下还持有旧 HTML 的会话引用旧 hash 资源；若 activate 一律清光旧缓存，旧会话刷新会"新 HTML + 旧资源 404"白屏。策略：app-shell-/app-assets- 各**保留最新 2 代**，只删更早的。版本排序必须数字感知：`localeCompare(…, { numeric: true })`（否则 v4.10.0 < v4.9.0）。

### 附带修复

`version.json?t=` 带唯一查询串，原策略下每次版本检查都会在 assets 缓存堆积一条永不复用的条目 → version.json 请求整体绕过 SW（不 respondWith、不入缓存）。

## 三、急加载瘦身（431 → 332KB gz，-23%）

| 手段 | 原理 | 效果 |
|------|------|------|
| **懒壳层** | AppLayout 及其子树（NotificationBell/GlobalSearch/GuideDrawer/FeedbackModal/PwaInstallButton）`lazy()` 化，其 antd 依赖（drawer/dropdown/badge/avatar/select/input-number/popconfirm/layout，sourcemap 审计确认）整体移出登录页关键路径 | antd 急加载 224→152KB gz；entry 22.8→9.7KB gz |
| **@dnd-kit 独立分组** | codeSplitting 组是"整组同载"语义：组内任一模块急加载（react-router），整块 chunk 都急加载。给 dnd 单独分组后仅在任务页加载 | vendor 37.8→24.6KB gz |
| DevEntryModal 懒加载 | 登录页极少用的弹窗连坐 Modal 模块（49KB 原始）移出关键路径 | 计入 antd 降幅 |

**失败记录（同样有价值）：motion 特性集异步化。** domAnimation（约 70KB 原始）理论上可经 `LazyMotion features={() => import(...)}` 官方异步签名延后；实测两条路都失败——(a) `features.ts` 转发 `export { domAnimation } from 'motion/react'`：barrel 整体仍被入口静态引用，chunk 哈希纹丝不动；(b) 按 `framer-motion/dist/es/render/dom/features-*` 路径细分组：特性块拆出来了，但仍被入口 preload 连带（共享集群链），急加载 28.8 → 30.1KB gz **不降反升**。按计划验证门禁回退。教训：** Rolldown 分组语义下"拆出 chunk"≠"移出关键路径"，必须以 dist/index.html 的 modulepreload 清单为最终判据。**

## 四、认证启动快速路径

原 `App.tsx` 在 `getCurrentUser()`（getSession 本地读 + users 表 SELECT 一次网络往返）返回前不渲染任何内容。参考业界通行做法（会话档案本地缓存 + 后台校正）：

1. `authService` 拆出 `getLocalSession()`（纯本地）与 `fetchProfileByAuthId()`；
2. 有 session + localStorage 有**同 auth_id** 缓存档案 → 立即渲染，后台拉新静默校正（角色变更自动收敛）；
3. 缓存按 auth_id 键控防串号；SIGNED_OUT 清缓存；无缓存失败路径与旧行为一致（回登录页）；
4. `index.html` 加 `<link rel="preconnect" href="%VITE_SUPABASE_URL%" crossorigin>`（[Vite HTML 常量替换](https://vite.dev/guide/env-and-mode)；未定义时字面保留、无害）。

## 五、v4.1 验证数据（优化后）

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 登录页急加载 | 431KB gz | **332KB gz（-23%）** |
| 热加载 TTFB（导航） | 714ms | **15ms（本地）/ 1ms（复测）**，transferSize=0 |
| 热加载 DCL | 834ms | **127ms** |
| 更新链路 | 网络优先保真 | toast → PURGE_ALL → reload 端到端实测通过，缓存仅剩当前代 |
| 视觉 | — | 亮/暗/移动端三截图与基线逐项一致 |

## 六、红线备忘

- SWR 有一拍延迟的更新窗口：可见更新靠 version.json toast（点击即得新版），后台 SWR 保证下次导航必然新版；
- `.perf-baseline/` 为本轮视觉对照截图（未入库）；`scripts/audit-chunk.mjs` 为 chunk 审计常驻工具；
- 认证快速路径的"缓存档案渲染"无法在无账号环境端到端验证，已标注待人工。
