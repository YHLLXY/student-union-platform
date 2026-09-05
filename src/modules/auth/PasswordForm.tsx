import { Form, Input, Button } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { validatePasswordStrength } from './authService';
import styles from './auth.module.css';

/* === 密码步骤（登录 / 首次设置 / 忘记密码重置 三态共用） === */

type PasswordMode = 'login' | 'setPassword' | 'reset';

interface PasswordFormProps {
  mode: PasswordMode;
  /** 提示文案（欢迎回来 / 首次登录 / 身份验证通过） */
  hint: string;
  loading: boolean;
  onSubmit: (values: { password: string; confirmPassword?: string }) => void;
  /** 登录态下展示「忘记密码」入口 */
  onForgot?: () => void;
  onBack: () => void;
}

const SUBMIT_LABEL: Record<PasswordMode, string> = {
  login: '登录',
  setPassword: '注册并登录',
  reset: '重置密码并登录',
};

export default function PasswordForm({
  mode,
  hint,
  loading,
  onSubmit,
  onForgot,
  onBack,
}: PasswordFormProps) {
  const [form] = Form.useForm();
  const isSetting = mode === 'setPassword' || mode === 'reset';

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={(values: { password: string; confirmPassword?: string }) => onSubmit(values)}
      size="large"
    >
      <div className={styles.stepHint}>{hint}</div>
      {isSetting && (
        <>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请设置密码' },
              {
                validator(_, value) {
                  if (!value) return Promise.resolve();
                  const check = validatePasswordStrength(value);
                  if (!check.valid) return Promise.reject(new Error(check.message));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="设置密码（至少 8 位，含字母+数字）" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
          </Form.Item>
        </>
      )}
      {mode === 'login' && (
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="输入密码" />
        </Form.Item>
      )}
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {SUBMIT_LABEL[mode]}
        </Button>
      </Form.Item>
      {mode === 'login' && onForgot && (
        <Button type="link" block onClick={onForgot}>
          忘记密码？
        </Button>
      )}
      <Button type="link" block onClick={onBack}>
        返回上一步
      </Button>
    </Form>
  );
}
