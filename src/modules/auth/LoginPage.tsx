import { useState } from 'react';
import { Form, Input, Button, Alert, message } from 'antd';
import { UserOutlined, IdcardOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
import { signUp, signIn, checkInviteCode, checkStudentId } from './authService';
import type { UserProfile } from './authService';
import styles from './auth.module.css';

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile) => void;
}

type Step = 'input' | 'setPassword' | 'login';

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    studentId: '',
    inviteCode: '',
    department: '',
  });
  const [passwordForm] = Form.useForm();

  /** Step 1: 验证邀请码 + 判断是注册还是登录 */
  const handleCheckCode = async () => {
    setError(null);
    if (!formData.name.trim() || !formData.studentId.trim() || !formData.inviteCode.trim()) {
      setError('请填写所有字段');
      return;
    }

    setLoading(true);
    try {
      // 验证邀请码
      const codeData = await checkInviteCode(formData.inviteCode.trim());
      if (!codeData) {
        setError('邀请码无效或已被使用');
        setLoading(false);
        return;
      }

      // 记下部门
      const dept = codeData.department;
      setFormData((prev) => ({ ...prev, department: dept }));

      // 检查学号是否已注册
      const exists = await checkStudentId(formData.studentId.trim());
      if (exists) {
        setStep('login'); // 老用户 → 输入密码登录
      } else {
        setStep('setPassword'); // 新用户 → 设置密码注册
      }
    } catch {
      setError('操作失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  /** 新用户：设置密码并注册 */
  const handleSetPassword = async (values: { password: string; confirmPassword: string }) => {
    setError(null);
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const { user, error: signUpError } = await signUp(
        formData.name.trim(),
        formData.studentId.trim(),
        formData.inviteCode.trim(),
        values.password,
        formData.department,
      );

      if (signUpError || !user) {
        setError(signUpError ?? '注册失败');
        return;
      }

      message.success('注册成功！欢迎加入学生会');
      onLoginSuccess(user);
    } catch {
      setError('注册失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  /** 老用户：输入密码登录 */
  const handleLogin = async (values: { password: string }) => {
    setError(null);
    setLoading(true);
    try {
      const { user, error: loginError } = await signIn(
        formData.studentId.trim(),
        values.password,
      );

      if (loginError || !user) {
        setError(loginError ?? '密码错误或账号不存在');
        return;
      }

      message.success('登录成功');
      onLoginSuccess(user);
    } catch {
      setError('登录失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        {/* Logo 区域 */}
        <div className={styles.logoSection}>
          <div className={styles.platformName}>🏛 学生会</div>
          <div className={styles.platformSlogan}>线上交流平台</div>
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            closable
            className={styles.errorAlert}
            onClose={() => setError(null)}
          />
        )}

        {/* Step 1: 输入基本信息 */}
        {step === 'input' && (
          <Form layout="vertical" onFinish={handleCheckCode} size="large">
            <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]}>
              <Input
                prefix={<UserOutlined />}
                placeholder="姓名"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              />
            </Form.Item>

            <Form.Item name="studentId" rules={[{ required: true, message: '请输入学号' }]}>
              <Input
                prefix={<IdcardOutlined />}
                placeholder="学号"
                value={formData.studentId}
                onChange={(e) => setFormData((p) => ({ ...p, studentId: e.target.value }))}
              />
            </Form.Item>

            <Form.Item name="inviteCode" rules={[{ required: true, message: '请输入邀请码' }]}>
              <Input
                prefix={<KeyOutlined />}
                placeholder="部门邀请码"
                value={formData.inviteCode}
                onChange={(e) => setFormData((p) => ({ ...p, inviteCode: e.target.value }))}
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                继续
              </Button>
            </Form.Item>
          </Form>
        )}

        {/* Step 2a: 新用户设置密码 */}
        {step === 'setPassword' && (
          <Form form={passwordForm} layout="vertical" onFinish={handleSetPassword} size="large">
            <div className={styles.stepHint}>
              🎉 首次登录，请设置密码
            </div>

            <Form.Item name="password" rules={[{ required: true, message: '请设置密码' }, { min: 6, message: '密码至少 6 位' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="设置密码（至少 6 位）" />
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

            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                注册并登录
              </Button>
            </Form.Item>

            <Button type="link" block onClick={() => { setStep('input'); setError(null); }}>
              返回上一步
            </Button>
          </Form>
        )}

        {/* Step 2b: 老用户输入密码 */}
        {step === 'login' && (
          <Form layout="vertical" onFinish={handleLogin} size="large">
            <div className={styles.stepHint}>
              👋 欢迎回来，{formData.name}
            </div>

            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="输入密码" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                登录
              </Button>
            </Form.Item>

            <Button type="link" block onClick={() => { setStep('input'); setError(null); }}>
              返回上一步
            </Button>
          </Form>
        )}

        <div className={styles.tipText}>
          仅限学生会内部成员使用
        </div>
      </div>
    </div>
  );
}
