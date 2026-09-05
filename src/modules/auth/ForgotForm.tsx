import { Form, Input, Button } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import styles from './auth.module.css';

/* === 忘记密码第一步：邀请码验证身份 === */

interface ForgotFormProps {
  value: string;
  loading: boolean;
  onChange: (v: string) => void;
  onVerify: () => void;
  onBack: () => void;
}

export default function ForgotForm({
  value,
  loading,
  onChange,
  onVerify,
  onBack,
}: ForgotFormProps) {
  return (
    <Form layout="vertical" onFinish={onVerify} size="large">
      <div className={styles.stepHint}>通过邀请码验证身份后即可重置密码</div>
      <Form.Item rules={[{ required: true, message: '请输入邀请码' }]}>
        <Input
          prefix={<KeyOutlined />}
          placeholder="输入你的邀请码以验证身份"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          验证身份
        </Button>
      </Form.Item>
      <Button type="link" block onClick={onBack}>
        返回登录
      </Button>
    </Form>
  );
}
