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

  -- 删除旧策略（如果存在）—— 旧策略允许任何已登录用户删除任何附件
  DROP POLICY IF EXISTS "Users can delete own attachments" ON storage.objects;

  -- 重建：只有文件上传者本人可以删除
  -- owner 是 storage.objects 的系统列，Supabase Storage API 上传时自动填充 auth.uid()
  CREATE POLICY "Users can delete own attachments"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'attachments' AND auth.uid() = owner);
END $$;

-- 3. 各表新增 attachments 列（JSONB 数组，默认空）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE notices ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- ============================================================
-- 第十三部分：使用事件埋点表（v3.2）
-- ============================================================

CREATE TABLE IF NOT EXISTS usage_events (
  id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  module     TEXT,
  action     TEXT,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_type_time ON usage_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id);

-- ============================================================
-- 第十四部分：抢票并发安全 RPC（P0-01）
-- ============================================================

CREATE OR REPLACE FUNCTION grab_ticket(
  p_ticket_id UUID,
  p_user_id UUID,
  p_student_id TEXT,
  p_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket RECORD;
  v_my_count INTEGER;
  v_total_grabbed INTEGER;
BEGIN
  -- 1. 锁定票务行（FOR UPDATE 串行化并发请求，消除 TOCTOU）
  SELECT * INTO v_ticket
  FROM tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '票务不存在');
  END IF;

  -- 2. 检查是否到开抢时间
  IF v_ticket.open_time > now() THEN
    RETURN jsonb_build_object('success', false, 'message', '尚未到开抢时间');
  END IF;

  -- 3. 检查用户已抢数量（在同一事务内，count 不受并发插入影响）
  SELECT count(*) INTO v_my_count
  FROM ticket_records
  WHERE ticket_id = p_ticket_id AND user_id = p_user_id;

  IF v_my_count >= v_ticket.per_user_limit THEN
    RETURN jsonb_build_object('success', false, 'message', '每人限抢 ' || v_ticket.per_user_limit || ' 张');
  END IF;

  -- 4. 检查剩余票数
  SELECT count(*) INTO v_total_grabbed
  FROM ticket_records
  WHERE ticket_id = p_ticket_id;

  IF v_total_grabbed >= v_ticket.total_count THEN
    RETURN jsonb_build_object('success', false, 'message', '票已被抢完');
  END IF;

  -- 5. 插入抢票记录
  INSERT INTO ticket_records (ticket_id, user_id, student_id, name)
  VALUES (p_ticket_id, p_user_id, p_student_id, p_name);

  RETURN jsonb_build_object('success', true, 'message', '抢票成功！');

EXCEPTION
  WHEN unique_violation THEN
    -- UNIQUE(ticket_id, user_id) 约束冲突 = 重复抢票
    RETURN jsonb_build_object('success', false, 'message', '你已抢过该票');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', '抢票失败，请重试');
END;
$$;

-- ============================================================
-- 第十五部分：邀请码机制增强（P0-04）
-- ============================================================

-- 1. 新增字段（向后兼容，DEFAULT 确保旧数据不丢失）
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 1;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS used_count INTEGER DEFAULT 0;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- 2. 数据回填：旧"已使用"的邀请码设 used_count = 1
UPDATE invite_codes
SET used_count = 1
WHERE is_used = true
  AND used_by IS NOT NULL
  AND used_count = 0;

-- 3. 数据回填：旧"手动停用"的邀请码（is_used=true 但 used_by 为空）→ 视为被撤销
UPDATE invite_codes
SET revoked_at = created_at
WHERE is_used = true
  AND used_by IS NULL
  AND revoked_at IS NULL;

-- 4. 索引：按创建者查询
CREATE INDEX IF NOT EXISTS idx_invite_created_by ON invite_codes(created_by);

-- ============================================================
-- 第十六部分：安全加固（2026-09-05，对应 supabase-security-fix-step1/2.sql）
-- ============================================================
-- 背景：本文件前段（第 183-215 行）users/tasks/notices 等核心表的 RLS 曾被整体
--       注释停用，而 Supabase 对未开 RLS 的表默认授予 anon 全部权限（anon key
--       打包在前端公开 JS 里），实测匿名可读全员名单、可写可删任意业务数据。
-- 方案：登录前必需的 3 条匿名查询改走 SECURITY DEFINER 函数（最小暴露、不可枚举）；
--       其余表开启 RLS 后仅对 authenticated 放行（USING(true)/WITH CHECK(true)，
--       与此前登录用户的实际权限完全一致，应用功能零变化），anon 一律拒绝。
-- 注意：函数须先于 RLS 创建（本部分即为该顺序）；
--       对已运行的生产库，请按 supabase-security-fix-step1.sql → 部署新版前端 →
--       supabase-security-fix-step2.sql 的顺序分步执行，勿一次性跑本文件。

