import supabase from '../supabaseClient';

export type EventType = 'page_view' | 'task_complete' | 'notice_read'
  | 'ticket_action' | 'error' | 'login';

interface TrackPayload {
  event_type: EventType;
  userId: string;
  module?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 记录使用事件
 *
 * fire-and-forget：绝不阻塞用户操作、永不抛异常。
 * 调用方需要传入 userId（从 useAuth() 获取），避免每次额外查询 session。
 */
export function trackEvent(payload: TrackPayload): void {
  const doTrack = async () => {
    try {
      const { error } = await supabase
        .from('usage_events')
        .insert({
          event_type: payload.event_type,
          user_id: payload.userId,
          module: payload.module ?? null,
          action: payload.action ?? null,
          metadata: payload.metadata ?? {},
        });
      if (error) console.warn('[analytics]', error.message);
    } catch {
      // 静默忽略：网络异常或 Supabase 不可用时不影响用户操作
    }
  };
  doTrack();
}
