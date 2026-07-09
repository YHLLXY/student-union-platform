-- ============================================================
-- 学生会线上交流平台 — Supabase 数据库迁移脚本
-- 请复制到 Supabase Dashboard → SQL Editor 中逐段执行
-- ============================================================

-- ============================================================
-- 第一部分：建表
-- ============================================================

-- 1. 用户表（与 Supabase auth.users 关联）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  student_id TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'volunteer',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'volunteer',
  is_used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  deadline TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  assigned_department TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 任务提交记录表
CREATE TABLE IF NOT EXISTS task_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  note TEXT,
  status TEXT DEFAULT 'submitted',
  review_note TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- 5. 部门公告表
CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'notification',
  department TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. 校级通知表
CREATE TABLE IF NOT EXISTS school_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  is_pinned BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. 论坛帖子表
CREATE TABLE IF NOT EXISTS forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  category TEXT DEFAULT 'discussion',
  department TEXT NOT NULL,
  collaborating_departments TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. 论坛回复表
CREATE TABLE IF NOT EXISTS forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. 票务表
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  total_count INTEGER NOT NULL,
  per_user_limit INTEGER DEFAULT 1,
  open_time TIMESTAMPTZ NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. 抢票记录表
CREATE TABLE IF NOT EXISTS ticket_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  student_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grabbed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);

-- ============================================================
-- 第二部分：存储过程（密码重置）
-- ============================================================

