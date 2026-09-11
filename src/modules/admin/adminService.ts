import supabase from '@/supabaseClient';
import type { UserProfile } from '@/modules/auth';
import { logger } from '@/diagnostics';
import { unwrap } from '@/lib/sb';
import { hasMinRole } from '@/utils/helpers';
import { currentSemester } from '@/utils/semester';

const log = logger.for('admin/adminService');

/** 获取成员列表 */
export async function fetchAllMembers(userRole: string, userDept: string): Promise<UserProfile[]> {
  let query = supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  // 部门负责人只看本部门；presidium+ / president / teacher / developer 可看全部
  if (hasMinRole(userRole, 'dept_head') && !hasMinRole(userRole, 'presidium')) {
    query = query.eq('department', userDept);
  }

  return (await unwrap('fetchAllMembers', query)) as UserProfile[];
}

/** 修改成员角色 */
export async function updateMemberRole(memberId: string, newRole: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', memberId);

  if (error) { log.error('updateMemberRole 更新失败', error); return false; }
  return true;
}

/** 移除成员 */
export async function removeMember(memberId: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ role: 'removed' })
    .eq('id', memberId);

  if (error) { log.error('removeMember 移除失败', error); return false; }
  return true;
}

/** 生成邀请码 */
export async function generateInviteCode(
  department: string,
  role: string,
  maxUses: number = 1,
  expiresInDays: number | null = null,
  createdBy: string | null = null,
): Promise<string | null> {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from('invite_codes')
    .insert({
      code,
      department,
      role,
      max_uses: maxUses,
      used_count: 0,
      expires_at: expiresAt,
      created_by: createdBy,
    });

  if (error) { log.error('generateInviteCode 生成失败', error); return null; }
  return code;
}

export interface InviteCode {
  id: string;
  code: string;
  department: string;
  role: string;
  is_used: boolean;
  used_by: string | null;
  used_by_name?: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  created_by: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** 调动成员到其他部门 */
export async function transferMember(memberId: string, newDepartment: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ department: newDepartment })
    .eq('id', memberId);

  if (error) { log.error('transferMember 调动失败', error); return false; }
  return true;
}

/** 获取邀请码列表 */
export async function fetchInviteCodes(department?: string): Promise<InviteCode[]> {
  let query = supabase
    .from('invite_codes')
    .select('*, used_user:used_by(name)')
    .order('created_at', { ascending: false });

  if (department) {
    query = query.eq('department', department);
  }

  const data = await unwrap('fetchInviteCodes', query);

  return data.map((c) => ({
    id: c.id,
    code: c.code,
    department: c.department,
    role: c.role,
    is_used: c.is_used ?? false,
    used_by: c.used_by,
    used_by_name: c.used_user?.name ?? '-',
    max_uses: c.max_uses ?? 1,
    used_count: c.used_count ?? 0,
    expires_at: c.expires_at,
    created_by: c.created_by,
    revoked_at: c.revoked_at,
    created_at: c.created_at,
  }));
}

/** 删除邀请码（仅限未被使用的） */
export async function deleteInviteCode(codeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('invite_codes')
    .delete()
    .eq('id', codeId);

  if (error) { log.error('deleteInviteCode 删除失败', error); return false; }
  return true;
}

/** 撤销邀请码（设置 revoked_at，而非标记 is_used） */
export async function deactivateInviteCode(codeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('invite_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', codeId);

  if (error) { log.error('deactivateInviteCode 撤销失败', error); return false; }
  return true;
}

/** 管理员重置成员密码（随机 8 位字符串） */
export async function resetMemberPassword(authId: string): Promise<string | false> {
  const newPassword = Math.random().toString(36).slice(-8);
  const { error } = await supabase.rpc('reset_user_password', {
    user_id: authId,
    new_password: newPassword,
  });

  if (error) { log.error('resetMemberPassword 重置失败', error); return false; }
  return newPassword;
}

// ========== 成员任务聚合 ==========
export interface MemberWorkSummary {
  user: UserProfile;
  pending: number;
  in_progress: number;
  review: number;
  completed: number;
  overdue: number;
  total: number;
}

