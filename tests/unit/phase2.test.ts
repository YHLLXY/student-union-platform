import { describe, it, expect } from 'vitest';
import supabase from '@/supabaseClient';
import { fetchMyPoints } from '@/modules/profile/profileService';
import { fetchPointsStandings, generateInviteCodeBatch } from '@/modules/admin/adminService';
import {
  issueCheckInToken, checkInTicket, fetchTicketRoster, fetchTicketCheckInStats, fetchMyTickets,
} from '@/modules/tickets/ticketService';
import { currentSemester, formatSemester } from '@/utils/semester';

/**
 * Phase 2（v4.4.0）新增 service 的单元测试。
 *
 * 全部数据现造现用（合成部门/学号，且不依赖种子票据状态），
 * 避免与其它测试文件并发跑时互相污染。
 */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const SEMESTER = currentSemester();
const synthTag = () => `syn${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 1e4)}`;

async function seedUser(role = 'volunteer', department = 'testdept') {
  const tag = synthTag();
  const { data, error } = await db.from('users').insert({
    auth_id: `bb000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`,
    name: `测试成员${tag}`,
    student_id: tag,
    department,
    role,
  }).select('*').single();
  expect(error).toBeNull();
  return data as { id: string; name: string; department: string };
}

async function seedLedger(userId: string, delta: number, reason: string, semester = SEMESTER) {
  const { error } = await db.from('points_ledger').insert({
    user_id: userId, delta, reason, semester,
    ref_type: 'submission', ref_id: uid(Math.floor(Math.random() * 1e6)),
  });
  expect(error).toBeNull();
}

/** 造一张「活动时间在签到窗内」的票 + 一条票券记录，返回二者 */
async function seedInWindowTicket() {
  const user = await seedUser();
  const tag = synthTag();
  const { data: ticket, error: tErr } = await db.from('tickets').insert({
    title: `测试签到活动 ${tag}`,
    description: '单测用',
    total_count: 10,
    per_user_limit: 1,
    open_time: new Date(Date.now() - 3600e3).toISOString(),
    event_time: new Date(Date.now() + 3600e3).toISOString(),
    created_by: uid(6),
  }).select('*').single();
  expect(tErr).toBeNull();

  const { data: record, error: rErr } = await db.from('ticket_records').insert({
    ticket_id: (ticket as { id: string }).id,
    user_id: user.id,
    student_id: 'SYN0001',
    name: user.name,
  }).select('*').single();
  expect(rErr).toBeNull();

  return { user, ticket: ticket as { id: string }, record: record as { id: string } };
}

describe('学期工具（与数据库 public.semester_of 同口径）', () => {
  it('9-1 月算第一学期，2-8 月算第二学期', () => {
    expect(currentSemester(new Date('2026-09-11T00:00:00'))).toBe('2026-2027-1');
    expect(currentSemester(new Date('2026-12-31T00:00:00'))).toBe('2026-2027-1');
    expect(currentSemester(new Date('2027-01-15T00:00:00'))).toBe('2026-2027-1');
    expect(currentSemester(new Date('2027-03-01T00:00:00'))).toBe('2026-2027-2');
    expect(currentSemester(new Date('2027-08-31T00:00:00'))).toBe('2026-2027-2');
  });

  it('学期键格式化为可读文案', () => {
    expect(formatSemester('2026-2027-1')).toBe('2026-2027 学年第一学期');
    expect(formatSemester('2026-2027-2')).toBe('2026-2027 学年第二学期');
    expect(formatSemester('异常值')).toBe('异常值');
  });
});

describe('fetchMyPoints 我的积分', () => {
  it('只汇总本学期、只汇总本人，并带明细', async () => {
    const me = await seedUser();
    const other = await seedUser();
    await seedLedger(me.id, 2, 'task_approved');
    await seedLedger(me.id, 1, 'ticket_checkin');
    await seedLedger(me.id, -1, 'submission_late');
    await seedLedger(me.id, 5, 'task_approved', '1999-2000-1'); // 往期：不应计入
    await seedLedger(other.id, 9, 'task_approved');

    const points = await fetchMyPoints(me.id);
    expect(points.semester).toBe(SEMESTER);
    expect(points.total).toBe(2); // 2 + 1 - 1
    expect(points.entries.length).toBe(3);
    expect(points.entries.every((e) => e.semester === SEMESTER)).toBe(true);
  });

  it('没有任何流水时返回 0 与空明细（不抛错）', async () => {
    const me = await seedUser();
    const points = await fetchMyPoints(me.id);
    expect(points.total).toBe(0);
    expect(points.entries).toEqual([]);
  });
});

