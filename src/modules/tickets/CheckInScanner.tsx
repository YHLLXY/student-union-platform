import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, Alert, Tag, Space, message, theme } from 'antd';
import { CameraOutlined, StopOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined } from '@ant-design/icons';
import { logger } from '@/diagnostics';
import { checkInTicket } from './ticketService';
import type { CheckInResult } from '@/types/database';
import styles from './tickets.module.css';

const log = logger.for('tickets/CheckInScanner');

interface CheckInScannerProps {
  open: boolean;
  onClose: () => void;
  /** 每成功签到一次回调（外面据此刷新名单/统计） */
  onCheckedIn?: () => void;
}

type ScanLog = { key: string; ok: boolean; message: string; at: string };

const READER_ID = 'ticket-checkin-reader';

/** 扫码后暂停的毫秒数：避免同一张二维码在取景框里被连续识别，刷屏且浪费请求 */
const RESUME_DELAY_MS = 2500;

/**
 * 扫码签到（组织者侧，A1 票务闭环）
 *
 * 摄像头扫码用 html5-qrcode（Apache-2.0）**动态 import**：不进首屏包，且只有组织者
 * 打开本窗口时才加载。摄像头不可用（无权限 / 非 HTTPS / 桌面无摄像头）时，
 * 「手输签到码」是等价入口——签到码就是二维码里的那串文本，粘进来同样能签。
 *
 * 校验全在服务端（令牌签名 + 权限 + 时间窗 + 防重复），本组件只负责取码与展示结果。
 */
export default function CheckInScanner({ open, onClose, onCheckedIn }: CheckInScannerProps) {
  const { token } = theme.useToken();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // 用收窄的结构类型收住库实例：动态 import 下不便做模块级 import type
  const scannerRef = useRef<{
    stop: () => Promise<void>;
    clear: () => void;
    pause: (shouldPause: boolean) => void;
    resume: () => void;
  } | null>(null);

  const stopScan = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (!scanner) return;
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      // 未启动/已停止时 stop 会抛，忽略即可
    }
  }, []);

  const handleToken = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;

    // 暂停取景识别，2.5 秒后恢复：同一张码不会被连续提交
    try { scannerRef.current?.pause(true); } catch { /* 未在运行则忽略 */ }

    setBusy(true);
    const result: CheckInResult = await checkInTicket(text);
    setBusy(false);

    setLogs((prev) => [
      { key: `${Date.now()}`, ok: result.ok, message: result.message, at: new Date().toLocaleTimeString('zh-CN', { hour12: false }) },
      ...prev.slice(0, 19),
    ]);

    if (result.ok) {
      // 重复扫码返回「已签到」也是 ok=true，用 code 区分要不要提示成功
      if (result.code === 'checked_in') {
        message.success(result.message);
        onCheckedIn?.();
      } else {
        message.info(result.message);
      }
    } else {
      message.error(result.message);
    }

    if (scannerRef.current) {
      setTimeout(() => {
        try { scannerRef.current?.resume(); } catch { /* 已停止则忽略 */ }
      }, RESUME_DELAY_MS);
    }
  }, [busy, onCheckedIn]);

  const startScan = useCallback(async () => {
    setCameraError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        (decoded) => { void handleToken(decoded); },
        () => { /* 单帧未识别：忽略，扫描继续 */ },
      );
    } catch (err) {
      setScanning(false);
      scannerRef.current = null;
      setCameraError('摄像头不可用（未授权或本机无摄像头），请改用手输签到码。');
      log.warn('启动摄像头失败，降级手输签到码', { error: err instanceof Error ? err.message : String(err) });
    }
  }, [handleToken]);

  // 关闭时务必停掉摄像头，否则指示灯常亮、且再次打开会占用设备
  useEffect(() => {
    if (!open) void stopScan();
  }, [open, stopScan]);

  useEffect(() => () => { void stopScan(); }, [stopScan]);

  const handleManual = () => {
    if (!manualCode.trim()) {
      message.warning('请粘贴或输入签到码');
      return;
    }
    void handleToken(manualCode);
    setManualCode('');
  };

  return (
    <Modal
      open={open}
      onCancel={() => { void stopScan(); onClose(); }}
      footer={null}
      title="扫码签到"
      width={460}
      destroyOnHidden
    >
      <div className={styles.scanStage}>
        <div id={READER_ID} className={styles.scanReader} />
        {!scanning && (
          <div className={styles.scanPlaceholder}>
            <CameraOutlined style={{ fontSize: 28, color: token.colorTextTertiary }} />
            <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 6 }}>
              {cameraError ? '摄像头未启用' : '点击下方按钮开启摄像头扫码'}
            </div>
          </div>
        )}
        {scanning && <div className={styles.scanLine} aria-hidden />}
      </div>

      <Space style={{ marginTop: 12 }}>
        {scanning ? (
          <Button icon={<StopOutlined />} onClick={() => { void stopScan(); }}>停止扫描</Button>
        ) : (
          <Button type="primary" icon={<CameraOutlined />} onClick={() => { void startScan(); }}>
            开启摄像头扫码
          </Button>
        )}
        <span style={{ fontSize: 12, color: token.colorTextTertiary }}>
          扫描持票人的签到二维码
        </span>
      </Space>

      {cameraError && (
        <Alert type="warning" showIcon style={{ marginTop: 12 }} title={cameraError} />
      )}

      <div className={styles.manualRow}>
        <Input
          prefix={<EditOutlined />}
          placeholder="手输签到码（SUP1.… 那串文本）"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          onPressEnter={handleManual}
          allowClear
        />
        <Button onClick={handleManual} loading={busy}>确认签到</Button>
      </div>

      {logs.length > 0 && (
        <div className={styles.scanLogs}>
          {logs.map((l) => (
            <div key={l.key} className={styles.scanLogItem}>
              {l.ok
                ? <CheckCircleOutlined style={{ color: token.colorSuccess }} />
                : <CloseCircleOutlined style={{ color: token.colorError }} />}
              <span className={styles.scanLogText}>{l.message}</span>
              <span className={styles.scanLogTime}>{l.at}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Tag color="blue">签到成功 +1 积分</Tag>
        <Tag color="default">同一张票重复扫码不会重复加分</Tag>
      </div>
    </Modal>
  );
}
