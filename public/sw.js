/**
 * PWA Service Worker — 学生会线上交流平台
 *
 * 缓存策略：
 *   HTML（导航请求） → stale-while-revalidate：立即回缓存 shell，后台拉新写回（打开零等待，更新由版本机制提示）
 *   静态资源（JS/CSS/图片） → 缓存优先，回退网络（首次访问后离线可用）
 *   API 请求（Supabase）/ version.json → 仅网络，不缓存
 *
 * 版本更新：
 *   修改 CACHE_VERSION → 新 SW 安装 → 等待激活 → 主线程监听 updatefound → 显示刷新提示
 *   用户点击提示 → skipWaiting → 新 SW 接管（controllerchange）→ 主线程发 PURGE_ALL 清缓存 → reload
 *   activate 仅清理"上上代"及更早缓存（保留 2 代），保护仍持有旧 HTML 的会话不因资源被清而白屏
 */

// ======================== 配置 ========================

var CACHE_VERSION = 'v4.2.2';
var APP_SHELL = 'app-shell-' + CACHE_VERSION;
var APP_ASSETS = 'app-assets-' + CACHE_VERSION;

// 动态计算 base path（适配 GitHub Pages 子目录 /student-union-platform/）
var BASE = self.location.pathname.replace(/\/sw\.js$/, '');

// Shell 文件（体积小、不常变，安装时预缓存）
var SHELL_FILES = [
  BASE + '/manifest.json',
  BASE + '/favicon.svg',
  BASE + '/icon-192.svg',
  BASE + '/icon-512.svg',
  BASE + '/version.json',
  BASE + '/index.html',
];

// ======================== 工具函数 ========================

function isNavigation(request) {
  return request.mode === 'navigate';
}

// 带非 html 扩展名的路径 = 真实文件（如 使用指南.md）。
// 这类导航若也回 shell，会被 SPA 劫持成首页（v4.2.1 生产实测踩坑：点"使用指南"打开 md 反而落到首页）
function isRealFile(url) {
  return /\.(?!html?$)[a-z0-9]+$/i.test(url.pathname);
}

function isStaticAsset(url) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json)$/i.test(url);
}

function isApiRequest(url) {
  return url.includes('supabase.co');
}

// ======================== Install ========================

self.addEventListener('install', function (event) {
  console.log('[SW] install — CACHE_VERSION:', CACHE_VERSION);
  event.waitUntil(
    caches.open(APP_SHELL).then(function (cache) {
      return cache.addAll(SHELL_FILES).catch(function (err) {
        // 预缓存失败不影响 SW 安装（某个文件 404 不应阻断整个 SW）
        console.warn('[SW] Shell 预缓存部分失败:', err);
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ======================== Activate ========================

// 数字感知的版本比较（v4.10.0 必须大于 v4.9.0，字典序会排错）
function compareVersions(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

self.addEventListener('activate', function (event) {
  console.log('[SW] activate — CACHE_VERSION:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function (keys) {
      // 保留最近 2 代缓存（当前 + 上一代）：
      // stale-while-revalidate 下，还持有旧 HTML 的会话引用旧 hash 资源，
      // 若 activate 一律清光旧缓存，旧会话刷新后会"新 HTML + 资源 404"白屏。
      var prefixes = ['app-shell-', 'app-assets-'];
      var toDelete = [];
      prefixes.forEach(function (prefix) {
        var gens = keys
          .filter(function (key) { return key.indexOf(prefix) === 0; })
          .sort(compareVersions);
        // 升序排列后，删掉除最新 2 代以外的所有旧代
        toDelete = toDelete.concat(gens.slice(0, Math.max(0, gens.length - 2)));
      });
      return Promise.all(
        toDelete.map(function (key) {
          console.log('[SW] 清理旧代缓存:', key);
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ======================== Fetch ========================

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // API 请求：仅走网络，不拦截
  if (isApiRequest(url.href)) {
    return;
  }

  // 版本检查：始终直连网络（带唯一 ?t= 的它若被 assets 缓存按 URL 记账会无限堆积）
  if (url.pathname.indexOf('/version.json') !== -1) {
    return;
  }

  // 导航请求（HTML 页面）：stale-while-revalidate
  // 只查本代缓存（APP_SHELL）——全局 caches.match 会按缓存创建顺序命中旧代 shell，
  // 新版预缓存会被旧版永久遮蔽（v4.1.0 生产实测踩坑）；SPA + HashRouter 所有导航同一份 HTML
  if (isNavigation(event.request) && !isRealFile(url)) {
    var SHELL_URL = BASE + '/index.html';
    event.respondWith(
      caches.open(APP_SHELL).then(function (cache) {
        return cache.match(SHELL_URL).then(function (cached) {
          var networkUpdate = fetch(SHELL_URL).then(function (response) {
            if (response && response.ok) {
              var cloned = response.clone();
              cache.put(SHELL_URL, cloned);
            }
            return response;
          }).catch(function () {
            // 后台更新失败（如离线）：已有缓存时静默忽略；无缓存时返回错误响应走浏览器离线页
            return Response.error();
          });
          return cached || networkUpdate;
        });
      })
    );
    return;
  }

  // 静态资源：缓存优先 → 回退网络
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        // 缓存未命中 → 网络请求并缓存
        return fetch(event.request).then(function (response) {
          var cloned = response.clone();
          caches.open(APP_ASSETS).then(function (cache) {
            cache.put(event.request, cloned);
          });
          return response;
        });
      })
    );
    return;
  }

  // 其他请求：网络优先
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(event.request);
    })
  );
});

// ======================== Message（主线程通信） ========================

self.addEventListener('message', function (event) {
  // 用户点击更新提示：新 SW 自己完成「接管 + 清旧代」，全过程在 Worker 上下文内执行。
  // 不能依赖主线程在 controllerchange 后回发 PURGE_ALL——reload 可能跑赢激活（v4.1.0 生产实测踩坑），
  // 而 Worker 在状态切换后仍是同一执行环境，waitUntil 保证清理必然完成。
  if (event.data && event.data.type === 'ACTIVATE_AND_PURGE_OLD') {
    console.log('[SW] 收到 ACTIVATE_AND_PURGE_OLD：接管并清理旧代缓存');
    event.waitUntil((async function () {
      await self.skipWaiting();
      await self.clients.claim();
      var keys = await caches.keys();
      await Promise.all(
        keys
          .filter(function (key) {
            return (key.indexOf('app-shell-') === 0 || key.indexOf('app-assets-') === 0) &&
                   key !== APP_SHELL && key !== APP_ASSETS;
          })
          .map(function (key) {
            console.log('[SW] 清理旧代缓存:', key);
            return caches.delete(key);
          })
      );
    })());
  }
});
