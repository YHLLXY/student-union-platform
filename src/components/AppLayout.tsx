import { useState } from 'react';
import { Layout, Menu, Dropdown, Avatar, Button } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CheckSquareOutlined,
  BellOutlined,
  BankOutlined,
  MessageOutlined,
  GiftOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  BugOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { signOut } from '../modules/auth';
import { useAuth } from './AuthContext';
import { MENU_ITEMS } from '../utils/constants';
import { hasMinRole, getDepartmentLabel, getRoleLabel } from '../utils/helpers';
import FeedbackModal from './FeedbackModal';
import { GuideDrawer } from '../modules/guide';
import styles from './AppLayout.module.css';

const { Header, Sider, Content } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
}

const iconMap: Record<string, React.ReactNode> = {
  CheckSquareOutlined: <CheckSquareOutlined />,
  BellOutlined: <BellOutlined />,
  BankOutlined: <BankOutlined />,
  MessageOutlined: <MessageOutlined />,
  GiftOutlined: <GiftOutlined />,
  SettingOutlined: <SettingOutlined />,
  UserOutlined: <UserOutlined />,
};

export default function AppLayout({ children }: AppLayoutProps) {
  const user = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const visibleMenus = MENU_ITEMS.filter((item) => {
    // admin 需要 dept_head+，其他菜单所有人可见
    const requiredRole = item.key === 'admin' ? 'dept_head' : 'volunteer';
    return hasMinRole(user.role, requiredRole);
  });

  const menuItems = visibleMenus.map((item) => ({
    key: item.path,
    icon: iconMap[item.icon] ?? <BellOutlined />,
    label: item.label,
  }));

  const handleLogout = async () => {
    await signOut();
    window.location.reload();
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'info',
      label: `${getDepartmentLabel(user.department)} · ${getRoleLabel(user.role)}`,
      disabled: true,
      style: { fontSize: 12, color: '#95a5a6' },
    },
    { type: 'divider' },
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人中心',
      onClick: () => navigate('/profile'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className={styles.header}>
        <div className={styles.logo}>🏛 学生会</div>
        <div className={styles.headerRight}>
          <Button
            type="text"
            icon={<QuestionCircleOutlined />}
            onClick={() => setGuideOpen(true)}
            style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16 }}
            title="功能指南"
          />
          <Button
            type="text"
            icon={<BugOutlined />}
            onClick={() => setFeedbackOpen(true)}
            style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16 }}
            title="反馈与建议"
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div className={styles.userInfo}>
              <Avatar size="small" icon={<UserOutlined />} style={{ marginRight: 8 }} />
              {user.name}
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout hasSider className={styles.innerLayout}>
        <Sider
          width={200}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{ background: '#ffffff' }}
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ borderRight: 0, marginTop: 4 }}
          />
        </Sider>

        <Content className={styles.contentArea}>{children}</Content>
      </Layout>

      <GuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </Layout>
  );
}
