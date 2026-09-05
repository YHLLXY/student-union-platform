import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LoginPage, getCurrentUser } from '@/modules/auth';
import type { UserProfile } from '@/modules/auth';
import supabase from '@/supabaseClient';
import { AuthContext } from '@/components/AuthContext';
import AppLayout from '@/components/AppLayout';
import ErrorBoundary from '@/components/ErrorBoundary';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import { RouteSkeleton } from '@/components/SkeletonBlocks';
import { useVersionNotification } from '@/hooks/useVersionNotification';

// 各模块页面（懒加载）
const DashBoardPage = lazy(() => import('@/modules/dashboard/DashBoardPage'));
const TaskListPage = lazy(() => import('@/modules/tasks/TaskListPage'));
const NoticeList = lazy(() => import('@/modules/notices/NoticeList'));
const SchoolNoticeList = lazy(() => import('@/modules/school/SchoolNoticeList'));
const PostList = lazy(() => import('@/modules/forum/PostList'));
const ProfilePage = lazy(() => import('@/modules/profile/ProfilePage'));
const MemberManage = lazy(() => import('@/modules/admin/MemberManage'));
const TicketList = lazy(() => import('@/modules/tickets/TicketList'));

/** PWA 版本通知组件 — 检测新版本并弹出更新公告 */
function VersionNotifier() {
  useVersionNotification();
  return null;
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUser(u))
      .catch((e) => {
        console.error('获取登录态失败:', e);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // 会话监听：token 被撤销/过期且无法刷新时，收敛回登录页而非留僵尸页面
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        queryClient.clear();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <RouteSkeleton />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
  }

  return (
    <ErrorBoundary>
      <AuthContext.Provider value={user}>
        <VersionNotifier />
        <AppLayout>
          <Suspense fallback={<RouteSkeleton />}>
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
