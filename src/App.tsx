import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LoginPage,
  getLocalSession,
  fetchProfileByAuthId,
  readCachedProfile,
  writeCachedProfile,
  removeCachedProfile,
} from '@/modules/auth';
import type { UserProfile } from '@/modules/auth';
import supabase from '@/supabaseClient';
import { AuthContext } from '@/components/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import { RouteSkeleton } from '@/components/SkeletonBlocks';
import { useVersionNotification } from '@/hooks/useVersionNotification';

// 应用壳层懒加载：登录页只需表单组件，壳层及其子树（通知铃铛/全局搜索/指南抽屉/反馈弹窗等
// 及其 antd 依赖）全部移出登录页关键路径（见 docs/plans/2026-09-05-首屏性能优化实施计划）
const AppLayout = lazy(() => import('@/components/AppLayout'));

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
    let alive = true;
    // 启动快速路径：无 session 立即进登录页；有 session 且缓存档案匹配则立即渲染，
    // 档案网络拉取转为后台静默校正（消除已登录用户每次打开的一次阻塞往返）
    (async () => {
      const session = await getLocalSession();
      if (!session?.user) {
        if (alive) setLoading(false);
        return;
      }
      const cached = readCachedProfile(session.user.id);
      if (cached && alive) {
        setUser(cached);
        setLoading(false);
      }
      const fresh = await fetchProfileByAuthId(session.user.id);
      if (!alive) return;
      if (fresh) {
        setUser(fresh);
        writeCachedProfile(fresh);
      } else if (!cached) {
        // 无缓存且拉取失败（含 RLS 拒绝/账号被删）→ 回登录页，与旧行为一致
        setUser(null);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 会话监听：token 被撤销/过期且无法刷新时，收敛回登录页而非留僵尸页面
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        removeCachedProfile();
        queryClient.clear();
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const handleLoginSuccess = (u: UserProfile) => {
    setUser(u);
    writeCachedProfile(u);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <RouteSkeleton />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <ErrorBoundary>
      <AuthContext.Provider value={user}>
        <VersionNotifier />
        <Suspense fallback={<RouteSkeleton />}>
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
        </Suspense>
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}
