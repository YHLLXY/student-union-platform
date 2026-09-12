/* ============================================================
   手写 Supabase Database 类型
   事实来源：supabase-migration.sql（改表结构须同步此处）
   约定：
     - timestamptz → string；uuid/TEXT → string；INTEGER → number
     - JSONB 按业务实际结构收敛为具体类型，避免 unknown 渗透
     - Relationships 声明外键，支撑 select('*, creator:created_by(name)') 嵌套推断
   ============================================================ */

/** 存储附件元数据（tasks/notices/forum_posts.attachments，JSONB） */
export interface AttachmentMeta {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

/** 任务模板步骤（task_templates.steps，JSONB） */
export interface TemplateStepMeta {
  order: number;
  title: string;
  description: string;
}

/** 部门指南基本信息（department_guides.basic_info，JSONB） */
export interface DeptBasicInfo {
  leader?: string;
  teacher?: string;
  office?: string;
  group_chat?: string;
}

/** 积分流水的原因（points_ledger.reason）。四个自动计分点见 supabase-migration.sql 第十八部分；
 *  保留 (string & {}) 分支是因为手工冲销时可写任意原因，不把类型写死。 */
export type PointsReason =
  | 'task_approved'
  | 'submission_on_time'
  | 'submission_late'
  | 'ticket_checkin'
  | (string & {});

/**
 * register_user RPC 的返回结构（第二十部分，v4.6.0）。
 * `ok=true` 时 `user` 是落库后的整行；`ok=false` 时 `error` 是可直接展示给用户的中文原因
 *（邀请码无效/已撤销/已过期/已用完、学号已注册、身份校验失败）。
 */
export interface RegisterUserResult {
  ok: boolean;
  error?: string;
  user?: Record<string, unknown>;
}

/** check_in_ticket RPC 的返回结构（code 用于前端分流提示，不要按 message 做判断） */
export interface CheckInResult {
  ok: boolean;
  code:
    | 'forbidden'
    | 'invalid_token'
    | 'not_found'
    | 'already_checked_in'
    | 'ticket_missing'
    | 'out_of_window'
    | 'checked_in'
    /** 前端侧补充：RPC 网络/传输失败（不是业务拒绝） */
    | 'rpc_error';
  message: string;
  name?: string;
  student_id?: string;
  ticket?: string;
  checked_in_at?: string;
  event_time?: string;
}

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Relationship {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

/** 外键关系声明（字面量泛型保留类型信息，供嵌套 select 推断使用） */
type Rel<
  F extends string,
  C extends [string, ...string[]],
  R extends string,
> = {
  foreignKeyName: F;
  columns: C;
  isOneToOne: false;
  referencedRelation: R;
  referencedColumns: ['id'];
};

type FkUsers<C extends [string, ...string[]], F extends string> = Rel<F, C, 'users'>;

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_id: string | null;
          name: string;
          student_id: string;
          department: string;
          role: string;
          avatar_url: string | null;
          created_at: string;
          /** 是否已看过新人引导（完成或跳过都置 true）。默认 false，见第十九部分。 */
          onboarded: boolean;
          /** 联系方式，本人在个人中心自行填写；NULL = 未填写 */
          contact_phone: string | null;
          contact_email: string | null;
        };
        Insert: {
          id?: string;
          auth_id?: string | null;
          name: string;
          student_id: string;
          department?: string;
          role?: string;
          avatar_url?: string | null;
          created_at?: string;
          onboarded?: boolean;
          contact_phone?: string | null;
          contact_email?: string | null;
        };
        Update: {
          id?: string;
          auth_id?: string | null;
          name?: string;
          student_id?: string;
          department?: string;
          role?: string;
          avatar_url?: string | null;
          created_at?: string;
          onboarded?: boolean;
          contact_phone?: string | null;
          contact_email?: string | null;
        };
        Relationships: [];
      };
      invite_codes: {
        Row: {
          id: string;
          code: string;
          department: string;
          role: string;
          is_used: boolean | null;
          used_by: string | null;
          used_count: number | null;
          max_uses: number | null;
          expires_at: string | null;
          revoked_at: string | null;
          created_by: string | null;
          created_at: string;
          /** 批次号：一次「批量生成」写入同一个值，便于整批导出/作废（第十八部分新增） */
          batch_id: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          department: string;
          role?: string;
          is_used?: boolean;
          used_by?: string | null;
          used_count?: number | null;
          max_uses?: number | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          batch_id?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          department?: string;
          role?: string;
          is_used?: boolean;
          used_by?: string | null;
          used_count?: number | null;
          max_uses?: number | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          batch_id?: string | null;
        };
        Relationships: [FkUsers<['used_by'], 'invite_codes_used_by_fkey'>];
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          content: string | null;
          priority: string;
          status: string;
          deadline: string | null;
          created_by: string | null;
          assigned_to: string | null;
          assigned_department: string;
          created_at: string;
          updated_at: string;
          template_id: string | null;
          handover_note: string | null;
          collaborating_departments: string[] | null;
          has_milestones: boolean | null;
          linked_notice_id: string | null;
          attachments: AttachmentMeta[] | null;
        };
        Insert: {
          id?: string;
          title: string;
          content?: string | null;
          priority?: string;
          status?: string;
          deadline?: string | null;
          created_by?: string | null;
          assigned_to?: string | null;
          assigned_department: string;
          created_at?: string;
          updated_at?: string;
          template_id?: string | null;
          handover_note?: string | null;
          collaborating_departments?: string[];
          has_milestones?: boolean;
          linked_notice_id?: string | null;
          attachments?: AttachmentMeta[];
        };
        Update: {
          id?: string;
          title?: string;
          content?: string | null;
          priority?: string;
          status?: string;
          deadline?: string | null;
          created_by?: string | null;
          assigned_to?: string | null;
          assigned_department?: string;
          created_at?: string;
          updated_at?: string;
          template_id?: string | null;
          handover_note?: string | null;
          collaborating_departments?: string[] | null;
          has_milestones?: boolean;
          linked_notice_id?: string | null;
          attachments?: AttachmentMeta[] | null;
        };
        Relationships: [
          FkUsers<['created_by'], 'tasks_created_by_fkey'>,
          FkUsers<['assigned_to'], 'tasks_assigned_to_fkey'>,
          Rel<'tasks_template_id_fkey', ['template_id'], 'task_templates'>,
          Rel<'tasks_linked_notice_id_fkey', ['linked_notice_id'], 'notices'>,
        ];
      };
      task_submissions: {
        Row: {
          id: string;
          task_id: string;
          user_id: string | null;
          note: string | null;
          status: string | null;
          review_note: string | null;
          submitted_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id?: string | null;
          note?: string | null;
          status?: string;
          review_note?: string | null;
          submitted_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string | null;
          note?: string | null;
          status?: string;
          review_note?: string | null;
          submitted_at?: string;
          reviewed_at?: string | null;
        };
        Relationships: [
          Rel<'task_submissions_task_id_fkey', ['task_id'], 'tasks'>,
          FkUsers<['user_id'], 'task_submissions_user_id_fkey'>,
        ];
      };
      notices: {
        Row: {
          id: string;
          title: string;
          content: string | null;
          type: string | null;
          department: string;
          is_pinned: boolean | null;
          created_by: string | null;
          created_at: string;
          linked_tasks: string[] | null;
          attachments: AttachmentMeta[] | null;
        };
        Insert: {
          id?: string;
          title: string;
          content?: string | null;
          type?: string;
          department: string;
          is_pinned?: boolean;
          created_by?: string | null;
          created_at?: string;
          linked_tasks?: string[];
          attachments?: AttachmentMeta[];
        };
        Update: {
          id?: string;
          title?: string;
          content?: string | null;
          type?: string;
          department?: string;
          is_pinned?: boolean;
          created_by?: string | null;
          created_at?: string;
          linked_tasks?: string[];
          attachments?: AttachmentMeta[];
        };
        Relationships: [FkUsers<['created_by'], 'notices_created_by_fkey'>];
      };
      school_notices: {
        Row: {
          id: string;
          title: string;
          content: string | null;
          is_pinned: boolean | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content?: string | null;
          is_pinned?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string | null;
          is_pinned?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [FkUsers<['created_by'], 'school_notices_created_by_fkey'>];
      };
      forum_posts: {
        Row: {
          id: string;
          title: string;
          content: string | null;
          category: string | null;
          department: string;
          collaborating_departments: string[] | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          template_type: string | null;
          template_data: Json | null;
          attachments: AttachmentMeta[] | null;
          /** 置顶时间；NULL = 未置顶。排序键 pinned_at DESC NULLS LAST, created_at DESC */
          pinned_at: string | null;
          /** 回复数缓存列，由 trg_forum_replies_count 维护 —— 客户端只读，不要写入 */
          reply_count: number;
          /** 点赞数缓存列，由 trg_forum_likes_count 维护 —— 客户端只读，不要写入 */
          like_count: number;
        };
        Insert: {
          id?: string;
          title: string;
          content?: string | null;
          category?: string;
          department: string;
          collaborating_departments?: string[];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          template_type?: string | null;
          template_data?: Json | null;
          attachments?: AttachmentMeta[];
          pinned_at?: string | null;
          reply_count?: number;
          like_count?: number;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string | null;
          category?: string;
          department?: string;
          collaborating_departments?: string[];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          template_type?: string | null;
          template_data?: Json | null;
          attachments?: AttachmentMeta[];
          pinned_at?: string | null;
          reply_count?: number;
          like_count?: number;
        };
        Relationships: [FkUsers<['created_by'], 'forum_posts_created_by_fkey'>];
      };
      forum_likes: {
        Row: {
          post_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          post_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          post_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          Rel<'forum_likes_post_id_fkey', ['post_id'], 'forum_posts'>,
          FkUsers<['user_id'], 'forum_likes_user_id_fkey'>,
        ];
      };
      forum_bookmarks: {
        Row: {
          post_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          post_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          post_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          Rel<'forum_bookmarks_post_id_fkey', ['post_id'], 'forum_posts'>,
          FkUsers<['user_id'], 'forum_bookmarks_user_id_fkey'>,
        ];
      };
      forum_replies: {
        Row: {
          id: string;
          post_id: string;
          content: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          content: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          content?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          Rel<'forum_replies_post_id_fkey', ['post_id'], 'forum_posts'>,
          FkUsers<['created_by'], 'forum_replies_created_by_fkey'>,
        ];
      };
      tickets: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          cover_url: string | null;
          total_count: number;
          per_user_limit: number | null;
          open_time: string;
          event_time: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          cover_url?: string | null;
          total_count: number;
          per_user_limit?: number;
          open_time: string;
          event_time: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          cover_url?: string | null;
          total_count?: number;
          per_user_limit?: number;
          open_time?: string;
          event_time?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [FkUsers<['created_by'], 'tickets_created_by_fkey'>];
      };
      ticket_records: {
        Row: {
          id: string;
          ticket_id: string;
          user_id: string | null;
          student_id: string;
          name: string;
          grabbed_at: string;
          /** 签到时间；NULL = 未签到（第十八部分新增，由 check_in_ticket RPC 写入） */
          checked_in_at: string | null;
          /** 签到操作人（组织者）的 users.id */
          checked_by: string | null;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          user_id?: string | null;
          student_id: string;
          name: string;
          grabbed_at?: string;
          checked_in_at?: string | null;
          checked_by?: string | null;
        };
        Update: {
          id?: string;
          ticket_id?: string;
          user_id?: string | null;
          student_id?: string;
          name?: string;
          grabbed_at?: string;
          checked_in_at?: string | null;
          checked_by?: string | null;
        };
        Relationships: [
          Rel<'ticket_records_ticket_id_fkey', ['ticket_id'], 'tickets'>,
          FkUsers<['user_id'], 'ticket_records_user_id_fkey'>,
          FkUsers<['checked_by'], 'ticket_records_checked_by_fkey'>,
        ];
      };
      task_templates: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          department: string;
          steps: TemplateStepMeta[];
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          department: string;
          steps?: TemplateStepMeta[];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          department?: string;
          steps?: TemplateStepMeta[];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [FkUsers<['created_by'], 'task_templates_created_by_fkey'>];
      };
      task_milestones: {
        Row: {
          id: string;
          task_id: string;
          title: string;
          description: string | null;
          deadline: string | null;
          status: string;
          sort_order: number | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          title: string;
          description?: string | null;
          deadline?: string | null;
          status?: string;
          sort_order?: number;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          title?: string;
          description?: string | null;
          deadline?: string | null;
          status?: string;
          sort_order?: number;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          Rel<'task_milestones_task_id_fkey', ['task_id'], 'tasks'>,
          FkUsers<['completed_by'], 'task_milestones_completed_by_fkey'>,
        ];
      };
      department_guides: {
        Row: {
          id: string;
          department: string;
          basic_info: Json | null;
          templates: Json | null;
          faqs: Json | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          department: string;
          basic_info?: Json;
          templates?: Json;
          faqs?: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          department?: string;
          basic_info?: Json;
          templates?: Json;
          faqs?: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [FkUsers<['updated_by'], 'department_guides_updated_by_fkey'>];
      };
      platform_guides: {
        Row: {
          id: string;
          module_key: string;
          title: string;
          content: string;
          sort_order: number | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          module_key: string;
          title: string;
          content?: string;
          sort_order?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          module_key?: string;
          title?: string;
          content?: string;
          sort_order?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          FkUsers<['created_by'], 'platform_guides_created_by_fkey'>,
          FkUsers<['updated_by'], 'platform_guides_updated_by_fkey'>,
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          content: string;
          related_link: string | null;
          is_read: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          content?: string;
          related_link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          content?: string;
          related_link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [FkUsers<['user_id'], 'notifications_user_id_fkey'>];
      };
      notice_reads: {
        Row: {
          id: string;
          notice_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          id?: string;
          notice_id: string;
          user_id: string;
          read_at?: string;
        };
        Update: {
          id?: string;
          notice_id?: string;
          user_id?: string;
          read_at?: string;
        };
        Relationships: [
          Rel<'notice_reads_notice_id_fkey', ['notice_id'], 'notices'>,
          FkUsers<['user_id'], 'notice_reads_user_id_fkey'>,
        ];
      };
      usage_events: {
        Row: {
          id: number;
          event_type: string;
          user_id: string | null;
          module: string | null;
          action: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          event_type: string;
          user_id?: string | null;
          module?: string | null;
          action?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          event_type?: string;
          user_id?: string | null;
          module?: string | null;
          action?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      /** 考核积分流水（第十八部分新增）。只增不改：前端只有读权限，
          写入由数据库触发器与 award_points 函数完成（审核通过 +2 / 按时提交 +1 /
          逾期提交 -1 / 活动签到 +1）。 */
      points_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: PointsReason;
          ref_type: string | null;
          ref_id: string | null;
          /** 学期键，形如 2026-2027-1（数据库按学期自动落值） */
          semester: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          delta: number;
          reason: string;
          ref_type?: string | null;
          ref_id?: string | null;
          semester?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          delta?: number;
          reason?: string;
          ref_type?: string | null;
          ref_id?: string | null;
          semester?: string;
          created_at?: string;
        };
        Relationships: [FkUsers<['user_id'], 'points_ledger_user_id_fkey'>];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /**
       * 注册的唯一入口（第二十部分，v4.6.0）：把「复核邀请码 → 建号 → 核销邀请码」放进一个
       * 事务，角色与部门**由邀请码推导**（客户端传什么都不算数）。
       * 返回 { ok, error?, user? }，user 是落库后的整行（含列默认值，如 onboarded=false）。
       */
      register_user: {
        Args: {
          p_auth_id: string;
          p_name: string;
          p_student_id: string;
          p_invite_code: string;
        };
        Returns: RegisterUserResult;
      };
      grab_ticket: {
        Args: {
          p_ticket_id: string;
          p_user_id: string;
          p_student_id: string;
          p_name: string;
        };
        Returns: Json;
      };
      reset_user_password: {
        Args: { user_id: string; new_password: string };
        Returns: boolean;
      };
      validate_invite_code: {
        Args: { code_input: string };
        Returns: Json;
      };
      check_student_registered: {
        Args: { student_id_input: string };
        Returns: boolean;
      };
      verify_user_identity: {
        Args: { name_input: string; student_id_input: string };
        Returns: Json;
      };
      /** 签发签到二维码令牌（非组织者只能为自己的票券签发） */
      ticket_qr_token: {
        Args: { p_record: string; p_ttl_minutes?: number };
        Returns: string;
      };
      /** 扫码签到：服务端完成令牌校验/权限/时间窗/防重复/计分，返回结构化结果 */
      check_in_ticket: {
        Args: { p_token: string };
        Returns: CheckInResult;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TableName = keyof Database['public']['Tables'];
export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row'];
