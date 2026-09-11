import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Alert, Spin, Tag, message, theme } from 'antd';
import { ReloadOutlined, CopyOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { issueCheckInToken } from './ticketService';
import { formatDateTime } from '@/utils/helpers';
import styles from './tickets.module.css';

/** 令牌有效期（分钟）——与数据库 ticket_qr_token 的默认值保持一致 */
const TTL_MINUTES = 15;

interface TicketQrModalProps {
  open: boolean;
  recordId: string;
  ticketTitle: string;
  eventTime: string;
  onClose: () => void;
}

/**
 * 我的签到码（参与者侧，A1 票务闭环）
 *
 * 令牌由服务端签发、15 分钟内有效，过期后必须重新签发——所以这里有倒计时与「刷新二维码」。
 * 二维码用 qrcode 库**动态 import 本地生成**（不进首屏包，且不把凭证发给第三方服务）。
 */
export default function TicketQrModal({ open, recordId, ticketTitle, eventTime, onClose }: TicketQrModalProps) {
  const { token } = theme.useToken();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [tokenText, setTokenText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const issue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const text = await issueCheckInToken(recordId, TTL_MINUTES);
      // 动态 import：二维码库只在真正要看码时才加载
      const QRCode = await import('qrcode');
      const url = await QRCode.toDataURL(text, { width: 260, margin: 1, errorCorrectionLevel: 'M' });
      setTokenText(text);
      setDataUrl(url);
      setSecondsLeft(TTL_MINUTES * 60);
    } catch {
      setError('签到码生成失败，请稍后重试');
      setDataUrl(null);
      setTokenText('');
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  // 打开时签发一次；关闭时清空，避免下次打开闪现上一张过期码
  useEffect(() => {
    if (open) {
      issue();
    } else {
      setDataUrl(null);
      setTokenText('');
      setSecondsLeft(0);
      setError(null);
    }
  }, [open, issue]);

  // 倒计时：归零即视为过期（真正的校验在服务端，这里只是提前告知用户）
  useEffect(() => {
    if (!open || secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [open, secondsLeft]);

  const expired = secondsLeft <= 0 && !!dataUrl;
  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  const handleCopyToken = () => {
    navigator.clipboard.writeText(tokenText).then(
      () => message.success('签到码已复制，可发给现场工作人员代扫'),
      () => message.error('复制失败，请手动选择文本复制'),
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="我的签到码"
      width={380}
      destroyOnHidden
    >
      <div className={styles.qrTicketTitle}>{ticketTitle}</div>
      {eventTime && (
        <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 12 }}>
          活动时间：{formatDateTime(eventTime)}
        </div>
      )}

      <div className={styles.qrBox}>
        {loading ? (
          <Spin description="生成中…"><div style={{ height: 240 }} /></Spin>
        ) : error ? (
          <Alert type="error" showIcon title={error} style={{ textAlign: 'left' }} />
        ) : dataUrl ? (
          <>
            <img src={dataUrl} alt="签到二维码" className={styles.qrImage} />
            {expired && (
              <div className={styles.qrMask}>
                <ClockCircleOutlined style={{ fontSize: 22 }} />
                <div>签到码已过期</div>
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className={styles.qrMeta}>
        {dataUrl && !expired ? (
          <Tag icon={<ClockCircleOutlined />} color={secondsLeft < 120 ? 'orange' : 'green'}>
            {mmss} 后过期
          </Tag>
        ) : (
          <Tag color="default">已过期</Tag>
        )}
        <span className={styles.qrHint}>请让现场工作人员扫码签到</span>
      </div>

      {/* 签到码原文：摄像头扫不出来时，粘给工作人员也能签（现场最常见的是屏幕反光/亮度低） */}
      {tokenText && !expired && (
        <div className={styles.qrTokenText} title={tokenText}>{tokenText}</div>
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        title="签到时间窗：活动开始前 2 小时至开始后 6 小时"
        description="二维码有效期 15 分钟，请到现场后再打开；截图转发无效（过期即失效）。"
      />

      <div className={styles.qrActions}>
        <Button icon={<CopyOutlined />} onClick={handleCopyToken} disabled={!tokenText || expired}>
          复制签到码
        </Button>
        <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={issue}>
          {expired ? '重新生成' : '刷新二维码'}
        </Button>
      </div>
    </Modal>
  );
}
