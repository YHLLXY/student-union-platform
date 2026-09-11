import supabase from '@/supabaseClient';
import { logger } from '@/diagnostics';
import { unwrap, unwrapCount } from '@/lib/sb';
import type { TableRow, CheckInResult } from '@/types/database';

type TicketRowWithCreator = TableRow<'tickets'> & { creator: { name: string } | null };

const log = logger.for('tickets/ticketService');

export interface Ticket {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  total_count: number;
  per_user_limit: number;
  open_time: string;
  event_time: string;
  created_by: string;
  creator_name?: string;
  remaining_count?: number;
  created_at: string;
}

export interface TicketRecord {
  id: string;
  ticket_id: string;
  user_id: string;
  student_id: string;
  name: string;
  grabbed_at: string;
}

/** 获取所有票务（含剩余数量，活动已开始的自动隐藏） */
export async function fetchTickets(): Promise<Ticket[]> {
  const data = await unwrap('fetchTickets', supabase
    .from('tickets')
    .select('*, creator:created_by(name)')
    .gt('event_time', new Date().toISOString())
    .order('open_time', { ascending: true }));

  // 并行查询每个票务的已抢数量
  const tickets = await Promise.all(
    data.map(async (t: TicketRowWithCreator) => {
      const { count } = await supabase
        .from('ticket_records')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_id', t.id);

      return {
        ...t,
        creator_name: t.creator?.name ?? '未知',
        remaining_count: t.total_count - (count ?? 0),
      };
    }),
  );

  return tickets as unknown as Ticket[];
}

/** 创建票务 */
export async function createTicket(ticket: {
  title: string;
  description: string;
  cover_url?: string;
  total_count: number;
  per_user_limit: number;
  open_time: string;
  event_time: string;
  created_by: string;
}): Promise<Ticket | null> {
  const { data, error } = await supabase
    .from('tickets')
    .insert(ticket)
    .select('*')
    .single();

  if (error) { log.error('createTicket 创建失败', error); return null; }
  return data as Ticket;
}

/** 抢票（RPC 原子操作，FOR UPDATE 行锁防并发超卖） */
export async function grabTicket(
  ticketId: string,
  userId: string,
  studentId: string,
  name: string,
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('grab_ticket', {
    p_ticket_id: ticketId,
    p_user_id: userId,
    p_student_id: studentId,
    p_name: name,
  });

  if (error) {
    log.error('grab_ticket RPC 调用失败', error);
    return { success: false, message: '抢票失败，请重试' };
  }

  const result = data as { success: boolean; message: string };
  return result;
}

export interface MyTicket {
  id: string;
  ticket_id: string;
  user_id: string;
  student_id: string;
  name: string;
  grabbed_at: string;
  ticket_title: string;
  event_time: string;
  /** 签到时间；非空即已签到（此时不再展示签到码） */
  checked_in_at: string | null;
}

/** 获取我的票券 */
export async function fetchMyTickets(userId: string): Promise<MyTicket[]> {
  const data = await unwrap('fetchMyTickets', supabase
    .from('ticket_records')
    .select('*, ticket:ticket_id(title, event_time)')
    .eq('user_id', userId)
    .order('grabbed_at', { ascending: false }));

  return data.map((r) => {
    const ticket = r.ticket as { title: string; event_time: string } | null;
    return {
      id: r.id,
      ticket_id: r.ticket_id,
      user_id: r.user_id ?? '',
      student_id: r.student_id,
      name: r.name,
      grabbed_at: r.grabbed_at,
      ticket_title: ticket?.title ?? '未知',
      event_time: ticket?.event_time ?? '',
      checked_in_at: r.checked_in_at,
    };
  });
}

/** 获取当前用户已抢的票务 ID 列表（用于按钮状态判断） */
export async function fetchMyGrabbedIds(userId: string): Promise<Set<string>> {
  const data = await unwrap('fetchMyGrabbedIds', supabase
    .from('ticket_records')
    .select('ticket_id')
    .eq('user_id', userId));

  return new Set(data.map((r) => r.ticket_id));
}