-- ---- 1. 匿名最小暴露函数（同 step1） ----

CREATE OR REPLACE FUNCTION validate_invite_code(code_input text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(ic)
  FROM invite_codes ic
  WHERE ic.code = code_input
$$;

CREATE OR REPLACE FUNCTION check_student_registered(student_id_input text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u WHERE u.student_id = student_id_input
  )
$$;

CREATE OR REPLACE FUNCTION verify_user_identity(name_input text, student_id_input text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(r)
  FROM (
    SELECT u.auth_id, u.name
    FROM users u
    WHERE u.student_id = student_id_input AND u.name = name_input
  ) r
$$;

GRANT EXECUTE ON FUNCTION validate_invite_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_student_registered(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_user_identity(text, text) TO anon, authenticated;

-- ---- 2. 全表 RLS：authenticated 全量放行，anon 拒绝（同 step2） ----

ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_notices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_milestones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'invite_codes', 'tasks', 'task_submissions', 'notices',
    'school_notices', 'forum_posts', 'forum_replies', 'tickets',
    'ticket_records', 'task_templates', 'task_milestones',
    'department_guides', 'usage_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON %I', t);
    EXECUTE format(
      'CREATE POLICY authenticated_full_access ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- ============================================================
-- 第十七部分：数据库优化升级（2026-09-11，v4.3.0）
-- ============================================================
-- 与第十六部分（安全收口）相互独立，**可在部署 v4.3.0 前端之前或之后执行**，全部幂等可重跑。
-- 一次性执行请用配套文件 supabase-optimize-v4.3.0.sql（内容与本部分完全一致）。
--
-- 本部分解决四类问题，均为「不改变任何业务语义、只让同样的查询更快/更稳」：
--   1) 唯一索引：RLS 的每条策略都要算 `auth_id = auth.uid()`，而 users.auth_id 此前没有索引
--      → 每个策略判定都在全表扫描 users，行数越多越慢（且这是登录后所有查询的公共开销）。
--   2) 外键索引补齐：PostgreSQL **不会**为外键列自动建索引；缺索引会让 FK 联表、以及
--      ON DELETE CASCADE（如删任务级联删提交/里程碑）退化为全表扫描。
--   3) 复合索引：贴合列表分页、待办聚合、通知分栏的真实 WHERE + ORDER BY（本轮 v4.3.0 的
--      「通知分页 / 类型分栏」「成员与任务导出」都直接吃这几条）。
--   4) 完整性收口：updated_at 交给数据库触发器统一维护（不再依赖各调用点手写时间），
--      两个取值完全枚举的列加 CHECK（NOT VALID：存量行不校验、只约束后续写入）。
--
-- 说明：全部用普通 CREATE INDEX（不加 CONCURRENTLY）——CONCURRENTLY 不能在事务块内执行，
--       而 Supabase SQL Editor 会包事务；本库表体量小，短暂写锁可忽略。

-- ---- 1. users.auth_id：登录查询与 RLS 策略判定的热路径 ----
-- 先查重：若历史数据里同一 auth_id 对应多个 users 行，唯一索引会整体失败拖垮后续语句，
-- 故此处降级为普通索引并用 NOTICE 明确告知（清理重复行后重跑本段即可升级为唯一索引）。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE auth_id IS NOT NULL
    GROUP BY auth_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'users.auth_id 存在重复值，已跳过唯一索引（请清理重复行后重跑第十七部分第 1 段）';
    CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_id ON users(auth_id);
  END IF;
END $$;

-- users 的其他过滤列（部门列表 / 角色筛选 / 学号已由 UNIQUE 覆盖）
CREATE INDEX IF NOT EXISTS idx_users_department_role ON users(department, role);

