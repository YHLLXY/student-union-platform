import { useState } from 'react';
import { Form, Input, Button, Alert, message, Tabs } from 'antd';
import { UserOutlined, IdcardOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
import { signUp, signIn, checkInviteCode, checkStudentId, signUpTeacher, checkTeacherCode, verifyUser, selfResetPassword } from './authService';
import type { UserProfile } from './authService';
import styles from './auth.module.css';

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile) => void;
}

type Step = 'input' | 'setPassword' | 'login' | 'forgot';

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [tab, setTab] = useState<'student' | 'teacher'>('student');
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 学生表单数据
  const [studentForm, setStudentForm] = useState({
    name: '',
    studentId: '',
    inviteCode: '',
    department: '',
    role: '',
  });

  // 教师表单数据
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    teacherId: '',
    inviteCode: '',
  });

  const [passwordForm] = Form.useForm();

  // ========== 学生流程 ==========

  const handleStudentCheck = async () => {
    setError(null);
    if (!studentForm.name.trim() || !studentForm.studentId.trim() || !studentForm.inviteCode.trim()) {
      setError('请填写所有字段');
      return;
    }
    setLoading(true);
    try {
      const codeData = await checkInviteCode(studentForm.inviteCode.trim());
      if (!codeData) {
        setError('邀请码无效或已被使用');
        setLoading(false);
        return;
      }
      const dept = codeData.department as string;
      const role = codeData.role as string ?? 'volunteer';
      setStudentForm((p) => ({ ...p, department: dept, role }));

      const exists = await checkStudentId(studentForm.studentId.trim());
      if (exists) {
        setStep('login');
      } else {
        setStep('setPassword');
      }
    } catch {
      setError('操作失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentRegister = async (values: { password: string; confirmPassword: string }) => {
    setError(null);
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const { user, error: signUpError } = await signUp(
        studentForm.name.trim(),
        studentForm.studentId.trim(),
        studentForm.inviteCode.trim(),
        values.password,
        studentForm.department,
        studentForm.role,
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

  const handleStudentLogin = async (values: { password: string }) => {
    setError(null);
    setLoading(true);
    try {
      const { user, error: loginError } = await signIn(
        studentForm.studentId.trim(),
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

  // ========== 教师流程 ==========

  const handleTeacherCheck = async () => {
    setError(null);
    if (!teacherForm.name.trim() || !teacherForm.teacherId.trim() || !teacherForm.inviteCode.trim()) {
      setError('请填写所有字段');
      return;
    }
    setLoading(true);
    try {
      const codeData = await checkTeacherCode(teacherForm.inviteCode.trim());
      if (!codeData) {
        setError('教师邀请码无效或已被使用');
        setLoading(false);
        return;
      }
      const exists = await checkStudentId(teacherForm.teacherId.trim());
      if (exists) {
        setStep('login');
      } else {
        setStep('setPassword');
      }
    } catch {
      setError('操作失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherRegister = async (values: { password: string; confirmPassword: string }) => {
    setError(null);
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const { user, error: signUpError } = await signUpTeacher(
        teacherForm.name.trim(),
        teacherForm.teacherId.trim(),
        teacherForm.inviteCode.trim(),
        values.password,
      );
      if (signUpError || !user) {
        setError(signUpError ?? '注册失败');
        return;
      }
      message.success('教师注册成功！');
      onLoginSuccess(user);
    } catch {
      setError('注册失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherLogin = async (values: { password: string }) => {
    setError(null);
    setLoading(true);
    try {
      const { user, error: loginError } = await signIn(
        teacherForm.teacherId.trim(),
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

  // ========== 忘记密码流程 ==========

  const [forgotAuthId, setForgotAuthId] = useState('');

  const handleForgotVerify = async () => {
    setError(null);
    const id = isStudent ? studentForm.studentId.trim() : teacherForm.teacherId.trim();
    const name = isStudent ? studentForm.name.trim() : teacherForm.name.trim();
    const code = isStudent ? studentForm.inviteCode.trim() : teacherForm.inviteCode.trim();

    if (!name || !id || !code) {
      setError('请先在上一步填写姓名、学号/工号和邀请码');
      return;
    }
    setLoading(true);
    try {
      // 验证身份：姓名 + 学号匹配
      const user = await verifyUser(name, id);
      if (!user) {
        setError('姓名与学号/工号不匹配，请检查');
        setLoading(false);
        return;
      }
      // 验证邀请码有效
      const codeData = isStudent ? await checkInviteCode(code) : await checkTeacherCode(code);
      if (!codeData) {
        setError('邀请码无效或已被使用');
        setLoading(false);
        return;
      }
      setForgotAuthId(user.authId);
      setStep('setPassword');
    } catch {
      setError('操作失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (values: { password: string; confirmPassword: string }) => {
    setError(null);
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const ok = await selfResetPassword(forgotAuthId, values.password);
      if (ok) {
        message.success('密码重置成功，请登录');
        setStep('login');
      } else {
        setError('重置失败，请联系管理员');
      }
    } catch {
      setError('操作失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  // ========== 共享的密码步骤（根据当前 tab 判断流程） ==========

  const isStudent = tab === 'student';

  const handlePasswordSubmit = async (values: { password?: string; confirmPassword?: string }) => {
    if (forgotAuthId) {
      await handleForgotReset({ password: values.password!, confirmPassword: values.confirmPassword! });
      return;
    }
    if (step === 'setPassword') {
      if (isStudent) {
        await handleStudentRegister({ password: values.password!, confirmPassword: values.confirmPassword! });
      } else {
        await handleTeacherRegister({ password: values.password!, confirmPassword: values.confirmPassword! });
      }
    } else {
      if (isStudent) {
        await handleStudentLogin({ password: values.password! });
      } else {
        await handleTeacherLogin({ password: values.password! });
      }
    }
  };

  // ========== 渲染 ==========

  const renderStudentForm = () => (
    <Form layout="vertical" onFinish={handleStudentCheck} size="large">
      <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]}>
        <Input
          prefix={<UserOutlined />}
          placeholder="姓名"
          value={studentForm.name}
          onChange={(e) => setStudentForm((p) => ({ ...p, name: e.target.value }))}
        />
      </Form.Item>
      <Form.Item name="studentId" rules={[{ required: true, message: '请输入学号' }]}>
        <Input
          prefix={<IdcardOutlined />}
          placeholder="学号"
          value={studentForm.studentId}
          onChange={(e) => setStudentForm((p) => ({ ...p, studentId: e.target.value }))}
        />
      </Form.Item>
      <Form.Item name="inviteCode" rules={[{ required: true, message: '请输入邀请码' }]}>
        <Input
          prefix={<KeyOutlined />}
          placeholder="部门邀请码"
          value={studentForm.inviteCode}
          onChange={(e) => setStudentForm((p) => ({ ...p, inviteCode: e.target.value }))}
        />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          继续
        </Button>
      </Form.Item>
    </Form>
  );

  const renderTeacherForm = () => (
    <Form layout="vertical" onFinish={handleTeacherCheck} size="large">
      <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]}>
        <Input
          prefix={<UserOutlined />}
          placeholder="姓名"
          value={teacherForm.name}
          onChange={(e) => setTeacherForm((p) => ({ ...p, name: e.target.value }))}
        />
      </Form.Item>
      <Form.Item name="teacherId" rules={[{ required: true, message: '请输入工号' }]}>
        <Input
          prefix={<IdcardOutlined />}
          placeholder="工号"
          value={teacherForm.teacherId}
          onChange={(e) => setTeacherForm((p) => ({ ...p, teacherId: e.target.value }))}
        />
      </Form.Item>
      <Form.Item name="inviteCode" rules={[{ required: true, message: '请输入教师邀请码' }]}>
        <Input
          prefix={<KeyOutlined />}
          placeholder="教师邀请码"
          value={teacherForm.inviteCode}
          onChange={(e) => setTeacherForm((p) => ({ ...p, inviteCode: e.target.value }))}
        />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          继续
        </Button>
      </Form.Item>
    </Form>
  );

  const renderPasswordStep = () => (
    <Form form={passwordForm} layout="vertical" onFinish={handlePasswordSubmit} size="large">
      <div className={styles.stepHint}>
        {forgotAuthId
          ? '🔒 身份验证通过，请设置新密码'
          : step === 'setPassword'
            ? '🎉 首次登录，请设置密码'
            : (isStudent ? `👋 欢迎回来，${studentForm.name}` : `👋 欢迎回来，${teacherForm.name}`)}
      </div>
      {(step === 'setPassword' || !!forgotAuthId) && (
        <>
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
        </>
      )}
      {step === 'login' && (
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="输入密码" />
        </Form.Item>
      )}
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {forgotAuthId ? '重置密码并登录' : step === 'setPassword' ? '注册并登录' : '登录'}
        </Button>
      </Form.Item>
      {step === 'login' && (
        <Button type="link" block onClick={() => { setStep('forgot'); setError(null); }}>
          忘记密码？
        </Button>
      )}
      <Button type="link" block onClick={() => { setStep(forgotAuthId ? 'forgot' : 'input'); setForgotAuthId(''); setError(null); }}>
        返回上一步
      </Button>
    </Form>
  );

  const renderForgotStep = () => (
    <div>
      <div className={styles.stepHint}>
        🔐 通过邀请码验证身份后即可重置密码
      </div>
      <Form layout="vertical" onFinish={handleForgotVerify} size="large">
        <Form.Item name="inviteCode" rules={[{ required: true, message: '请输入邀请码' }]}>
          <Input
            prefix={<KeyOutlined />}
            placeholder="输入你的邀请码以验证身份"
            value={isStudent ? studentForm.inviteCode : teacherForm.inviteCode}
            onChange={(e) => {
              if (isStudent) {
                setStudentForm((p) => ({ ...p, inviteCode: e.target.value }));
              } else {
                setTeacherForm((p) => ({ ...p, inviteCode: e.target.value }));
              }
            }}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            验证身份
          </Button>
        </Form.Item>
        <Button type="link" block onClick={() => { setStep('login'); setError(null); }}>
          返回登录
        </Button>
      </Form>
    </div>
  );

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
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

        <div className={styles.tabContainer}>
          <Tabs
            activeKey={tab}
            onChange={(key) => { setTab(key as 'student' | 'teacher'); setStep('input'); setError(null); }}
            centered
            size="large"
            items={[
              { key: 'student', label: '学生登录' },
              { key: 'teacher', label: '教师入口' },
            ]}
          />
        </div>

        {step === 'input' && (tab === 'student' ? renderStudentForm() : renderTeacherForm())}
        {step === 'forgot' && renderForgotStep()}
        {(step === 'setPassword' || step === 'login' || !!forgotAuthId) && renderPasswordStep()}

        <div className={styles.tipText}>
          仅限学生会内部成员使用
        </div>
      </div>

    </div>
  );
}