CREATE OR REPLACE FUNCTION reset_user_password(user_id UUID, new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = user_id;
  RETURN FOUND;
END;
$$;

-- ============================================================
-- 第三部分：种子数据（邀请码）
-- ============================================================

INSERT INTO invite_codes (code, department, role, is_used) VALUES
  -- 部门负责人
  ('ZHUZI_ADM', 'presidium', 'presidium', false),
  ('XUEBAN_AD', 'student_office', 'dept_head', false),
  ('XUEFU_ADM', 'academic_support', 'dept_head', false),
  ('QINXIE_AD', 'youth_volunteers', 'dept_head', false),
  ('ZUZHI_ADM', 'organization', 'dept_head', false),
  ('XUEZI_ADM', 'student_aid', 'dept_head', false),
  ('KEXIA_ADM', 'science_competition', 'dept_head', false),
  ('XUAN_ADM', 'publicity', 'dept_head', false),
  ('SHENHU_AD', 'life_services', 'dept_head', false),
  ('TIYU_ADM', 'sports', 'dept_head', false),
  ('WENYI_ADM', 'arts', 'dept_head', false),
  ('RENW_ADM', 'humanities', 'dept_head', false),
  -- 普通志愿者
  ('ZHUZI_VOL', 'presidium', 'volunteer', false),
  ('TIYU_VOL', 'sports', 'volunteer', false),
  ('WENYI_VOL', 'arts', 'volunteer', false),
  ('XUAN_VOL', 'publicity', 'volunteer', false),
  -- 主席
  ('PRESIDENT1', 'presidium', 'president', false),
  -- 教师
  ('TEACHER01', 'presidium', 'teacher', false),
  ('TEACHER02', 'presidium', 'teacher', false),
  ('TEACHER03', 'presidium', 'teacher', false)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 第四部分：RLS 行级安全策略（按需启用）
-- ============================================================
-- 注：RLS 默认关闭。建议先在应用中充分测试，确认无误后再启用。
-- 启用方式：逐表执行 ALTER TABLE ... ENABLE ROW LEVEL SECURITY;

-- -- 用户表 RLS
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "users_select_own" ON users
--   FOR SELECT USING (auth_id = auth.uid());

-- -- 任务表 RLS
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "tasks_read_dept" ON tasks FOR SELECT
--   USING (assigned_department = (SELECT department FROM users WHERE auth_id = auth.uid())
--          OR (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('president', 'teacher'));
-- CREATE POLICY "tasks_insert_leaders" ON tasks FOR INSERT
--   WITH CHECK ((SELECT role FROM users WHERE auth_id = auth.uid()) IN ('dept_head', 'presidium', 'president', 'teacher'));

-- -- 公告表 RLS
-- ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "notices_read_dept" ON notices FOR SELECT
--   USING (department = (SELECT department FROM users WHERE auth_id = auth.uid())
--          OR (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('president', 'teacher'));

-- -- 论坛帖子 RLS
-- ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "forum_read_dept" ON forum_posts FOR SELECT
--   USING (department = (SELECT department FROM users WHERE auth_id = auth.uid())
--          OR collaborating_departments @> ARRAY[(SELECT department FROM users WHERE auth_id = auth.uid())]
--          OR (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('president', 'teacher'));

-- -- 票务记录 RLS
-- ALTER TABLE ticket_records ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "ticket_records_select" ON ticket_records FOR SELECT
--   USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
--          OR ticket_id IN (SELECT id FROM tickets WHERE created_by IN (SELECT id FROM users WHERE auth_id = auth.uid()))
--          OR (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('president', 'teacher'));

-- ============================================================
-- 第五部分：平台增强 — 5模块务实增强（2026-06-29）
-- ============================================================

-- 1. 任务模板表
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  department TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. tasks 表新增列
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES task_templates(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS handover_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS collaborating_departments TEXT[] DEFAULT '{}';

-- 3. forum_posts 表新增列
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS template_type TEXT;
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS template_data JSONB;

-- 4. notices 表新增列
ALTER TABLE notices ADD COLUMN IF NOT EXISTS linked_tasks UUID[] DEFAULT '{}';

-- ============================================================
-- 第六部分：平台增强二期 — 数据库迁移（2026-07-02）
-- ============================================================

-- 1. 任务里程碑表（新增）
CREATE TABLE IF NOT EXISTS task_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | completed
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 部门指南表（新增）
CREATE TABLE IF NOT EXISTS department_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT UNIQUE NOT NULL,
  basic_info JSONB DEFAULT '{}',     -- { leader, teacher, office, group_chat }
  templates JSONB DEFAULT '[]',      -- [{ title, url }]
  faqs JSONB DEFAULT '[]',           -- [{ question, answer }]
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. tasks 表新增列
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS has_milestones BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linked_notice_id UUID REFERENCES notices(id);

-- ============================================================
-- 第七部分：平台功能指南（2026-07-05）
-- ============================================================

-- 1. 平台指南表
CREATE TABLE IF NOT EXISTS platform_guides (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  module_key  TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS 策略
ALTER TABLE platform_guides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read guides' AND tablename = 'platform_guides'
  ) THEN
    CREATE POLICY "Anyone can read guides"
      ON platform_guides FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Dept head+ can insert guides' AND tablename = 'platform_guides'
  ) THEN
    CREATE POLICY "Dept head+ can insert guides"
      ON platform_guides FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM users WHERE auth_id = auth.uid()
        AND role IN ('dept_head','presidium','president','teacher','developer')
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Dept head+ can update guides' AND tablename = 'platform_guides'
  ) THEN
    CREATE POLICY "Dept head+ can update guides"
      ON platform_guides FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM users WHERE auth_id = auth.uid()
        AND role IN ('dept_head','presidium','president','teacher','developer')
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Dept head+ can delete guides' AND tablename = 'platform_guides'
  ) THEN
    CREATE POLICY "Dept head+ can delete guides"
      ON platform_guides FOR DELETE
      USING (EXISTS (
        SELECT 1 FROM users WHERE auth_id = auth.uid()
        AND role IN ('dept_head','presidium','president','teacher','developer')
      ));
  END IF;
END $$;

-- 3. 初始数据由应用层 seedDefaultGuides() 自动播种，不在此处 INSERT
--    原因：SQL 中 \n 需要 E'' 前缀才能正确转义，JS 客户端无此问题
--    首次打开功能指南 Drawer 时自动检测空表并写入默认内容

-- ============================================================
-- 第八部分：通知中心（2026-07-08）
-- ============================================================

-- 1. 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- task_assigned | submission_approved | submission_rejected | forum_reply | new_notice | milestone_overdue
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  related_link TEXT,           -- 跳转路径，如 /tasks、/forum、/notices
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引：按用户 + 未读 + 时间排序
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications(user_id, is_read, created_at DESC);

-- 2. RLS 策略
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own notifications' AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Users can read own notifications"
      ON notifications FOR SELECT
      USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own notifications' AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Users can update own notifications"
      ON notifications FOR UPDATE
      USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert notifications' AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "Authenticated users can insert notifications"
      ON notifications FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 第九部分：公告已读确认（2026-07-08）
-- ============================================================

-- 1. 已读记录表
CREATE TABLE IF NOT EXISTS notice_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(notice_id, user_id)
);

-- 索引：按公告查已读用户
CREATE INDEX IF NOT EXISTS idx_notice_reads_notice_id
  ON notice_reads(notice_id);

-- 2. RLS 策略
ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read notice_reads of own dept' AND tablename = 'notice_reads'
  ) THEN
    CREATE POLICY "Users can read notice_reads of own dept"
      ON notice_reads FOR SELECT
      USING (
        notice_id IN (
          SELECT id FROM notices WHERE department = (
            SELECT department FROM users WHERE auth_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own notice_reads' AND tablename = 'notice_reads'
  ) THEN
    CREATE POLICY "Users can insert own notice_reads"
      ON notice_reads FOR INSERT
      WITH CHECK (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 第十部分：文件上传（2026-07-08）
-- ============================================================

-- 1. Storage bucket 说明
--    请在 Supabase Dashboard > Storage 中手动创建名为 "attachments" 的公开 bucket
--    或执行以下 SQL（需要 storage 模式权限）：
--    INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

-- 2. Storage 对象 RLS 策略
--    公开读：任何人都可以下载附件
--    登录用户可上传 / 可删除自己上传的文件

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public read attachments' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public read attachments"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Auth users can upload attachments' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Auth users can upload attachments"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'attachments' AND auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own attachments' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can delete own attachments"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- 3. 各表新增 attachments 列（JSONB 数组，默认空）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE notices ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
