import { useState } from 'react';
import { Drawer, Steps, Button, Typography, Space, message, theme } from 'antd';
import { BookOutlined, CheckSquareOutlined, IdcardOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth, useAuthUpdate } from '@/components/AuthContext';
import { updateMyProfile } from '@/modules/profile/profileService';
import styles from './guide.module.css';

interface OnboardingGuideProps {
  /** 打开壳层里的「使用指南」抽屉（引导第一步就让它真的能点开，而不是只写一句「请查看指南」） */
  onOpenGuide: () => void;
}

const STEPS = [
  {
    key: 'guide',
    title: '看使用指南',
    icon: <BookOutlined />,
    desc: '平台各模块的使用说明都收在「使用指南」里：任务怎么领、公告怎么读、票怎么抢，看一眼就清楚。以后随时可从右上角问号按钮再次打开。',
    action: '打开使用指南',
  },
  {
    key: 'task',
    title: '认领第一个任务',
    icon: <CheckSquareOutlined />,
    desc: '任务管理页会列出分配给你的任务，按截止时间排好序。逾期提交会被扣考核积分，按时提交有加分，所以尽早处理。',
    action: '去任务管理',
  },
  {
    key: 'profile',
    title: '完善个人资料',
    icon: <IdcardOutlined />,
    desc: '上传头像、补上联系方式，同事在通讯录里就能找到你。资料随时可在个人中心里修改。',
    action: '去个人中心',
  },
];

/**
 * 新人引导（v4.5.0 / B2）。
 *
 * 触发条件是 `users.onboarded === false`（严格等于 false）：
 * v4.4.0 之前写入的本地缓存里没有这个字段，若用 `!user.onboarded` 判断，
 * 升级瞬间全体老用户都会被打扰。数据库侧也做了对应的存量回填（见第十九部分第 0 节）。
 *
 * 完成或跳过都会落库 onboarded = true，此后不再出现。
 */
export default function OnboardingGuide({ onOpenGuide }: OnboardingGuideProps) {
  const { token } = theme.useToken();
  const user = useAuth();
  const patchProfile = useAuthUpdate();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  // 本地收起标记：落库成功后立刻收起，不必等下一次档案拉取
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  const open = !dismissed && user.onboarded === false;
  const isLast = current === STEPS.length - 1;

  const finish = async () => {
    setSaving(true);
    const ok = await updateMyProfile(user.id, { onboarded: true });
    setSaving(false);
    setDismissed(true);
    if (ok) {
      patchProfile({ onboarded: true });
      message.success('引导已完成，祝使用愉快！');
    } else {
      // 落库失败时也不打扰用户：下次登录会再看到引导，这是可接受的降级
      message.warning('引导状态未能保存，下次登录会再出现一次');
    }
  };

  const handleStepAction = () => {
    const step = STEPS[current];
    if (step.key === 'guide') { onOpenGuide(); return; }
    if (step.key === 'task') { navigate('/tasks'); return; }
    navigate('/profile');
  };

  const step = STEPS[current];

  return (
    <Drawer
      open={open}
      size={440}
      title="欢迎加入学生会交流平台"
      onClose={() => void finish()}
      maskClosable={false}
      footer={
        <div className={styles.onboardingFooter}>
          <Button type="text" onClick={() => void finish()} loading={saving}>
            跳过引导
          </Button>
          <Space>
            {current > 0 && <Button onClick={() => setCurrent((c) => c - 1)}>上一步</Button>}
            {isLast
              ? <Button type="primary" onClick={() => void finish()} loading={saving}>完成引导</Button>
              : <Button type="primary" onClick={() => setCurrent((c) => c + 1)}>下一步</Button>}
          </Space>
        </div>
      }
    >
      <Steps
        current={current}
        size="small"
        items={STEPS.map((s) => ({ title: s.title }))}
      />

      <div className={styles.onboardingBody}>
        <div className={styles.onboardingIcon} style={{ color: token.colorPrimary }}>
          {step.icon}
        </div>
        <Typography.Title level={5} style={{ marginTop: 12, marginBottom: 8 }}>
          {step.title}
        </Typography.Title>
        <Typography.Paragraph style={{ color: token.colorTextSecondary, marginBottom: 20 }}>
          {step.desc}
        </Typography.Paragraph>
        <Button type="default" icon={<ArrowRightOutlined />} onClick={handleStepAction}>
          {step.action}
        </Button>
      </div>
    </Drawer>
  );
}