-- ---- 2. 外键列索引补齐 ----
-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to       ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by        ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_template_id       ON tasks(template_id);
CREATE INDEX IF NOT EXISTS idx_tasks_linked_notice_id  ON tasks(linked_notice_id);
-- task_submissions / task_milestones / task_templates
CREATE INDEX IF NOT EXISTS idx_task_submissions_task    ON task_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_user    ON task_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_milestones_task     ON task_milestones(task_id);
CREATE INDEX IF NOT EXISTS idx_task_milestones_done_by  ON task_milestones(completed_by);
CREATE INDEX IF NOT EXISTS idx_task_templates_created   ON task_templates(created_by);
-- notices / school_notices / forum
CREATE INDEX IF NOT EXISTS idx_notices_created_by       ON notices(created_by);
CREATE INDEX IF NOT EXISTS idx_school_notices_created   ON school_notices(created_by);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created_by   ON forum_posts(created_by);
CREATE INDEX IF NOT EXISTS idx_forum_replies_post       ON forum_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_created    ON forum_replies(created_by);
-- tickets
CREATE INDEX IF NOT EXISTS idx_tickets_created_by       ON tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_ticket_records_ticket    ON ticket_records(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_records_user      ON ticket_records(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_records_student   ON ticket_records(student_id);
-- invite_codes（created_by 的 idx_invite_created_by 已在第十五部分建好）
CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by     ON invite_codes(used_by);
CREATE INDEX IF NOT EXISTS idx_invite_codes_dept        ON invite_codes(department);
-- 其余
CREATE INDEX IF NOT EXISTS idx_notice_reads_user        ON notice_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_dept_guides_updated_by   ON department_guides(updated_by);
CREATE INDEX IF NOT EXISTS idx_platform_guides_module   ON platform_guides(module_key, sort_order);

-- ---- 3. 复合索引：贴合真实 WHERE + ORDER BY ----
-- 通知：分栏（type）+ 时间倒序翻页。已有 idx_notifications_user_id 的第二列是 is_read，
-- 对「不筛已读状态、只按时间翻页」的查询用不上，故单独建一条。
CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user_id, created_at DESC);
-- 通知：未读是高频子集（侧边栏角标 / 未读计数 / 只看未读），部分索引体积远小于全表
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON notifications(user_id, created_at DESC) WHERE is_read = false;
-- 任务：部门 + 状态 + 创建时间（列表页默认视图、看板分列）
CREATE INDEX IF NOT EXISTS idx_tasks_dept_status_time  ON tasks(assigned_department, status, created_at DESC);
-- 任务：状态 + 截止时间（首页待办、逾期统计）
CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline   ON tasks(status, deadline);
-- 任务：周报/月报按 updated_at 圈时间窗
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at        ON tasks(updated_at DESC);
-- 公告 / 校级通知 / 论坛：部门（或置顶）+ 时间倒序
CREATE INDEX IF NOT EXISTS idx_notices_dept_time        ON notices(department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_notices_pin_time  ON school_notices(is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_dept_time    ON forum_posts(department, created_at DESC);
-- 票务：开抢时间倒序（列表默认排序）
CREATE INDEX IF NOT EXISTS idx_tickets_open_time        ON tickets(open_time DESC);
-- 埋点：模块维度统计（数据看板页面访问排名）
CREATE INDEX IF NOT EXISTS idx_usage_events_module_time ON usage_events(module, event_type, created_at DESC);

-- ---- 4. updated_at 由数据库统一维护 ----
-- 背景：此前 updated_at 由前端各处手写 `new Date().toISOString()`，绕过前端直接改数据时不会更新，
--       周报「本周完成数」按 updated_at 圈时间窗，一旦漏写就会统计失真。
-- 触发器只在 UPDATE 时覆盖该列，前端继续传值也不会冲突（以库时间为准，跨时区更准）。
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tasks', 'task_templates', 'forum_posts', 'department_guides', 'platform_guides'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ---- 5. 完整性收口：仅对「取值完全枚举且不会随版本扩张」的列加约束 ----
-- 用 NOT VALID：不回头校验存量行（历史脏数据不会让迁移失败），但此后所有 INSERT/UPDATE 都受约束。
-- 有意不加约束的列及原因：
--   tasks.status / tasks.priority —— 历史数据存在早期取值（high/low/submitted 等），且后续版本还会扩枚举；
--   notifications.type           —— Phase 3 计划新增 mention 等类型，硬约束会让新功能写入失败。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role') THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_role
      CHECK (role IN ('volunteer','dept_head','presidium','president','teacher','developer','removed'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_task_milestones_status') THEN
    ALTER TABLE task_milestones ADD CONSTRAINT chk_task_milestones_status
      CHECK (status IN ('pending','completed'))
      NOT VALID;
  END IF;
END $$;

-- ---- 6. 刷新统计信息（新索引立即被规划器纳入成本估算）----
ANALYZE users;
ANALYZE tasks;
ANALYZE task_submissions;
ANALYZE task_milestones;
ANALYZE notices;
ANALYZE forum_posts;
ANALYZE forum_replies;
ANALYZE tickets;
ANALYZE ticket_records;
ANALYZE notifications;

-- ---- 核对（执行后跑一次，应看到全部 true / 索引清单）----
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;
-- SELECT conname, convalidated FROM pg_constraint WHERE conname IN ('chk_users_role','chk_task_milestones_status');
--   ↑ convalidated = false 是预期结果（NOT VALID）；存量数据清理干净后可执行
--     ALTER TABLE users VALIDATE CONSTRAINT chk_users_role; 升级为完全校验。
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_%_touch';
