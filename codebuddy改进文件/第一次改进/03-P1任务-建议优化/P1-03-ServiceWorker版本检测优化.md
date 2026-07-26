# P1-03 — ServiceWorker 版本检测优化

## 📋 任务元信息

| 项 | 值 |
|----|----|
| 优先级 | 🟡 P1 建议优化 |
| 预估工时 | 0.5 天 |
| 依赖任务 | 无 |
| 涉及文件 | `src/hooks/useVersionNotification.ts`、`public/sw.js`、`index.html` |
| 风险等级 | 低 |
| 需要数据库迁移 | ❌ 否 |

---

## 🎯 任务背景

**当前机制：**
- `sw.js` 用 `skipWaiting` + `clients.claim` 立即接管。
- `index.html`（推测）轮询 `version.json` 检查更新，发现新版本后写入 localStorage。
- `useVersionNotification.ts` 读取 localStorage，弹更新公告。

**问题：**
1. 轮询有延迟（用户可能用半小时旧版才发现新版）。
2. SW 的 `updatefound` 事件没有被利用（sw.js 注释里写了"主线程监听 updatefound"，但没实现）。
3. 新 SW 接管后没有给用户"刷新即可用新版"的提示。

## ✅ 完成目标

1. 用 SW 的 `updatefound` + `controllerchange` 事件做即时版本检测，替代轮询。
2. 新版本可用时，弹 Toast "发现新版本，点击刷新"。
3. 保留现有的 `version.json` 更新公告机制（用于展示 changelog）。

---

## 🚧 硬约束（违反即返工）

1. **只改 `useVersionNotification.ts`、`sw.js`、`index.html`**。
2. **不改 `CACHE_VERSION` 机制**（sw.js 的缓存策略不变）。
3. **不改 PWA 安装提示逻辑**（`beforeinstallprompt` 处理不变）。
4. **保留 changelog 公告**（`version.json` 的更新公告仍然弹出）。
5. 不引入新依赖。

---

## 📂 需要阅读的上下文文件

| 文件 | 用途 |
|------|------|
| `src/hooks/useVersionNotification.ts` | 当前版本通知逻辑 |
| `public/sw.js` | SW 实现 |
| `index.html` | SW 注册代码（看轮询逻辑） |

---

## 🔧 执行步骤

1. 改 `useVersionNotification.ts`：加 `updatefound` / `controllerchange` 监听。
2. 改 `index.html`：移除轮询（如有），保留 SW 注册。
3. `sw.js` 的 `message` 通信保持不变。
4. build + 测试。

---

## 💬 喂给 DeepSeek 的 Prompt

````markdown
# 任务：ServiceWorker 版本检测优化（updatefound 事件）

## 角色与上下文

你是资深前端工程师，维护一个 React 19 PWA。
当前版本检测用轮询 version.json，延迟大。需改用 SW 的 updatefound 事件做即时检测。

## 任务目标

1. useVersionNotification 加 updatefound / controllerchange 监听。
2. 新版本可用时弹 Toast "发现新版本，点击刷新"。
3. 保留 version.json 的 changelog 公告。

## 硬约束（违反即返工）

1. 只改 `src/hooks/useVersionNotification.ts`、`public/sw.js`、`index.html`。
2. 不改 CACHE_VERSION 机制和缓存策略。
3. 不改 PWA 安装提示逻辑。
4. 保留 changelog 公告。
5. 不引入新依赖。
6. 不破坏现有的 installPrompt / installApp 功能。

## 输入：当前代码

### 文件 1：src/hooks/useVersionNotification.ts（完整）

【把 useVersionNotification.ts 完整内容粘贴到这里】

### 文件 2：public/sw.js（完整）

【把 sw.js 完整内容粘贴到这里】

### 文件 3：index.html（完整）

【把 index.html 完整内容粘贴到这里】

## 输出要求

### 1. 修改的文件清单
- `src/hooks/useVersionNotification.ts` — 加 SW 事件监听
- `index.html` — 移除轮询（如有），保留 SW 注册

### 2. useVersionNotification.ts 改动点

在现有 useEffect 里**追加** SW 事件监听（不替换原有 localStorage 逻辑）：

