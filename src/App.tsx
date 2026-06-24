import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { LoginPage, getCurrentUser } from './modules/auth';
import type { UserProfile } from './modules/auth';
import AppLayout from './components/AppLayout';

// Phase 1: 仅登录模块完整实现，其余模块均为占位
const TaskListPage = lazy(() => import('./modules/tasks/TaskListPage'));
const NoticeList = lazy(() => import('./modules/notices/NoticeList'));
const SchoolNoticeList = lazy(() => import('./modules/school/SchoolNoticeList'));
const PostList = lazy(() => import('./modules/forum/PostList'));
const ProfilePage = lazy(() => import('./modules/profile/ProfilePage'));
const MemberManage = lazy(() => import('./modules/admin/MemberManage'));
const TicketList = lazy(() => import('./modules/tickets/TicketList'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
      <Spin size="large" />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  // 未登录 → 登录页
  if (!user) {
    return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
  }

  // 已登录 → 主界面
  return (
    <AppLayout user={user}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/tasks" element={<TaskListPage />} />
          <Route path="/notices" element={<NoticeList />} />
          <Route path="/school" element={<SchoolNoticeList />} />
          <Route path="/forum" element={<PostList />} />
          <Route path="/tickets" element={<TicketList />} />
          <Route path="/admin" element={<MemberManage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}
