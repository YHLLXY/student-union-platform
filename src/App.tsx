import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { LoginPage, getCurrentUser } from './modules/auth';
import type { UserProfile } from './modules/auth';
import { AuthContext } from './components/AuthContext';
import AppLayout from './components/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import ModuleErrorBoundary from './components/ModuleErrorBoundary';

// 各模块页面（懒加载）
const DashBoardPage = lazy(() => import('./modules/dashboard/DashBoardPage'));
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
    <ErrorBoundary>
      <AuthContext.Provider value={user}>
        <AppLayout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/dashboard" element={<ModuleErrorBoundary moduleName="首页工作台"><DashBoardPage /></ModuleErrorBoundary>} />
              <Route path="/tasks" element={<ModuleErrorBoundary moduleName="任务管理"><TaskListPage /></ModuleErrorBoundary>} />
              <Route path="/notices" element={<ModuleErrorBoundary moduleName="部门公告"><NoticeList /></ModuleErrorBoundary>} />
              <Route path="/school" element={<ModuleErrorBoundary moduleName="学校信息"><SchoolNoticeList /></ModuleErrorBoundary>} />
              <Route path="/forum" element={<ModuleErrorBoundary moduleName="部门论坛"><PostList /></ModuleErrorBoundary>} />
              <Route path="/tickets" element={<ModuleErrorBoundary moduleName="活动抢票"><TicketList /></ModuleErrorBoundary>} />
              <Route path="/admin" element={<ModuleErrorBoundary moduleName="权限管理"><MemberManage /></ModuleErrorBoundary>} />
              <Route path="/profile" element={<ModuleErrorBoundary moduleName="个人中心"><ProfilePage /></ModuleErrorBoundary>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </AppLayout>
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}