/** 获取某票务的抢票记录（发布者查看） */
export async function fetchTicketRecords(ticketId: string): Promise<TicketRecord[]> {
  return unwrap('fetchTicketRecords', supabase
    .from('ticket_records')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('grabbed_at', { ascending: true })) as Promise<TicketRecord[]>;
}

/** 退票（仅限活动开始前 5 小时外） */
export async function refundTicket(
  recordId: string,
  ticketId: string,
  eventTime: string,
): Promise<{ success: boolean; message: string }> {
  // 检查是否在活动开始前 5 小时外
  const event = new Date(eventTime);
  const now = new Date();
  const fiveHours = 5 * 60 * 60 * 1000;

  if (event.getTime() - now.getTime() < fiveHours) {
    return { success: false, message: '距活动开始不足 5 小时，无法退票' };
  }

  // 删除抢票记录
  const { error } = await supabase
    .from('ticket_records')
    .delete()
    .eq('id', recordId)
    .eq('ticket_id', ticketId);

  if (error) {
    return { success: false, message: '退票失败，请重试' };
  }

  return { success: true, message: '退票成功' };
}

/** 实时订阅票务变更 */
export function subscribeToTickets(callback: () => void): () => void {
  const channel = supabase
    .channel('tickets-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets' },
      callback,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ticket_records' },
      callback,
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ========== 票务闭环：签到名单 / 二维码 / 扫码签到（第十八部分 / v4.4.0） ==========

export interface TicketRosterEntry {
  id: string;
  ticket_id: string;
  user_id: string | null;
  student_id: string;
  name: string;
  grabbed_at: string;
  checked_in_at: string | null;
  checked_by: string | null;
}

export interface TicketCheckInStats {
  /** 已领票数 */
  issued: number;
  /** 已签到数 */
  checkedIn: number;
}

/** 某活动的领票名单（组织者视角，按抢票时间正序） */
export async function fetchTicketRoster(ticketId: string): Promise<TicketRosterEntry[]> {
  return unwrap('fetchTicketRoster', supabase
    .from('ticket_records')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('grabbed_at', { ascending: true })
    .limit(500)) as Promise<TicketRosterEntry[]>;
}

/** 领票数 / 已签到数（两条 head 计数并行，走 ticket_id 与 checked_in_at 索引） */
export async function fetchTicketCheckInStats(ticketId: string): Promise<TicketCheckInStats> {
  const [issued, checkedIn] = await Promise.all([
    unwrapCount('ticketStatsIssued', supabase
      .from('ticket_records')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticketId)),
    unwrapCount('ticketStatsCheckedIn', supabase
      .from('ticket_records')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticketId)
      .not('checked_in_at', 'is', null)),
  ]);

  return { issued, checkedIn };
}

/**
 * 签发签到二维码令牌（服务端 15 分钟有效，非组织者只能为自己的票券签发）。
 * 令牌形如 SUP1.<record_id>.<过期秒>.<MAC>，二维码内容就是这串文本。
 */
export async function issueCheckInToken(recordId: string, ttlMinutes = 15): Promise<string> {
  return unwrap('issueCheckInToken', supabase.rpc('ticket_qr_token', {
    p_record: recordId,
    p_ttl_minutes: ttlMinutes,
  })) as Promise<string>;
}

/**
 * 组织者扫码签到：令牌校验/权限/时间窗/防重复/计分全在服务端完成。
 * 这里**不抛错**——业务拒绝（过期、重复、越权）是正常分支，交给 UI 按 code 分流提示。
 */
export async function checkInTicket(token: string): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in_ticket', { p_token: token });

  if (error) {
    log.error('check_in_ticket RPC 失败', error);
    return { ok: false, code: 'rpc_error', message: '签到失败：网络或服务异常，请重试' };
  }
  return data as CheckInResult;
}