```typescript
// ---- ③ SW updatefound 检测 ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    
    const handleUpdateFound = () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      
      newWorker.addEventListener('statechange', () => {
        // 新 SW 已安装完成，且当前有旧 SW 在控制页面
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 弹出"发现新版本"提示
          notification.info({
            message: '发现新版本',
            description: '点击刷新以使用最新版本',
            duration: 0,  // 不自动关闭
            placement: 'topRight',
            onClick: () => {
              newWorker.postMessage({ type: 'skipWaiting' });
            },
          });
        }
      });
    };
    
    reg.addEventListener('updatefound', handleUpdateFound);
    
    // controllerchange：新 SW 已接管，强制刷新
    const handleControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    
    // cleanup
    return () => {
      reg.removeEventListener('updatefound', handleUpdateFound);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  });
}
```

**注意：** 这段代码要放在现有 useEffect 的 cleanup 之外，或单独加一个 useEffect。推荐单独加一个 useEffect 避免与现有逻辑耦合。

### 3. index.html 改动点

找到轮询 version.json 的代码（如果有），移除轮询定时器。保留：
- SW 注册代码
- beforeinstallprompt 监听
- 首次 fetch version.json 写入 localStorage（用于 changelog 公告）

**如果 index.html 没有轮询**（只是首次加载时 fetch 一次），则不改 index.html，只改 useVersionNotification.ts。

### 4. 工作流程说明

改造后的版本更新流程：
```
1. 用户打开应用 → SW 注册 → 检查更新
2. 发现新 SW → updatefound 事件 → 新 SW installing
3. 新 SW installed → 弹 Toast "发现新版本，点击刷新"
4. 用户点击 → postMessage skipWaiting → 新 SW 接管
5. controllerchange 事件 → 页面自动刷新
6. 刷新后 → 读取 version.json → 弹 changelog 公告（原有逻辑）
```

### 5. 自检清单
- [ ] updatefound 事件正确监听
- [ ] controllerchange 触发刷新
- [ ] Toast 点击触发 skipWaiting
- [ ] 原有 localStorage changelog 公告保留
- [ ] installPrompt / installApp 功能不受影响
- [ ] cleanup 正确移除事件监听
- [ ] 无 TODO / 占位符
````

---

## 📝 验收标准

- [ ] `useVersionNotification.ts` 新增 `updatefound` / `controllerchange` 监听
- [ ] `npm run build` 0 error
- [ ] 新版本部署后，用户能即时收到"发现新版本"提示

---

## 🧪 验证步骤

### 1. Build

```bash
npm run build
```

### 2. 模拟版本更新测试

```bash
npm run preview
# 打开浏览器 → 安装 SW → 关闭页面

# 修改 sw.js 的 CACHE_VERSION（如 v3.2.0 → v3.2.1）
# 重新 build
npm run build

# 再次打开页面 → 应立即弹出"发现新版本"Toast
# 点击 Toast → 页面刷新 → 弹 changelog 公告
```

### 3. 验证点

- [ ] 首次访问：SW 安装，无更新提示
- [ ] 第二次访问（无新版本）：无提示
- [ ] 有新版本时：立即弹"发现新版本"Toast
- [ ] 点击 Toast：页面刷新，新 SW 接管
- [ ] 刷新后：弹 changelog 公告（version.json 的内容）
- [ ] PWA 安装按钮仍可用

---

## ⚠️ 风险与回滚

**风险 1：** `controllerchange` 自动刷新可能打断用户操作（如表单未保存）。

**应对：** 不要自动刷新，改为 Toast 提示用户手动刷新。把 `window.location.reload()` 从 `controllerchange` 里移除，只在 Toast onClick 里 `postMessage skipWaiting`，让用户主动刷新。

**风险 2：** `updatefound` 事件在某些浏览器行为不一致。

**应对：** 保留原有 localStorage 机制作为兜底。

**回滚：**
```bash
git checkout HEAD -- src/hooks/useVersionNotification.ts public/sw.js index.html
```

---

## 📦 Commit Message

```
feat(pwa): 版本检测改用 updatefound 事件

[P1-03] useVersionNotification 新增 updatefound/controllerchange
监听，新版本可用时即时弹 Toast 提示，替代轮询 version.json
的延迟检测。保留 localStorage changelog 公告作为兜底。
```
