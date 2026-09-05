import { useState } from 'react';
import { Alert, Tabs, Button, message } from 'antd';
import { ToolOutlined } from '@ant-design/icons';
import {
  signUp, signIn, checkInviteCode, checkStudentId, signUpTeacher,
  checkTeacherCode, verifyUser, selfResetPassword,
} from './authService';
import type { UserProfile } from './authService';
import { trackEvent } from '@/utils/analytics';
import AuthShell from './AuthShell';
import IdentityForm from './IdentityForm';
import PasswordForm from './PasswordForm';
import ForgotForm from './ForgotForm';
import DevEntryModal from './DevEntryModal';
import styles from './auth.module.css';

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile) => void;
}

type Step = 'input' | 'setPassword' | 'login' | 'forgot';

type IdentityState = {
  name: string;
  id: string;
  inviteCode: string;
  /** 由有效邀请码回填（仅新注册流程使用） */
  department?: string;
  role?: string;
};

const EMPTY_IDENTITY: IdentityState = { name: '', id: '', inviteCode: '' };

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [tab, setTab] = useState<'student' | 'teacher'>('student');
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [student, setStudent] = useState<IdentityState>(EMPTY_IDENTITY);
  const [teacher, setTeacher] = useState<IdentityState>(EMPTY_IDENTITY);

  // 忘记密码：验证通过后暂存的 auth_id
  const [forgotAuthId, setForgotAuthId] = useState('');
  const [devModalOpen, setDevModalOpen] = useState(false);

  const identity = tab === 'student' ? student : teacher;
  const idNumber = tab === 'student' ? student.id : teacher.id;

  const patchIdentity = (patch: Partial<IdentityState>) =>
    tab === 'student'
      ? setStudent((p) => ({ ...p, ...patch }))
      : setTeacher((p) => ({ ...p, ...patch }));

  const fail = (msg: string) => setError(msg);

  // ========== 第一步：身份 + 邀请码校验 ==========

  const handleIdentityCheck = async () => {
    setError(null);
    if (!identity.name.trim() || !identity.id.trim() || !identity.inviteCode.trim()) {
      setError('请填写所有字段');
      return;
    }
    setLoading(true);
    try {
      // 已注册用户跳过邀请码校验直接进入登录步
      const exists = await checkStudentId(identity.id.trim());
      if (exists) {
        setStep('login');
        return;
      }
      const codeData = tab === 'student'
        ? await checkInviteCode(identity.inviteCode.trim())
        : await checkTeacherCode(identity.inviteCode.trim());
      if (!codeData) {
        setError(tab === 'student' ? '邀请码无效或已被使用' : '教师邀请码无效或已被使用');
        return;
      }
      if (tab === 'student') {
        setStudent((p) => ({
          ...p,
          department: codeData.department as string,
          role: (codeData.role as string) ?? 'volunteer',
        }));
      }
      setStep('setPassword');
    } catch {
      fail('操作失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  // ========== 注册 / 登录 / 重置 ==========

  const handleRegister = async (password: string) => {
    setLoading(true);
    try {
      const result = tab === 'student'
        ? await signUp(student.name.trim(), student.id.trim(), student.inviteCode.trim(), password, student.department ?? '', student.role ?? '')
        : await signUpTeacher(teacher.name.trim(), teacher.id.trim(), teacher.inviteCode.trim(), password);
      if (result.error || !result.user) {
        setError(result.error ?? '注册失败');
        return;
      }
      message.success(tab === 'student' ? '注册成功！欢迎加入学生会' : '教师注册成功！');
      onLoginSuccess(result.user);
    } catch {
      fail('注册失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (password: string) => {
    setLoading(true);
    try {
      const { user, error: loginError } = await signIn(identity.id.trim(), password);
      if (loginError || !user) {
        setError(loginError ?? '密码错误或账号不存在');
        return;
      }
      message.success('登录成功');
      trackEvent({ event_type: 'login', userId: user.id, action: tab });
      onLoginSuccess(user);
    } catch {
      fail('登录失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerify = async () => {
    setError(null);
    if (!identity.name.trim() || !idNumber.trim()) {
      setError('请先在上一步填写姓名和学号/工号');
      return;
    }
    setLoading(true);
    try {
      const user = await verifyUser(identity.name.trim(), idNumber.trim());
      if (!user) {
        setError('姓名与学号/工号不匹配，请检查');
        return;
      }
      setForgotAuthId(user.authId);
      setStep('setPassword');
    } catch {
      fail('操作失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (password: string) => {
    setLoading(true);
    try {
      const ok = await selfResetPassword(forgotAuthId, password);
      if (ok) {
        message.success('密码重置成功，请登录');
        setStep('login');
      } else {
        setError('重置失败，请联系管理员');
      }
    } catch {
      fail('操作失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  // ========== 密码步统一入口 ==========

  const handlePasswordSubmit = async (values: { password: string; confirmPassword?: string }) => {
    setError(null);
    if (values.confirmPassword !== undefined && values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    if (forgotAuthId) return handleResetPassword(values.password);
    if (step === 'setPassword') return handleRegister(values.password);
    return handleLogin(values.password);
  };

  const backFromPassword = () => {
    setStep(forgotAuthId ? 'forgot' : 'input');
    setForgotAuthId('');
    setError(null);
  };

  // ========== 渲染 ==========

  return (
    <AuthShell>
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
          onChange={(key) => {
            setTab(key as 'student' | 'teacher');
            setStep('input');
            setForgotAuthId('');
            setError(null);
          }}
          centered
          size="large"
          items={[
            { key: 'student', label: '学生登录' },
            { key: 'teacher', label: '教师入口' },
          ]}
        />
      </div>

      {step === 'input' && (
        <IdentityForm
          kind={tab}
          values={identity}
          onChange={patchIdentity}
          loading={loading}
          onFinish={handleIdentityCheck}
        />
      )}

      {step === 'forgot' && (
        <ForgotForm
          value={identity.inviteCode}
          loading={loading}
          onChange={(inviteCode) => patchIdentity({ inviteCode })}
          onVerify={handleForgotVerify}
          onBack={() => { setStep('login'); setError(null); }}
        />
      )}

      {(step === 'setPassword' || step === 'login' || !!forgotAuthId) && (
        <PasswordForm
          mode={forgotAuthId ? 'reset' : step === 'setPassword' ? 'setPassword' : 'login'}
          hint={
            forgotAuthId
              ? '身份验证通过，请设置新密码'
              : step === 'setPassword'
                ? '首次登录，请设置密码'
                : `欢迎回来，${identity.name}`
          }
          loading={loading}
          onSubmit={handlePasswordSubmit}
          onForgot={() => { setStep('forgot'); setError(null); }}
          onBack={backFromPassword}
        />
      )}

      <div className={styles.devEntry}>
        <Button
          type="link"
          size="small"
          icon={<ToolOutlined />}
          style={{ color: 'var(--text-tertiary)', fontSize: 12 }}
          onClick={() => setDevModalOpen(true)}
        >
          开发者
        </Button>
      </div>

      <DevEntryModal
        open={devModalOpen}
        onClose={() => setDevModalOpen(false)}
        onVerified={(dev) => {
          setTab('student');
          setStudent({
            name: dev.name,
            id: dev.student_id,
            inviteCode: dev.key,
            department: 'developer',
            role: 'developer',
          });
          setStep('login');
          setDevModalOpen(false);
          message.success(`已切换到开发者 ${dev.name}，请输入密码`);
        }}
      />
    </AuthShell>
  );
}
