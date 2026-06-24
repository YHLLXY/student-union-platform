import { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { updatePassword } from './profileService';

interface ChangePasswordProps {
  onClose: () => void;
}

export default function ChangePassword({ onClose }: ChangePasswordProps) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { password: string; confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    const { error } = await updatePassword(values.password);
    setLoading(false);

    if (error) {
      message.error(error);
    } else {
      message.success('密码修改成功');
      onClose();
    }
  };

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>🔒 修改密码</h3>
      <Form layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="password"
          label="新密码"
          rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '至少 6 位' }]}
        >
          <Input.Password placeholder="新密码（至少 6 位）" />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          rules={[
            { required: true, message: '请确认密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入新密码" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>确认修改</Button>
        </Form.Item>
      </Form>
    </div>
  );
}