/** 获取所有成员的任务状态分布 */
export async function fetchMemberWorkSummaries(userRole: string, userDept: string): Promise<MemberWorkSummary[]> {
  let memberQuery = supabase.from('users').select('*').neq('role', 'removed').order('created_at', { ascending: false });
  if (hasMinRole(userRole, 'dept_head') && !hasMinRole(userRole, 'presidium')) {
    memberQuery = memberQuery.eq('department', userDept);
  }
  const members = await unwrap('workSummariesMembers', memberQuery);
  if (members.length === 0) return [];

  const memberIds = members.map(m => m.id);
  const now = new Date().toISOString();

  // 一次性拉取所有成员的任务，客户端聚合（替代 N×5 查询）
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('assigned_to, status, deadline')
    .in('assigned_to', memberIds);

  // 初始化计数器
  const map = new Map<string, { pending: number; in_progress: number; review: number; completed: number; overdue: number }>();
  for (const m of members) {
    map.set(m.id, { pending: 0, in_progress: 0, review: 0, completed: 0, overdue: 0 });
  }

  // 单次遍历聚合
  for (const t of allTasks || []) {
    if (!t.assigned_to) continue;
    const c = map.get(t.assigned_to);
    if (!c) continue;
    switch (t.status) {
      case 'pending': c.pending++; break;
      case 'in_progress': c.in_progress++; break;
      case 'review': c.review++; break;
      case 'completed': c.completed++; break;
    }
    if (t.status !== 'completed' && t.deadline && t.deadline < now) {
      c.overdue++;
    }
  }

  return members.map(m => {
    const c = map.get(m.id)!;
    return {
      user: m as UserProfile,
      pending: c.pending,
      in_progress: c.in_progress,
      review: c.review,
      completed: c.completed,
      overdue: c.overdue,
      total: c.pending + c.in_progress + c.review + c.completed,
    };
  });
}

// ========== 数据看板：使用分析 ==========

export interface AnalyticsSummary {
  totalEvents: number;
  activeUsers7d: number;
  recent7d: number;
  topModule: string;
  pageRanking: { module: string; count: number }[];
  eventStats: { event_type: string; count: number }[];
  recentErrors: { created_at: string; module: string; action: string; metadata: unknown }[];
}

