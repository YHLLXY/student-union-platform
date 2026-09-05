import { useState } from 'react';
import { Modal, Input, Button, message } from 'antd';
import { fetchDeveloperUser } from './authService';

/* === 开发者入口弹窗 === */

interface DevEntryModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (dev: { name: string; student_id: string; key: string }) => void;
}

export default function DevEntryModal({ open, onClose, onVerified }: DevEntryModalProps) {
  const [devKey, setDevKey] = useState('');
  const [devLoading, setDevLoading] = useState(false);

  const handleDevLogin = async () => {
    if (!devKey.trim()) {
      message.error('请输入开发者密钥');
      return;
    }
    setDevLoading(true);
    try {
      const VALID_DEV_KEY = import.meta.env.VITE_DEV_KEY || 'DEV2026PRESIDENT';
      if (devKey.trim() !== VALID_DEV_KEY) {
        message.error('密钥无效');
        return;
      }
      const developer = await fetchDeveloperUser();
      if (!developer) {
        message.error('系统中无开发者账号，请先注册');
        return;
      }
      onVerified({ name: developer.name, student_id: developer.student_id, key: devKey.trim() });
      setDevKey('');
    } catch {
      message.error('操作失败，请检查网络');
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => { onClose(); setDevKey(''); }}
      footer={null}
      width={360}
      title="开发者入口"
    >
      <div style={{ padding: '8px 0' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          输入开发者密钥以直接使用管理员账号登录
        </p>
        <Input.Password
          placeholder="开发者密钥"
          value={devKey}
          onChange={(e) => setDevKey(e.target.value)}
          onPressEnter={handleDevLogin}
          style={{ marginBottom: 12 }}
        />
        <Button type="primary" block loading={devLoading} onClick={handleDevLogin}>
          验证并登录
        </Button>
      </div>
    </Modal>
  );
}
