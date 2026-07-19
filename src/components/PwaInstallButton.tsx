import { useState, useEffect, useCallback } from 'react';
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA 手动安装按钮
 *
 * 展示时机：浏览器支持 PWA 安装且用户尚未安装时
 * 点击后触发系统安装弹窗，安装成功后按钮自动隐藏
 */
export default function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // 检查是否已有缓存的 prompt（index.html 中监听到的）
    // @ts-expect-error 自定义全局变量
    const existing = window.__pwaInstallPrompt;
    if (existing) {
      setDeferredPrompt(existing);
    }

    // 监听后续的 beforeinstallprompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(evt);
      // @ts-expect-error
      window.__pwaInstallPrompt = evt;
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      // @ts-expect-error
      window.__pwaInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstalled(true);
        setDeferredPrompt(null);
        // @ts-expect-error
        window.__pwaInstallPrompt = null;
      }
    } catch {
      // 用户取消安装，不处理
    }
  }, [deferredPrompt]);

  // 已安装或无安装能力 → 不显示
  if (installed || !deferredPrompt) return null;

  return (
    <Button
      type="text"
      icon={<DownloadOutlined />}
      onClick={handleInstall}
      style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16 }}
      title="安装应用到桌面"
    />
  );
}
