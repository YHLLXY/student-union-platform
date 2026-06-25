import supabase from '../../supabaseClient';

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

/** 获取所有票务（含剩余数量） */
export async function fetchTickets(): Promise<Ticket[]> {
  const { data } = await supabase
    .from('tickets')
    .select('*, creator:created_by(name)')
    .order('open_time', { ascending: true });

  if (!data) return [];

  // 并行查询每个票务的已抢数量
  const tickets = await Promise.all(
    data.map(async (t: Record<string, unknown>) => {
      const { count } = await supabase
        .from('ticket_records')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_id', t.id);

      return {
        ...t,
        creator_name: (t.creator as { name: string } | null)?.name ?? '未知',
        remaining_count: (t.total_count as number) - (count ?? 0),
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

  if (error) return null;
  return data as Ticket;
}

/** 抢票（带并发安全检查） */
export async function grabTicket(
  ticketId: string,
  userId: string,
  studentId: string,
  name: string,
): Promise<{ success: boolean; message: string }> {
  // 1. 获取票务信息
  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .single();

  if (!ticket) return { success: false, message: '票务不存在' };

  // 2. 检查是否到开抢时间
  if (new Date(ticket.open_time) > new Date()) {
    return { success: false, message: '尚未到开抢时间' };
  }

  // 3. 检查用户已抢数量
  const { count: myCount } = await supabase
    .from('ticket_records')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', ticketId)
    .eq('user_id', userId);

  if (myCount && myCount >= ticket.per_user_limit) {
    return { success: false, message: `每人限抢 ${ticket.per_user_limit} 张` };
  }

  // 4. 检查剩余票数
  const { count: totalGrabbed } = await supabase
    .from('ticket_records')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', ticketId);

  if (totalGrabbed && totalGrabbed >= ticket.total_count) {
    return { success: false, message: '票已被抢完' };
  }

  // 5. 插入抢票记录
  const { error } = await supabase
    .from('ticket_records')
    .insert({
      ticket_id: ticketId,
      user_id: userId,
      student_id: studentId,
      name,
    });

  if (error) {
    // 唯一约束冲突 = 重复抢票
    if (error.code === '23505') {
      return { success: false, message: '你已抢过该票' };
    }
    return { success: false, message: '抢票失败，请重试' };
  }

  return { success: true, message: '抢票成功！' };
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
}

/** 获取我的票券 */
export async function fetchMyTickets(userId: string): Promise<MyTicket[]> {
  const { data } = await supabase
    .from('ticket_records')
    .select('*, ticket:ticket_id(title, event_time)')
    .eq('user_id', userId)
    .order('grabbed_at', { ascending: false });

  if (!data) return [];

  return data.map((r: Record<string, unknown>) => {
    const ticket = r.ticket as { title: string; event_time: string } | null;
    return {
      id: r.id as string,
      ticket_id: r.ticket_id as string,
      user_id: r.user_id as string,
      student_id: r.student_id as string,
      name: r.name as string,
      grabbed_at: r.grabbed_at as string,
      ticket_title: ticket?.title ?? '未知',
      event_time: ticket?.event_time ?? '',
    };
  });
}

/** 获取当前用户已抢的票务 ID 列表（用于按钮状态判断） */
export async function fetchMyGrabbedIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('ticket_records')
    .select('ticket_id')
    .eq('user_id', userId);

  if (!data) return new Set();
  return new Set(data.map((r: { ticket_id: string }) => r.ticket_id));
}

/** 获取某票务的抢票记录（发布者查看） */
export async function fetchTicketRecords(ticketId: string): Promise<TicketRecord[]> {
  const { data } = await supabase
    .from('ticket_records')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('grabbed_at', { ascending: true });

  return data as TicketRecord[] ?? [];
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
