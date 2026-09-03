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
        };
        Relationships: [FkUsers<['created_by'], 'forum_posts_created_by_fkey'>];
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
        };
        Insert: {
          id?: string;
          ticket_id: string;
          user_id?: string | null;
          student_id: string;
          name: string;
          grabbed_at?: string;
        };
        Update: {
          id?: string;
          ticket_id?: string;
          user_id?: string | null;
          student_id?: string;
          name?: string;
          grabbed_at?: string;
        };
        Relationships: [
          Rel<'ticket_records_ticket_id_fkey', ['ticket_id'], 'tickets'>,
          FkUsers<['user_id'], 'ticket_records_user_id_fkey'>,
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
    };
    Views: Record<string, never>;
    Functions: {
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TableName = keyof Database['public']['Tables'];
export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row'];
