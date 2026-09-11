import { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { useAuth, useAuthUpdate } from '@/components/AuthContext';
import { updateMyProfile } from './profileService';
import type { ProfilePatch } from './profileService';
import AvatarUploader from './AvatarUploader';

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  name: string;
  contact_phone?: string;
  contact_email?: string;
}

/** 空串一律存 NULL：否则「填了又清空」会在库里留下空字符串，与「未填写」表达重复 */
function emptyToNull(v?: string): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/**
 * 表单主体。**刻意不放进 Modal 的常驻子树里**，而是由 open 条件挂载（同 PostList 的详情弹窗写法）：
 * 每次打开都是全新挂载 → 初值直接取自最新档案，不需要在「打开后」回填。
 * 早先用 Modal 的 afterOpenChange + setFieldsValue 回填，结果与用户输入抢时序：
 * 面板动画结束（约 300ms）后才回填，会把用户在这段时间里敲进去的内容覆盖掉 —— E2E 抓到过这个 bug。
 */
function ProfileEditForm({ onClose }: { onClose: () => void }) {
  const user = useAuth();
  const patchProfile = useAuthUpdate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: FormValues) => {
    setSaving(true);
    const patch: ProfilePatch = {
      name: values.name.trim(),
      contact_phone: emptyToNull(values.contact_phone),
      contact_email: emptyToNull(values.contact_email),
      avatar_url: avatarUrl,
    };
    const ok = await updateMyProfile(user.id, patch);
    setSaving(false);

    if (!ok) {
      message.error('保存失败，请稍后重试');
      return;
    }
    // 同步内存与本地缓存：顶部头像 / 个人信息卡片立刻反映新值，不必等下次刷新
    patchProfile(patch as Partial<typeof user>);
    message.success('资料已更新');
    onClose();
  };

  return (
    <Form
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        name: user.name,
        contact_phone: user.contact_phone ?? undefined,
        contact_email: user.contact_email ?? undefined,
      }}
    >
      <Form.Item label="头像">
        <AvatarUploader value={avatarUrl} onChange={setAvatarUrl} userId={user.id} />
      </Form.Item>

      <Form.Item
        name="name"
        label="显示名"
        rules={[
          { required: true, message: '请输入显示名' },
          { max: 20, message: '显示名不超过 20 个字' },
        ]}
      >
        <Input placeholder="在平台中展示的姓名" maxLength={20} />
      </Form.Item>

      <Form.Item
        name="contact_phone"
        label="联系方式（手机 / 微信）"
        rules={[{ max: 40, message: '不超过 40 个字符' }]}
      >
        <Input placeholder="选填，便于同事联系你" maxLength={40} />
      </Form.Item>

      <Form.Item
        name="contact_email"
        label="联系邮箱"
        rules={[
          { type: 'email', message: '邮箱格式不正确' },
          { max: 60, message: '不超过 60 个字符' },
        ]}
      >
        <Input placeholder="选填" maxLength={60} />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
        <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
        <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
      </Form.Item>
    </Form>
  );
}

export default function ProfileEditModal({ open, onClose }: ProfileEditModalProps) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={460} title="编辑资料">
      {open && <ProfileEditForm onClose={onClose} />}
    </Modal>
  );
}