describe('fetchPointsStandings 积分排行', () => {
  it('按人汇总并按总分降序排名，构成项分开计数', async () => {
    const a = await seedUser('volunteer', 'rankdept');
    const b = await seedUser('volunteer', 'rankdept');
    await seedLedger(a.id, 2, 'task_approved');
    await seedLedger(a.id, 1, 'submission_on_time');
    await seedLedger(a.id, 1, 'ticket_checkin');
    await seedLedger(b.id, 2, 'task_approved');
    await seedLedger(b.id, -1, 'submission_late');

    const standings = await fetchPointsStandings('all', 'president', 'presidium');
    const rowA = standings.find((s) => s.user_id === a.id)!;
    const rowB = standings.find((s) => s.user_id === b.id)!;

    expect(rowA.total).toBe(4);
    expect(rowA.approved).toBe(1);
    expect(rowA.onTime).toBe(1);
    expect(rowA.checkins).toBe(1);
    expect(rowB.total).toBe(1);
    expect(rowB.late).toBe(1);
    expect(rowA.rank).toBeLessThan(rowB.rank);
  });

  it('部门负责人即使请求全校范围，也只拿到本部门', async () => {
    // 部门名必须用纯合成值：adminService.test.ts 断言 publicity 恰好 2 人（种子），
    // vitest 并发跑文件时往种子部门塞人会让它变成 3 —— 这正是本文件首次进 CI 时挂掉的原因。
    const mine = await seedUser('volunteer', 'scopeddept');
    const outsider = await seedUser('volunteer', 'outsidedept');

    const standings = await fetchPointsStandings('all', 'dept_head', 'scopeddept');
    const ids = standings.map((s) => s.user_id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(outsider.id);
    expect(standings.every((s) => s.department === 'scopeddept')).toBe(true);
  });
});

describe('generateInviteCodeBatch 批量邀请码', () => {
  it('一次生成 N 个互不重复的邀请码，同批共享 batch_id 与参数', async () => {
    const result = await generateInviteCodeBatch({
      count: 5, department: 'publicity', role: 'volunteer', maxUses: 2, expiresInDays: 7,
    });
    expect(result).not.toBeNull();
    expect(result!.codes.length).toBe(5);
    expect(new Set(result!.codes).size).toBe(5);

    const { data } = await db.from('invite_codes').select('*').eq('batch_id', result!.batchId);
    expect(data.length).toBe(5);
    for (const row of data) {
      expect(row.department).toBe('publicity');
      expect(row.role).toBe('volunteer');
      expect(row.max_uses).toBe(2);
      expect(row.used_count).toBe(0);
      expect(row.expires_at).toBeTruthy();
      expect(result!.codes).toContain(row.code);
    }
  });

  it('数量越界被夹到 1~50', async () => {
    const result = await generateInviteCodeBatch({ count: 999, department: 'sports', role: 'volunteer' });
    expect(result!.codes.length).toBe(50);
  });
});

describe('票务签到闭环', () => {
  it('签发令牌 → 签到成功 → 重复签到幂等 → 乱码被拒', async () => {
    const { user, ticket, record } = await seedInWindowTicket();

    const token = await issueCheckInToken(record.id);
    expect(token.startsWith('SUP1.')).toBe(true);
    expect(token.split('.')).toHaveLength(4);

    const first = await checkInTicket(token);
    expect(first.ok).toBe(true);
    expect(first.code).toBe('checked_in');

    const second = await checkInTicket(token);
    expect(second.ok).toBe(true);
    expect(second.code).toBe('already_checked_in');

    const garbage = await checkInTicket('SUP1.不是uuid.9999999999.zzzz');
    expect(garbage.ok).toBe(false);
    expect(garbage.code).toBe('invalid_token');

    // 签到应联动积分 +1（真实库由 trg_ticket_records_award 触发器完成，stub 同步模拟）
    const points = await fetchMyPoints(user.id);
    expect(points.entries.some((e) => e.reason === 'ticket_checkin' && e.delta === 1)).toBe(true);

    // 名单与统计同步更新
    const roster = await fetchTicketRoster(ticket.id);
    expect(roster.length).toBe(1);
    expect(roster[0].checked_in_at).toBeTruthy();

    const stats = await fetchTicketCheckInStats(ticket.id);
    expect(stats.issued).toBe(1);
    expect(stats.checkedIn).toBe(1);
  });

  it('活动时间窗外的票券拒绝签到', async () => {
    const user = await seedUser();
    const tag = synthTag();
    const { data: ticket } = await db.from('tickets').insert({
      title: `测试远期活动 ${tag}`,
      total_count: 5,
      per_user_limit: 1,
      open_time: new Date(Date.now() - 3600e3).toISOString(),
      event_time: new Date(Date.now() + 30 * 864e5).toISOString(), // 30 天后 → 窗外
      created_by: uid(6),
    }).select('*').single();
    const { data: record } = await db.from('ticket_records').insert({
      ticket_id: (ticket as { id: string }).id,
      user_id: user.id, student_id: 'SYN0002', name: user.name,
    }).select('*').single();

    const token = await issueCheckInToken((record as { id: string }).id);
    const result = await checkInTicket(token);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('out_of_window');
  });

  it('我的票券带出签到时间字段（未签到为 null）', async () => {
    const { user, record } = await seedInWindowTicket();
    const mine = await fetchMyTickets(user.id);
    const target = mine.find((t) => t.id === record.id);
    expect(target).toBeTruthy();
    expect(target!.checked_in_at).toBeNull();

    await checkInTicket(await issueCheckInToken(record.id));
    const after = (await fetchMyTickets(user.id)).find((t) => t.id === record.id);
    expect(after!.checked_in_at).toBeTruthy();
  });
});
