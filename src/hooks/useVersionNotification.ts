import { useEffect, useRef, useState, useCallback } from 'react';
import { notification } from 'antd';

/** Chrome 非标准：beforeinstallprompt 事件 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface VersionData {
  version: string;
  date: string;
  changelog: string[];
}

const LAST_VERSION_KEY = 'pwa_last_version';
const NEW_VERSION_KEY = 'pwa_new_version';

/**
 * PWA 版本更新通知 hook
 *
 * 检测逻辑：
 *   1. SW 注册代码（index.html）检测到新版本后，将 version.json 数据存入 localStorage
 *   2. React 挂载后调用此 hook，读取 localStorage 中的新版本数据
 *   3. 如果发现当前版本 > 上次记录的版本 → 弹出更新公告
 *   4. 同时暴露 installPrompt，供"手动安装"按钮使用
 */
export function useVersionNotification() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const hasChecked = useRef(false);

  // 手动触发 PWA 安装
  const installApp = useCallback(async () => {
    if (!installPrompt) return false;
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      setInstallPrompt(null);
      // @ts-expect-error 清理全局引用
      window.__pwaInstallPrompt = null;
      return result.outcome === 'accepted';
    } catch {
      return false;
    }
  }, [installPrompt]);

  useEffect(() => {
    // 只检查一次
    if (hasChecked.current) return;
    hasChecked.current = true;

    // ---- ① 版本更新通知 ----
    try {
      const raw = localStorage.getItem(NEW_VERSION_KEY);
      if (raw) {
        const data: VersionData = JSON.parse(raw);
        const lastVer = localStorage.getItem(LAST_VERSION_KEY);

        if (data.version && data.version !== lastVer) {
          // 弹出更新公告
          const changelogText = data.changelog?.length
            ? data.changelog.map((c, i) => `${i + 1}. ${c}`).join('\n')
            : '请查看应用最新变化';

          notification.info({
            message: `📢 平台已更新至 ${data.version}`,
            description: changelogText,
            duration: 8,
            placement: 'topRight',
            style: { whiteSpace: 'pre-line' },
          });

          // 记录已读版本
          localStorage.setItem(LAST_VERSION_KEY, data.version);
        }
        // 清除临时标记
        localStorage.removeItem(NEW_VERSION_KEY);
      }
    } catch {
      // 静默降级 — JSON 解析失败不影响应用
    }

    // ---- ② 安装提示（beforeinstallprompt 兜底） ----
    // index.html 已监听 beforeinstallprompt 并存储到 window.__pwaInstallPrompt
    // @ts-expect-error 自定义全局变量
    const prompt = window.__pwaInstallPrompt;
    if (prompt) {
      setInstallPrompt(prompt);
    }

    // 监听后续的 beforeinstallprompt 事件
    const handler = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      setInstallPrompt(evt);
      // @ts-expect-error 自定义全局变量
      window.__pwaInstallPrompt = evt;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  return { installPrompt, installApp };
}
