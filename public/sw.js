/**
 * PWA Service Worker — 学生会线上交流平台
 *
 * 缓存策略：
 *   HTML（导航请求） → 网络优先，回退缓存（确保用户始终拿到最新版）
 *   静态资源（JS/CSS/图片） → 缓存优先，回退网络（首次访问后离线可用）
 *   API 请求（Supabase） → 仅网络，不缓存
 *
 * 版本更新：
 *   修改 CACHE_VERSION → 新 SW 安装 → skipWaiting → activate → 清理旧缓存
 *   主线程监听 updatefound → 显示刷新提示
 */

// ======================== 配置 ========================

var CACHE_VERSION = 'v3.1.0';
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

self.addEventListener('activate', function (event) {
  console.log('[SW] activate — CACHE_VERSION:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return (key.startsWith('app-shell-') || key.startsWith('app-assets-')) &&
                   key !== APP_SHELL &&
                   key !== APP_ASSETS;
          })
          .map(function (key) {
            console.log('[SW] 清理旧缓存:', key);
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

  // 导航请求（HTML 页面）：网络优先 → 回退缓存
  if (isNavigation(event.request)) {
    event.respondWith(
      fetch(event.request).then(function (response) {
        // 网络成功 → 更新缓存
        var cloned = response.clone();
        caches.open(APP_SHELL).then(function (cache) {
          cache.put(event.request, cloned);
        });
        return response;
      }).catch(function () {
        // 网络失败（离线） → 尝试缓存
        return caches.match(event.request).then(function (cached) {
          return cached || caches.match(BASE + '/index.html');
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
  if (event.data && event.data.type === 'skipWaiting') {
    console.log('[SW] 收到 skipWaiting 指令');
    self.skipWaiting();
  }
});
