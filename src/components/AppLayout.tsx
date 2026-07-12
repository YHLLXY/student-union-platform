import { useState, useEffect } from 'react';
import { Layout, Menu, Dropdown, Avatar, Button, Badge } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
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
import { NotificationBell } from '../modules/notification';
import {
  fetchUnreadByModule,
  markAsReadByTypes,
  subscribeToNotifications,
} from '../modules/notification/notificationService';
import GlobalSearch from './GlobalSearch';
import styles from './AppLayout.module.css';

const { Header, Sider, Content } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
}

const iconMap: Record<string, React.ReactNode> = {
  HomeOutlined: <HomeOutlined />,
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
  const [badges, setBadges] = useState({ tasks: false, notices: false, forum: false });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // 加载侧边栏徽标状态 + Realtime 订阅
  useEffect(() => {
    const loadBadges = async () => {
      const result = await fetchUnreadByModule(user.id);
      setBadges({
        tasks: result.tasks > 0,
        notices: result.notices > 0,
        forum: result.forum > 0,
      });
    };
    loadBadges();

    // 复用 Realtime 订阅：新通知到达时刷新三个模块的徽标
    const unsubscribe = subscribeToNotifications(user.id, () => loadBadges());
    return unsubscribe;
  }, [user.id]);

  // 进入模块页面时自动清除该模块的徽标
  useEffect(() => {
    const typeMap: Record<string, string[]> = {
      '/tasks':   ['task_assigned', 'submission_approved', 'submission_rejected', 'milestone_overdue'],
      '/notices': ['new_notice'],
      '/forum':   ['forum_reply'],
    };
    const types = typeMap[location.pathname];
    if (!types) return;

    // 后端标记已读（fire-and-forget，不阻塞导航）
    markAsReadByTypes(user.id, types).catch(() => {});

    // 乐观更新：前端立即清除圆点
    const key = location.pathname.slice(1) as 'tasks' | 'notices' | 'forum';
    setBadges(prev => ({ ...prev, [key]: false }));
  }, [location.pathname, user.id]);

  const visibleMenus = MENU_ITEMS.filter((item) => {
    // admin 需要 dept_head+，其他菜单所有人可见
    const requiredRole = item.key === 'admin' ? 'dept_head' : 'volunteer';
    return hasMinRole(user.role, requiredRole);
  });

  const badgePaths = ['/tasks', '/notices', '/forum'];

  const menuItems = visibleMenus.map((item) => {
    const icon = iconMap[item.icon] ?? <BellOutlined />;
    const badgeKey = item.path.slice(1) as 'tasks' | 'notices' | 'forum';
    const showBadge = badgePaths.includes(item.path) && badges[badgeKey];

    return {
      key: item.path,
      icon: showBadge ? <Badge dot offset={[-2, 2]}>{icon}</Badge> : icon,
      label: item.label,
    };
  });

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
        <GlobalSearch />
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
          <NotificationBell />
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
          style={{ background: '#ffffff', height: '100%', overflowY: 'auto' }}
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
