import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { LoginPage, getCurrentUser } from './modules/auth';
import type { UserProfile } from './modules/auth';
import { AuthContext } from './components/AuthContext';
import AppLayout from './components/AppLayout';

// 各模块页面（懒加载）
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

  if (!user) {
    return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
  }

  return (
    <AuthContext.Provider value={user}>
      <AppLayout>
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
    </AuthContext.Provider>
  );
}