/** 获取数据看板汇总（仅管理员调用） */
export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalRes,
    activeRes,
    recent7dRes,
    pageRankRes,
    eventStatsRes,
    errorRes,
  ] = await Promise.all([
    supabase.from('usage_events').select('id', { count: 'exact', head: true }),
    supabase.from('usage_events')
      .select('user_id')
      .gte('created_at', sevenDaysAgo)
      .not('user_id', 'is', null),
    supabase.from('usage_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    supabase.from('usage_events')
      .select('module, id')
      .eq('event_type', 'page_view')
      .gte('created_at', sevenDaysAgo),
    supabase.from('usage_events')
      .select('event_type, id')
      .gte('created_at', sevenDaysAgo),
    supabase.from('usage_events')
      .select('created_at, module, action, metadata')
      .eq('event_type', 'error')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  // 页面访问排名（客户端 GROUP BY）
  const moduleCount: Record<string, number> = {};
  for (const r of pageRankRes.data ?? []) {
    const m = r.module || 'unknown';
    moduleCount[m] = (moduleCount[m] || 0) + 1;
  }
  const pageRanking = Object.entries(moduleCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([module, count]) => ({ module, count }));

  const topModule = pageRanking.length > 0 ? pageRanking[0].module : '暂无数据';

  // 事件类型统计
  const typeCount: Record<string, number> = {};
  for (const r of eventStatsRes.data ?? []) {
    const t = r.event_type;
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  const eventStats = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .map(([event_type, count]) => ({ event_type, count }));

  // 近7天活跃用户：客户端 COUNT(DISTINCT user_id)
  const activeUsers7d = new Set(
    (activeRes.data ?? [])
      .map(r => r.user_id)
      .filter((id): id is string => !!id),
  ).size;

  return {
    totalEvents: totalRes.count ?? 0,
    activeUsers7d,
    recent7d: recent7dRes.count ?? 0,
    topModule,
    pageRanking,
    eventStats,
    recentErrors: (errorRes.data ?? []) as AnalyticsSummary['recentErrors'],
  };
}

// ========== 考核积分排行（第十八部分 / v4.4.0） ==========

export interface PointsStanding {
  user_id: string;
  name: string;
  department: string;
  role: string;
  /** 本学期净积分 */
  total: number;
  /** 审核通过次数（每次 +2） */
  approved: number;
  /** 按时提交次数（每次 +1） */
  onTime: number;
  /** 逾期提交次数（每次 -1） */
  late: number;
  /** 活动签到次数（每次 +1） */
  checkins: number;
  rank: number;
}

/**
 * 本学期积分排行。
 * 范围：部门负责人只能看本部门（即使传 all 也会被收窄，与其它管理页一致）；
 *       presidium 及以上可切「部门内 / 全校」。
 * 实现：2 次查询 + 客户端聚合（成员表 + 本学期流水），不做 N+1。
 */
export async function fetchPointsStandings(
  scope: 'department' | 'all',
  userRole: string,
  userDept: string,
  semester: string = currentSemester(),
): Promise<PointsStanding[]> {
  const forcedDept = hasMinRole(userRole, 'dept_head') && !hasMinRole(userRole, 'presidium');
  const useDept = forcedDept || scope === 'department';

  let memberQuery = supabase
    .from('users')
    .select('id, name, department, role')
    .neq('role', 'removed');
  if (useDept) memberQuery = memberQuery.eq('department', userDept);

  const members = await unwrap('pointsStandingsMembers', memberQuery);
  if (members.length === 0) return [];

  const rows = await unwrap('pointsStandingsLedger', supabase
    .from('points_ledger')
    .select('user_id, delta, reason')
    .in('user_id', members.map((m) => m.id))
    .eq('semester', semester)
    .limit(2000));

  const map = new Map<string, Omit<PointsStanding, 'name' | 'department' | 'role' | 'rank'>>();
  for (const m of members) {
    map.set(m.id, { user_id: m.id, total: 0, approved: 0, onTime: 0, late: 0, checkins: 0 });
  }

  for (const r of rows) {
    const c = map.get(r.user_id);
    if (!c) continue;
    c.total += r.delta;
    if (r.reason === 'task_approved') c.approved += 1;
    else if (r.reason === 'submission_on_time') c.onTime += 1;
    else if (r.reason === 'submission_late') c.late += 1;
    else if (r.reason === 'ticket_checkin') c.checkins += 1;
  }

  const standings: PointsStanding[] = members.map((m) => ({
    ...map.get(m.id)!,
    name: m.name,
    department: m.department,
    role: m.role,
    rank: 0,
  }));

  standings.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name, 'zh-CN'));
  standings.forEach((s, i) => { s.rank = i + 1; });
  return standings;
}

// ========== 批量邀请码（第十八部分 / v4.4.0） ==========

export interface InviteBatchResult {
  batchId: string;
  codes: string[];
}

/** 生成 v4 形状的批次号。用 Math.random 而非 crypto.randomUUID：
 *  jsdom 测试环境不保证有后者，而批次号只是分组用的内部标识，不参与安全判断。 */
function newBatchId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** 生成 count 个互不重复的邀请码（与服务端 code UNIQUE 约束配合，避免整批插入失败） */
function uniqueCodes(count: number): string[] {
  const set = new Set<string>();
  while (set.size < count) {
    set.add(Math.random().toString(36).substring(2, 8).toUpperCase());
  }
  return [...set];
}

/**
 * 批量生成邀请码：一次 insert 写入整批（共享 batch_id，便于按批导出/作废）。
 * 返回本批邀请码；失败返回 null（错误已记日志，UI 只需提示）。
 */
export async function generateInviteCodeBatch(opts: {
  count: number;
  department: string;
  role: string;
  maxUses?: number;
  expiresInDays?: number | null;
  createdBy?: string | null;
}): Promise<InviteBatchResult | null> {
  const count = Math.min(Math.max(Math.floor(opts.count), 1), 50);
  const maxUses = opts.maxUses ?? 1;
  const expiresAt = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 864e5).toISOString()
    : null;

  const batchId = newBatchId();
  const codes = uniqueCodes(count);

  const { error } = await supabase
    .from('invite_codes')
    .insert(codes.map((code) => ({
      code,
      department: opts.department,
      role: opts.role,
      max_uses: maxUses,
      used_count: 0,
      expires_at: expiresAt,
      created_by: opts.createdBy ?? null,
      batch_id: batchId,
    })));

  if (error) { log.error('generateInviteCodeBatch 批量生成失败', error); return null; }
  return { batchId, codes };
}
