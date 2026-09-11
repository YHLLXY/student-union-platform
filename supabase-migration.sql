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
--
-- ⚠️ 为什么所有表名都写成 public.xxx —— 附一次误判的更正（2026-09-11 用户实测）：
--      首次执行报 `42P01 relation "users" does not exist`，当时判定为「SQL Editor 会话的
--      search_path 不含 public」；但把表名改成全限定 `public.users` 之后**仍然**报同样的错，
--      这个判定就被证伪了——Postgres 只在表确实不存在时，才会对全限定名报此错。
--      真正原因：贴脚本时打开的是**另一个 Supabase 项目**（Dashboard 会记住上次打开的项目，
--      从历史记录进来极易落到隔壁库），那个库里当然没有本项目的表。
--      正确项目是 bbyykrgitgawqwdgcxhp；复核方式是拿项目 URL 直接打 REST 接口，
--      /rest/v1/users 返回 200（body 是空数组，那是 RLS 拦掉了匿名行）即证明表在该库 public 下。
--      保留 public. 前缀与 SET search_path：成本为零、覆盖 search_path 真异常的场景；
--      但排查顺序要改成「**先确认连的是哪个库**（SELECT current_database()），再谈 schema」。

SET search_path = public;

-- ---- 1. users.auth_id：登录查询与 RLS 策略判定的热路径 ----
-- 先查重：若历史数据里同一 auth_id 对应多个 users 行，唯一索引会整体失败拖垮后续语句，
-- 故此处降级为普通索引并用 NOTICE 明确告知（清理重复行后重跑本段即可升级为唯一索引）。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id IS NOT NULL
    GROUP BY auth_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'users.auth_id 存在重复值，已跳过唯一索引（请清理重复行后重跑第十七部分第 1 段）';
    CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_id ON public.users(auth_id);
  END IF;
END $$;

-- users 的其他过滤列（部门列表 / 角色筛选 / 学号已由 UNIQUE 覆盖）
CREATE INDEX IF NOT EXISTS idx_users_department_role ON public.users(department, role);

-- ---- 2. 外键列索引补齐 ----
-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to       ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by        ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_template_id       ON public.tasks(template_id);
CREATE INDEX IF NOT EXISTS idx_tasks_linked_notice_id  ON public.tasks(linked_notice_id);
-- task_submissions / task_milestones / task_templates
CREATE INDEX IF NOT EXISTS idx_task_submissions_task    ON public.task_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_user    ON public.task_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_milestones_task     ON public.task_milestones(task_id);
CREATE INDEX IF NOT EXISTS idx_task_milestones_done_by  ON public.task_milestones(completed_by);
CREATE INDEX IF NOT EXISTS idx_task_templates_created   ON public.task_templates(created_by);
-- notices / school_notices / forum
CREATE INDEX IF NOT EXISTS idx_notices_created_by       ON public.notices(created_by);
CREATE INDEX IF NOT EXISTS idx_school_notices_created   ON public.school_notices(created_by);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created_by   ON public.forum_posts(created_by);
CREATE INDEX IF NOT EXISTS idx_forum_replies_post       ON public.forum_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_created    ON public.forum_replies(created_by);
-- tickets
CREATE INDEX IF NOT EXISTS idx_tickets_created_by       ON public.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_ticket_records_ticket    ON public.ticket_records(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_records_user      ON public.ticket_records(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_records_student   ON public.ticket_records(student_id);
-- invite_codes（created_by 的 idx_invite_created_by 已在第十五部分建好）
CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by     ON public.invite_codes(used_by);
CREATE INDEX IF NOT EXISTS idx_invite_codes_dept        ON public.invite_codes(department);
-- 其余
CREATE INDEX IF NOT EXISTS idx_notice_reads_user        ON public.notice_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_dept_guides_updated_by   ON public.department_guides(updated_by);
CREATE INDEX IF NOT EXISTS idx_platform_guides_module   ON public.platform_guides(module_key, sort_order);

-- ---- 3. 复合索引：贴合真实 WHERE + ORDER BY ----
-- 通知：分栏（type）+ 时间倒序翻页。已有 idx_notifications_user_id 的第二列是 is_read，
-- 对「不筛已读状态、只按时间翻页」的查询用不上，故单独建一条。
CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON public.notifications(user_id, created_at DESC);
-- 通知：未读是高频子集（侧边栏角标 / 未读计数 / 只看未读），部分索引体积远小于全表
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON public.notifications(user_id, created_at DESC) WHERE is_read = false;
-- 任务：部门 + 状态 + 创建时间（列表页默认视图、看板分列）
CREATE INDEX IF NOT EXISTS idx_tasks_dept_status_time  ON public.tasks(assigned_department, status, created_at DESC);
-- 任务：状态 + 截止时间（首页待办、逾期统计）
CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline   ON public.tasks(status, deadline);
-- 任务：周报/月报按 updated_at 圈时间窗
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at        ON public.tasks(updated_at DESC);
-- 公告 / 校级通知 / 论坛：部门（或置顶）+ 时间倒序
CREATE INDEX IF NOT EXISTS idx_notices_dept_time        ON public.notices(department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_notices_pin_time  ON public.school_notices(is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_dept_time    ON public.forum_posts(department, created_at DESC);
-- 票务：开抢时间倒序（列表默认排序）
CREATE INDEX IF NOT EXISTS idx_tickets_open_time        ON public.tickets(open_time DESC);
-- 埋点：模块维度统计（数据看板页面访问排名）
CREATE INDEX IF NOT EXISTS idx_usage_events_module_time ON public.usage_events(module, event_type, created_at DESC);

-- ---- 4. updated_at 由数据库统一维护 ----
-- 背景：此前 updated_at 由前端各处手写 `new Date().toISOString()`，绕过前端直接改数据时不会更新，
--       周报「本周完成数」按 updated_at 圈时间窗，一旦漏写就会统计失真。
-- 触发器只在 UPDATE 时覆盖该列，前端继续传值也不会冲突（以库时间为准，跨时区更准）。
CREATE OR REPLACE FUNCTION public.touch_updated_at()
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
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users ADD CONSTRAINT chk_users_role
      CHECK (role IN ('volunteer','dept_head','presidium','president','teacher','developer','removed'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_task_milestones_status' AND conrelid = 'public.task_milestones'::regclass) THEN
    ALTER TABLE public.task_milestones ADD CONSTRAINT chk_task_milestones_status
      CHECK (status IN ('pending','completed'))
      NOT VALID;
  END IF;
END $$;

-- ---- 6. 刷新统计信息（新索引立即被规划器纳入成本估算）----
ANALYZE public.users;
ANALYZE public.tasks;
ANALYZE public.task_submissions;
ANALYZE public.task_milestones;
ANALYZE public.notices;
ANALYZE public.forum_posts;
ANALYZE public.forum_replies;
ANALYZE public.tickets;
ANALYZE public.ticket_records;
ANALYZE public.notifications;

-- ---- 核对（执行后跑一次，应看到全部 true / 索引清单）----
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;
-- SELECT conname, convalidated FROM pg_constraint WHERE conname IN ('chk_users_role','chk_task_milestones_status');
--   ↑ convalidated = false 是预期结果（NOT VALID）；存量数据清理干净后可执行
--     ALTER TABLE public.users VALIDATE CONSTRAINT chk_users_role; 升级为完全校验。
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_%_touch';

-- ---- 万一还是报 42P01 relation "..." does not exist，先跑这三行确认真相 ----
-- 判断分支：
--   ① 下面第 2/3 行查到了 users 且 schema 不是 public → 把本文件里所有 public. 换成那个 schema 名再执行；
--   ② 第 2/3 行什么都没查到 → 说明连错项目了（在另一个 Supabase 项目的 SQL Editor 里跑），换成正确项目；
--   ③ 第 1 行的 search_path 里没有 public 但表在 public → 本文件开头的 SET search_path 已覆盖，重跑即可。
-- SELECT current_database(), current_user, current_schema(), current_setting('search_path');
-- SELECT table_schema, table_name FROM information_schema.tables
--   WHERE table_name IN ('users','tasks','notifications') ORDER BY 1, 2;
-- SELECT n.nspname AS actual_schema FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'users';

-- ============================================================
-- 第十八部分：Phase 2 数据层（2026-09-11，v4.4.0）
-- ============================================================
-- 一次性执行请用配套文件 supabase-phase2-v4.4.0.sql（内容与本部分完全一致）。
-- 与第十七部分（性能优化）相互独立，**全部幂等可重跑**；本部分会真正新增表 / 列 / 函数，
-- 必须在部署 v4.4.0 前端**之前**执行，否则新功能会报「找不到列 / 找不到函数」。
--
-- 交付三件事：
--   1) A3 考核积分：新表 public.points_ledger + 学期函数 + 计分触发器
--      （审核通过 +2 / 按时提交 +1 / 逾期提交 -1 / 活动签到 +1）。
--      计分**全部由数据库触发器写入**，前端对流水表只有读权限 → 不可伪造、天然幂等；
--   2) A1 票务闭环：ticket_records 加 checked_in_at / checked_by；二维码令牌的签发与校验函数；
--      签到走单个 RPC（服务端完成 令牌校验 → 权限 → 时间窗 → 防重复 → 计分 五步），
--      前端**不需要**票券表的写权限；
--   3) A4 批量邀请码：invite_codes 加 batch_id，支持「按批导出 / 按批作废」。
--
-- ⚠️ 与计划文档的两处实现偏差（有意为之，理由如下）：
--   ① 计划写「逾期 -1」。逾期是随时间自然发生的状态，靠定时任务扫全表扣分既需要 pg_cron，
--      又会制造「人不在也被扣分」的争议。本实现改为「**逾期提交** -1」：在审核通过那一刻，
--      拿提交时间与 deadline 比较来判定——一次判定、可追溯、不引入定时任务。
--   ② 计划写二维码用「短时效签名」。本实现是**库内随机密钥 + 15 分钟有效期**的 MAC 令牌：
--      密钥由数据库随机生成、存 app_secrets（对 anon/authenticated 完全封锁），
--      **不进仓库、不出现在任何提交里**；签名用内置 md5 做 keyed hash，不引入 pgcrypto 依赖。
--      真正的边界仍在服务端（check_in_ticket 的时间窗 + 幂等），令牌只负责防「截图长期转发」。
--
-- ⚠️ 附带的两处**防伪加固**（不加固则积分毫无意义——任何志愿者都能给自己加分）：
--   ① task_submissions.status 改成 approved / rejected 必须是部门负责人及以上；
--   ② ticket_records.checked_in_at / checked_by 只能由部门负责人及以上写入。
--   两处都放行 service_role（未来的备份 / 运维脚本需要），也允许在 SQL Editor 里
--   临时 `ALTER TABLE ... DISABLE TRIGGER trg_xxx_guard` 后手工修数据。
--
-- 表名一律带 public. 前缀（同第十七部分的教训），脚本开头 SET search_path 兜底；
-- 本部分结尾带一条**只读验收查询**，执行完直接能看到「建了什么、成没成」，不必再猜。

SET search_path = public;

-- ---- 0. 前置：票券签到的两个新列（**必须最先执行**）----
-- ⚠️ 顺序踩过坑（2026-09-11 用户执行报 `42703 column "checked_in_at" of relation
--    "ticket_records" does not exist`）：CREATE TRIGGER ... AFTER UPDATE OF <列> 会在
--    **创建触发器那一刻**校验该列是否存在，而最初把「加列」排在建触发器之后，
--    于是整份脚本在 5.2 处中断。CREATE INDEX 引用新列同理。
--    铁律：**先加列，再挂约束 / 触发器 / 索引**——这条顺序不能动。
ALTER TABLE public.ticket_records ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE public.ticket_records ADD COLUMN IF NOT EXISTS checked_by    uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ticket_records.checked_in_at IS '签到时间；NULL = 未签到。由 check_in_ticket RPC 写入。';
COMMENT ON COLUMN public.ticket_records.checked_by    IS '签到操作人（组织者）的 users.id；票券持有人自己扫码时即其本人。';

-- ---- 1. 角色判定辅助函数（Phase 4 的细粒度 RLS 会直接复用这三个） ----
-- 层级与前端 src/utils/constants.ts 的 ROLE_LEVEL 保持一致，改一处要两处同步。
CREATE OR REPLACE FUNCTION public.role_level(p_role text)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'volunteer' THEN 0
    WHEN 'dept_head' THEN 1
    WHEN 'presidium' THEN 2
    WHEN 'president' THEN 3
    WHEN 'teacher'   THEN 3
    WHEN 'developer' THEN 3
    ELSE -1              -- removed / NULL / 未知角色：一律视为无权限
  END
$$;

-- 当前登录者在本库 users 里的 id（注意：auth.uid() 是 auth.users 的 id，不是本表的 id）
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.role FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1
$$;

-- 「组织者」= 部门负责人及以上（志愿者不算）
CREATE OR REPLACE FUNCTION public.is_organizer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.role_level(public.current_app_role()) >= 1
$$;

GRANT EXECUTE ON FUNCTION public.role_level(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_user_id()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_role()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_organizer()            TO authenticated;

-- ---- 2. 学期工具 ----
-- 学期键形如 2026-2027-1：9 月 ~ 次年 1 月为第 1 学期，2 月 ~ 8 月为第 2 学期。
-- 由数据库计算而非前端传参，避免各调用点跨年后口径不一。
CREATE OR REPLACE FUNCTION public.semester_of(p_ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.m >= 9 THEN s.y::text || '-' || (s.y + 1)::text || '-1'
    WHEN s.m  = 1 THEN (s.y - 1)::text || '-' || s.y::text || '-1'
    ELSE               (s.y - 1)::text || '-' || s.y::text || '-2'
  END
  FROM (
    SELECT EXTRACT(year FROM p_ts)::int AS y, EXTRACT(month FROM p_ts)::int AS m
  ) s
$$;

-- ---- 3. 考核积分流水表 ----
-- 只增不改：没有 UPDATE / DELETE 通路，纠错靠再记一笔冲销（保持可审计）。
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta      integer NOT NULL,
  reason     text NOT NULL,
  ref_type   text,
  ref_id     uuid,
  semester   text NOT NULL DEFAULT public.semester_of(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.points_ledger IS
  '考核积分流水（只增不改）。写入只允许经 SECURITY DEFINER 函数（award_points 与计分触发器），authenticated 仅 SELECT。';

COMMENT ON COLUMN public.points_ledger.ref_type IS
  '事件来源类型：submission（任务提交）/ ticket_record（票券签到）；NULL 表示手工调整。';
COMMENT ON COLUMN public.points_ledger.reason IS
  '计分原因：task_approved +2 / submission_on_time +1 / submission_late -1 / ticket_checkin +1。';

-- 个人明细与排行榜：按人取本学期倒序
CREATE INDEX IF NOT EXISTS idx_points_ledger_user_time ON public.points_ledger(user_id, created_at DESC);
-- 学期维度聚合（排行榜、期末导出）
CREATE INDEX IF NOT EXISTS idx_points_ledger_semester  ON public.points_ledger(semester, user_id);
-- 幂等基石：同一事件只计一次分（审核按钮重复点、同一张票重复签到都不会重复加分）
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_event
  ON public.points_ledger(ref_type, ref_id, reason)
  WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL;

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS points_ledger_read_all ON public.points_ledger;
CREATE POLICY points_ledger_read_all ON public.points_ledger
  FOR SELECT TO authenticated USING (true);
-- 有意**不建** INSERT / UPDATE / DELETE 策略：RLS 默认拒绝，写入口只有下面的函数。
-- （这是本项目唯一不套用 authenticated_full_access 的业务表，理由：流水账一旦可写就失去意义。）
REVOKE INSERT, UPDATE, DELETE ON public.points_ledger FROM anon, authenticated;

-- ---- 4. 计分唯一入口 ----
CREATE OR REPLACE FUNCTION public.award_points(
  p_user     uuid,
  p_delta    integer,
  p_reason   text,
  p_ref_type text DEFAULT NULL,
  p_ref_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR p_reason IS NULL OR p_delta = 0 THEN
    RETURN false;
  END IF;
  -- 单次分值上限 ±10：即使哪天调用点写错，也不会出现离谱数字
  IF abs(p_delta) > 10 THEN
    RAISE EXCEPTION 'award_points: 单次 delta % 超出 ±10 上限', p_delta;
  END IF;

  INSERT INTO public.points_ledger (user_id, delta, reason, ref_type, ref_id, semester)
  VALUES (p_user, p_delta, p_reason, p_ref_type, p_ref_id, public.semester_of())
  ON CONFLICT DO NOTHING;   -- 命中 uq_points_event：该事件已计过分，静默跳过

  RETURN FOUND;             -- 冲突时为 false，调用方可借此判断「本次是否真的加分」
END $$;

-- 关键：新函数默认对 PUBLIC 开放 EXECUTE，不收回的话任何登录用户都能给自己加分。
REVOKE ALL ON FUNCTION public.award_points(uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ---- 5. 计分触发器 ----
-- 5.1 任务提交被审核通过：+2，并按「提交时间 vs 截止时间」再判 按时 +1 / 逾期 -1
CREATE OR REPLACE FUNCTION public.trg_award_submission_review()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline  timestamptz;
  v_assignee  uuid;
  v_submitter uuid;
  v_submitted timestamptz;
BEGIN
  -- 只在「首次变为 approved」那一刻计分：重复点通过、驳回后再通过，都不会重复计
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;
  -- 注意用嵌套 IF 而非 `TG_OP='UPDATE' AND OLD.status=…`：INSERT 触发器中 OLD 未赋值，
  -- 一旦布尔表达式里出现 OLD 字段就有「record old is not assigned yet」的风险。
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'approved' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT t.deadline, t.assigned_to INTO v_deadline, v_assignee
  FROM public.tasks t WHERE t.id = NEW.task_id;

  -- 得分人 = 提交记录上的 user_id，缺省回退到任务执行人
  v_submitter := COALESCE(NEW.user_id, v_assignee);
  IF v_submitter IS NULL THEN
    RETURN NEW;
  END IF;

  v_submitted := COALESCE(NEW.submitted_at, NEW.created_at, now());

  PERFORM public.award_points(v_submitter, 2, 'task_approved', 'submission', NEW.id);

  IF v_deadline IS NOT NULL AND v_submitted > v_deadline THEN
    PERFORM public.award_points(v_submitter, -1, 'submission_late', 'submission', NEW.id);
  ELSE
    PERFORM public.award_points(v_submitter, 1, 'submission_on_time', 'submission', NEW.id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_submissions_award ON public.task_submissions;
CREATE TRIGGER trg_task_submissions_award
  AFTER INSERT OR UPDATE OF status ON public.task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_submission_review();

-- 5.2 活动签到：+1（UPDATE 票券行的 checked_in_at 时自动触发）
CREATE OR REPLACE FUNCTION public.trg_award_ticket_checkin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.checked_in_at IS NOT NULL AND OLD.checked_in_at IS NULL AND NEW.user_id IS NOT NULL THEN
    PERFORM public.award_points(NEW.user_id, 1, 'ticket_checkin', 'ticket_record', NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ticket_records_award ON public.ticket_records;
CREATE TRIGGER trg_ticket_records_award
  AFTER UPDATE OF checked_in_at ON public.ticket_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_ticket_checkin();

REVOKE ALL ON FUNCTION public.trg_award_submission_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_award_ticket_checkin()    FROM PUBLIC, anon, authenticated;

-- ---- 6. 防伪加固：让上面的积分真正「不可自刷」----
-- 6.1 审核权：状态改成 approved / rejected 必须是组织者（与前端 TaskDetail 的
--     `hasMinRole(user.role,'dept_head')` 判定一致）。
CREATE OR REPLACE FUNCTION public.trg_guard_submission_review()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 只关心「进入终态」的那一次写入；嵌套 IF 是为了不在 INSERT 里碰 OLD
  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;      -- 状态没变（例如只改了 review_note）：不拦
    END IF;
  END IF;

  IF NOT (public.is_organizer() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION '只有部门负责人及以上可以审核任务提交';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_submissions_guard ON public.task_submissions;
CREATE TRIGGER trg_task_submissions_guard
  BEFORE INSERT OR UPDATE OF status ON public.task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_submission_review();

-- 6.2 签到权：checked_in_at / checked_by 两个列只能由组织者写。
--     RLS 策略按行不按列，光靠策略挡不住「我自己那行我自己改」，故用触发器兜住这两列。
CREATE OR REPLACE FUNCTION public.trg_guard_ticket_checkin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_touched boolean := false;
BEGIN
  -- 嵌套 IF：INSERT 触发器中不读 OLD
  IF TG_OP = 'INSERT' THEN
    IF NEW.checked_in_at IS NOT NULL OR NEW.checked_by IS NOT NULL THEN
      v_touched := true;
    END IF;
  ELSE
    IF NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at
       OR NEW.checked_by IS DISTINCT FROM OLD.checked_by THEN
      v_touched := true;
    END IF;
  END IF;

  IF v_touched AND NOT (public.is_organizer() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION '只有部门负责人及以上可以签到';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ticket_records_guard ON public.ticket_records;
CREATE TRIGGER trg_ticket_records_guard
  BEFORE INSERT OR UPDATE ON public.ticket_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_ticket_checkin();

REVOKE ALL ON FUNCTION public.trg_guard_submission_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_guard_ticket_checkin()    FROM PUBLIC, anon, authenticated;

-- ---- 7. 票务签到索引（列已在本部分开头加好）----
-- 主办方名单视图：按活动统计已签到人数
CREATE INDEX IF NOT EXISTS idx_ticket_records_ticket_checked
  ON public.ticket_records(ticket_id, checked_in_at DESC);

-- ---- 8. 二维码令牌：库内随机密钥 + MAC 签名 ----
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_secrets IS
  '服务端私有密钥，不随仓库分发。RLS 开启且不建任何策略 = anon / authenticated 一律拒绝，只有 SECURITY DEFINER 函数（属主）能读。';

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;

-- 首次执行时在库内随机生成（仓库与提交记录里都不存在这个值）。
-- 用 random() + 时钟拼两个 md5 得到 64 位十六进制：random() 非密码学安全，
-- 但此密钥的用途是防「二维码截图长期转发」，不是密码学边界；真边界在服务端时间窗与幂等。
INSERT INTO public.app_secrets (key, value)
VALUES ('ticket_qr', md5(random()::text || clock_timestamp()::text)
                 || md5(clock_timestamp()::text || random()::text))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ticket_qr_secret()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.app_secrets WHERE key = 'ticket_qr'
$$;

-- 签发：令牌 = SUP1.<record_id>.<过期秒>.<MAC>
CREATE OR REPLACE FUNCTION public.ticket_qr_token(p_record uuid, p_ttl_minutes integer DEFAULT 15)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_owner  uuid;
  v_exp    bigint;
BEGIN
  v_secret := public.ticket_qr_secret();
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'app_secrets.ticket_qr 缺失，请重跑 supabase-phase2-v4.4.0.sql';
  END IF;

  SELECT r.user_id INTO v_owner FROM public.ticket_records r WHERE r.id = p_record;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION '票券记录不存在';
  END IF;

  -- 非组织者只能为自己的票签发二维码（否则可代人出票）
  IF NOT public.is_organizer() AND v_owner IS DISTINCT FROM public.current_app_user_id() THEN
    RAISE EXCEPTION '无权为该票券生成签到码';
  END IF;

  v_exp := EXTRACT(EPOCH FROM now())::bigint + GREATEST(1, LEAST(p_ttl_minutes, 120)) * 60;
  RETURN 'SUP1.' || p_record::text || '.' || v_exp::text || '.'
       || md5(p_record::text || '.' || v_exp::text || '.' || v_secret);
END $$;

-- 校验：合法且未过期返回 record_id，否则返回 NULL（一律不抛错，由调用方决定文案）
CREATE OR REPLACE FUNCTION public.verify_ticket_qr_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_parts  text[];
  v_rec    uuid;
  v_exp    bigint;
BEGIN
  IF p_token IS NULL OR length(p_token) > 200 THEN
    RETURN NULL;
  END IF;

  v_secret := public.ticket_qr_secret();
  IF v_secret IS NULL THEN
    RETURN NULL;
  END IF;

  v_parts := string_to_array(trim(p_token), '.');
  IF COALESCE(array_length(v_parts, 1), 0) <> 4 OR v_parts[1] <> 'SUP1' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_rec := v_parts[2]::uuid;
    v_exp := v_parts[3]::bigint;
  EXCEPTION WHEN others THEN
    RETURN NULL;          -- 格式不对：当无效令牌处理，不向用户抛数据库错误
  END;

  IF v_exp < EXTRACT(EPOCH FROM now())::bigint THEN
    RETURN NULL;          -- 已过期
  END IF;

  IF md5(v_parts[2] || '.' || v_parts[3] || '.' || v_secret) <> v_parts[4] THEN
    RETURN NULL;          -- MAC 不匹配：伪造或改过内容
  END IF;

  RETURN v_rec;
END $$;

GRANT  EXECUTE ON FUNCTION public.ticket_qr_token(uuid, integer) TO authenticated;
REVOKE ALL     ON FUNCTION public.ticket_qr_secret()             FROM PUBLIC, anon, authenticated;
REVOKE ALL     ON FUNCTION public.verify_ticket_qr_token(text)   FROM PUBLIC, anon, authenticated;

-- ---- 9. 签到 RPC：五步全在服务端完成 ----
-- 返回 { ok, code, message, ... }，code 取值：forbidden / invalid_token / not_found /
-- already_checked_in / ticket_missing / out_of_window / checked_in
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record    uuid;
  v_operator  uuid;
  v_rec       public.ticket_records;
  v_event     timestamptz;
  v_title     text;
BEGIN
  IF NOT public.is_organizer() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', '只有部门负责人及以上可以扫码签到');
  END IF;

  v_operator := public.current_app_user_id();

  -- ① 令牌校验
  v_record := public.verify_ticket_qr_token(p_token);
  IF v_record IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token',
      'message', '签到码无效或已过期——请让持票人下拉刷新二维码后重扫');
  END IF;

  SELECT * INTO v_rec FROM public.ticket_records WHERE id = v_record;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found',
      'message', '票券记录不存在（可能已退票）');
  END IF;

  -- ② 防重复（幂等）：已签到直接回成功语义，不再加分
  IF v_rec.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_checked_in',
      'message', v_rec.name || ' 已于 ' || to_char(v_rec.checked_in_at, 'MM-DD HH24:MI') || ' 签到过',
      'name', v_rec.name, 'student_id', v_rec.student_id,
      'checked_in_at', v_rec.checked_in_at);
  END IF;

  SELECT t.event_time, t.title INTO v_event, v_title
  FROM public.tickets t WHERE t.id = v_rec.ticket_id;
  IF v_event IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ticket_missing',
      'message', '该票券对应的活动已不存在');
  END IF;

  -- ③ 时间窗：活动开始前 2 小时 ~ 开始后 6 小时（要改窗口只改这一处）
  IF now() < v_event - interval '2 hours' OR now() > v_event + interval '6 hours' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'out_of_window',
      'message', '不在签到时间窗内（活动 ' || to_char(v_event, 'MM-DD HH24:MI') || ' 前 2 小时至后 6 小时）',
      'event_time', v_event);
  END IF;

  -- ④ 落库（带 checked_in_at IS NULL 条件：两台设备并发扫码时只有一台能成功）
  UPDATE public.ticket_records
  SET checked_in_at = now(), checked_by = v_operator
  WHERE id = v_rec.id AND checked_in_at IS NULL;

  IF NOT FOUND THEN
    -- 并发下另一台刚签过：按幂等成功返回，不报错
    SELECT * INTO v_rec FROM public.ticket_records WHERE id = v_record;
    RETURN jsonb_build_object('ok', true, 'code', 'already_checked_in',
      'message', v_rec.name || ' 刚刚已签到',
      'name', v_rec.name, 'student_id', v_rec.student_id,
      'checked_in_at', v_rec.checked_in_at);
  END IF;

  -- ⑤ 加分由 trg_ticket_records_award 触发器完成，此处只组织返回值
  RETURN jsonb_build_object('ok', true, 'code', 'checked_in',
    'message', v_rec.name || ' 签到成功（积分 +1）',
    'name', v_rec.name, 'student_id', v_rec.student_id,
    'ticket', v_title, 'checked_in_at', now());
END $$;

GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO authenticated;

-- ---- 10. A4 批量邀请码：加批次号 ----
-- 一次「批量生成」写入同一个 batch_id，便于整批导出、整批作废（配合已有 revoked_at）。
ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS idx_invite_codes_batch
  ON public.invite_codes(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invite_codes_expires
  ON public.invite_codes(expires_at) WHERE expires_at IS NOT NULL;

-- ---- 11. 刷新统计信息 ----
ANALYZE public.points_ledger;
ANALYZE public.ticket_records;
ANALYZE public.invite_codes;

-- ---- 12. 验收：执行完直接看这张表（「结果」列全为 [OK] 即通过）----
-- 这条查询是**只读**的，故意留在脚本里当「反馈」——DDL 成功时 SQL Editor 只显示
-- 「Success. No rows returned」，不给这张表就又要靠猜。
WITH expected AS (
  SELECT * FROM (VALUES
    ('表',     'points_ledger'),
    ('表',     'app_secrets'),
    ('列',     'ticket_records.checked_in_at'),
    ('列',     'ticket_records.checked_by'),
    ('列',     'invite_codes.batch_id'),
    ('函数',   'semester_of'),
    ('函数',   'role_level'),
    ('函数',   'is_organizer'),
    ('函数',   'award_points'),
    ('函数',   'ticket_qr_token'),
    ('函数',   'verify_ticket_qr_token'),
    ('函数',   'check_in_ticket'),
    ('触发器', 'trg_task_submissions_award'),
    ('触发器', 'trg_task_submissions_guard'),
    ('触发器', 'trg_ticket_records_award'),
    ('触发器', 'trg_ticket_records_guard'),
    ('索引',   'idx_points_ledger_user_time'),
    ('索引',   'idx_points_ledger_semester'),
    ('索引',   'uq_points_event'),
    ('索引',   'idx_ticket_records_ticket_checked'),
    ('索引',   'idx_invite_codes_batch')
  ) AS e(kind, name)
)
SELECT t."类型", t."对象", CASE WHEN t."存在" THEN '[OK]' ELSE '[缺失]' END AS "结果"
FROM (
  SELECT e.kind AS "类型", e.name AS "对象",
    CASE e.kind
      WHEN '表' THEN EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = e.name AND c.relkind = 'r')
      WHEN '列' THEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = split_part(e.name, '.', 1)
          AND column_name  = split_part(e.name, '.', 2))
      WHEN '函数' THEN EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = e.name)
      WHEN '触发器' THEN EXISTS (
        SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT g.tgisinternal AND n.nspname = 'public' AND g.tgname = e.name)
      ELSE EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = e.name)
    END AS "存在"
  FROM expected e
  UNION ALL
  SELECT '数据', 'app_secrets.ticket_qr 密钥已生成',
    EXISTS (SELECT 1 FROM public.app_secrets WHERE key = 'ticket_qr')
) t
ORDER BY t."类型", t."对象";

-- ============================================================
-- 第十九部分：Phase 3 数据层（2026-09-12，v4.5.0）
-- ============================================================
-- 一次性执行请用配套文件 supabase-phase3-v4.5.0.sql（内容与本部分完全一致）。
-- 与第十七、十八部分相互独立，**全部幂等可重跑**；必须在部署 v4.5.0 前端**之前**执行，
-- 否则新功能会报「找不到列 / 找不到表」。
--
-- 交付三件事：
--   1) A5 论坛互动：新表 forum_likes / forum_bookmarks；forum_posts 加 pinned_at（置顶）；
--      帖子列表的「回复数 / 点赞数」改由**触发器维护的计数列**提供 —— 这是本次的数据库优化重点：
--      原实现每页发 1 + N 条查询（列表 1 条 + 逐个帖子 1 条回复计数），帖子越多越慢，
--      且正是 CLAUDE.md 明令禁止的 N+1 反模式；改成计数列后列表退化为**单条查询**。
--   2) B2 新人引导：users 加 onboarded，首次登录弹三步引导，完成或跳过后不再出现。
--   3) B3 个人资料编辑：users 加 contact_phone / contact_email；头像复用现有 attachments
--      公开 bucket 与「登录用户可上传、仅上传者本人可删」的既有策略 —— 不新建 bucket、不新增策略。
--
-- ⚠️ 两处**刻意的权限收紧**（不收紧则可被伪造）：
--   ① forum_likes / forum_bookmarks 是全库**第一批按行 RLS** 的业务表（Phase 4 的 C2 在此先落地）：
--      SELECT 放行全体登录用户（计数要给人看），INSERT / DELETE 一律要求
--      `user_id = public.current_app_user_id()`，即「只能用自己的名义点赞 / 收藏」；
--      复用第十八部分已有的 SECURITY DEFINER 函数，不引入新概念。
--      有意**不建** UPDATE 策略：点赞行没有任何可改字段，改 = 删掉重加。
--   ② forum_posts.pinned_at 加防伪守卫：只有部门负责人及以上能置顶（放行 service_role）。
--      计数列 reply_count / like_count **有意不加守卫**，理由见第 3 节末尾的注释。
--
-- ⚠️ mention 通知（@提及）在本部分**不需要任何 DDL**：notifications.type 在第十七部分
--    特意没加 CHECK 约束，就是为了让 v4.5.0 能直接写入 'mention'（当时把原因写在了注释里）。
--    这里只补一条列注释说明完整取值。
--
-- 表名一律带 public. 前缀（同第十七、十八部分的教训），脚本开头 SET search_path 兜底；
-- 末尾带一条**只读验收查询**，执行完直接能看到「建了什么、成没成」。

SET search_path = public;

-- ---- 0. 前置：六个新列，**必须最先执行** ----
-- ⚠️ 第十八部分的教训（42703 column "checked_in_at" ... does not exist）：
--    CREATE TRIGGER ... AFTER UPDATE OF <列>、CREATE INDEX 引用新列，都会在**创建那一刻**
--    校验列是否存在。铁律：**先加列，再挂索引 / 触发器 / 策略** —— 这条顺序不能动。
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS pinned_at   timestamptz;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS like_count  integer NOT NULL DEFAULT 0;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarded     boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS contact_email text;

COMMENT ON COLUMN public.forum_posts.pinned_at   IS '置顶时间；NULL = 未置顶。列表按 pinned_at DESC NULLS LAST, created_at DESC 排序。';
COMMENT ON COLUMN public.forum_posts.reply_count IS '回复数缓存列，由 trg_forum_replies_count 维护；客户端不要写入（写了也会被下次增删回复覆盖）。';
COMMENT ON COLUMN public.forum_posts.like_count  IS '点赞数缓存列，由 trg_forum_likes_count 维护；客户端不要写入。';
COMMENT ON COLUMN public.users.onboarded         IS '是否已看过新人引导（完成或跳过都置 true）。默认 false，故新注册用户会看到引导。';
COMMENT ON COLUMN public.users.contact_phone     IS '联系方式（手机 / 微信），本人在个人中心自行填写；NULL = 未填写。';
COMMENT ON COLUMN public.users.contact_email     IS '联系邮箱，本人在个人中心自行填写；NULL = 未填写。';

-- 存量用户一次性标记为「已引导」：引导只该对**新注册**的人出现，否则全体老用户一登录就被打扰。
-- 用固定时间字面量而非 now()，是为了**可重跑**：不论重跑多少次判定口径都一样，
-- 不会把上线之后新注册的用户误标成已引导（这正是用 now() 会出的错）。
UPDATE public.users SET onboarded = true
WHERE onboarded = false
  AND created_at < '2026-09-12 00:00:00+08'::timestamptz;

-- ---- 1. A5 两张互动表 ----
-- 复合主键 (post_id, user_id) 让「一人一帖一行」成为**结构约束**，
-- 于是重复点赞在数据库层就写不进去（前端双击、重试都不会造出重复行）。
-- 没有 id 列是有意的 —— 这两张表没有独立于「谁对哪个帖子」之外的实体身份。
CREATE TABLE IF NOT EXISTS public.forum_likes (
  post_id    uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.forum_bookmarks (
  post_id    uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

COMMENT ON TABLE public.forum_likes     IS '帖子点赞（一人一帖一行，复合主键保证幂等）。';
COMMENT ON TABLE public.forum_bookmarks IS '帖子收藏（一人一帖一行，复合主键保证幂等）；「我的收藏」按 user_id 查。';

ALTER TABLE public.forum_likes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_bookmarks ENABLE ROW LEVEL SECURITY;

-- 先删后建：CREATE POLICY 没有 IF NOT EXISTS，DROP 保证可重跑
DROP POLICY IF EXISTS forum_likes_read_all   ON public.forum_likes;
DROP POLICY IF EXISTS forum_likes_insert_own ON public.forum_likes;
DROP POLICY IF EXISTS forum_likes_delete_own ON public.forum_likes;
CREATE POLICY forum_likes_read_all   ON public.forum_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_likes_insert_own ON public.forum_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_app_user_id());
CREATE POLICY forum_likes_delete_own ON public.forum_likes FOR DELETE TO authenticated
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS forum_bookmarks_read_all   ON public.forum_bookmarks;
DROP POLICY IF EXISTS forum_bookmarks_insert_own ON public.forum_bookmarks;
DROP POLICY IF EXISTS forum_bookmarks_delete_own ON public.forum_bookmarks;
CREATE POLICY forum_bookmarks_read_all   ON public.forum_bookmarks FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_bookmarks_insert_own ON public.forum_bookmarks FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_app_user_id());
CREATE POLICY forum_bookmarks_delete_own ON public.forum_bookmarks FOR DELETE TO authenticated
  USING (user_id = public.current_app_user_id());

GRANT  SELECT, INSERT, DELETE ON public.forum_likes     TO authenticated;
GRANT  SELECT, INSERT, DELETE ON public.forum_bookmarks TO authenticated;
REVOKE UPDATE                  ON public.forum_likes, public.forum_bookmarks FROM anon, authenticated;
REVOKE ALL                     ON public.forum_likes, public.forum_bookmarks FROM anon;

-- 复合主键已覆盖「按 post_id 查」，这里补的是另一半：
-- ① 按用户查自己的点赞 / 收藏（「我的收藏」列表）；
-- ② 外键 ON DELETE CASCADE 的级联（PG 不会为外键列自动建索引，缺索引会退化为全表扫描）。
CREATE INDEX IF NOT EXISTS idx_forum_likes_user     ON public.forum_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_user ON public.forum_bookmarks(user_id, created_at DESC);

-- ---- 2. 计数回填 ----
-- 幂等：不论当前值是多少，一律覆盖为真实计数（重跑安全）。两条语句都必须在第 1 节之后，
-- 因为第二条读的就是刚建好的 forum_likes。
UPDATE public.forum_posts p
SET reply_count = (SELECT count(*) FROM public.forum_replies r WHERE r.post_id = p.id);
UPDATE public.forum_posts p
SET like_count  = (SELECT count(*) FROM public.forum_likes   l WHERE l.post_id = p.id);

-- ---- 3. 计数触发器（「消灭 N+1」的落点）----
-- 回复数与点赞数的唯一真相来源就在这里：增删一行，帖子上的计数列跟着动。
-- 于是列表页只需 `select('*, author:created_by(name)')` **一条查询**，
-- 不必再对每个帖子各发一条 count —— 旧实现的那个 1+N 正是被这条触发器取代的。
CREATE OR REPLACE FUNCTION public.trg_forum_replies_count()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- GREATEST(...,0)：万一有人手工清过数据，也不会出现负数计数
    UPDATE public.forum_posts SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_forum_likes_count()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_forum_replies_count ON public.forum_replies;
CREATE TRIGGER trg_forum_replies_count
  AFTER INSERT OR DELETE ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.trg_forum_replies_count();

DROP TRIGGER IF EXISTS trg_forum_likes_count ON public.forum_likes;
CREATE TRIGGER trg_forum_likes_count
  AFTER INSERT OR DELETE ON public.forum_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_forum_likes_count();

-- 3.3 为什么计数列不加防伪守卫（与第十八部分的积分触发器待遇不同，是有意的）
--   积分是**可兑换的权益**，被改就是真损失，所以写权限必须收口到函数；
--   计数列只是列表上的一个显示数字：改动它既拿不到任何权限，也不影响任何业务判断
--   （前端看到的计数刷新后就被真实值覆盖）。为此加「守卫触发器 + 事务内 GUC 绕行」的复杂度
--   换不来实际安全收益，因此**有意不加**。若哪天计数被用于考核或评选，这条注释必须同步改写。

-- ---- 4. 置顶防伪守卫 ----
-- 置顶是**面向全体的可见性加权**（谁的帖子被顶到最前），属于权限语义，必须守住。
CREATE OR REPLACE FUNCTION public.trg_guard_forum_pin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pinned_at IS DISTINCT FROM OLD.pinned_at THEN
    IF NOT (public.is_organizer() OR auth.role() = 'service_role') THEN
      RAISE EXCEPTION '只有部门负责人及以上可以置顶帖子';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_forum_posts_pin_guard ON public.forum_posts;
CREATE TRIGGER trg_forum_posts_pin_guard
  BEFORE UPDATE OF pinned_at ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_forum_pin();

-- ---- 5. 列表排序索引与通知列注释 ----
-- 列表固定按「置顶时间 DESC NULLS LAST, 创建时间 DESC」取数，索引按同样的顺序建才算数得上。
CREATE INDEX IF NOT EXISTS idx_forum_posts_pinned
  ON public.forum_posts(pinned_at DESC NULLS LAST, created_at DESC);

-- 第十七部分已把「不给 notifications.type 加 CHECK」的理由写清楚了（就是为了今天能加 mention）。
-- 这里补上完整取值，免得下一个人再翻代码猜。
COMMENT ON COLUMN public.notifications.type IS
  '通知类型：task_assigned / submission_approved / submission_rejected / milestone_overdue / new_notice / forum_reply / mention（v4.5.0 新增，由 @提及 触发）。';

-- ---- 6. 刷新统计信息 ----
ANALYZE public.forum_posts;
ANALYZE public.forum_likes;
ANALYZE public.forum_bookmarks;
ANALYZE public.users;

-- ---- 7. 验收：执行完直接看这张表（「结果」列全为 [OK] 即通过）----
-- 与第十八部分同理：DDL 成功时 SQL Editor 只显示「Success. No rows returned」，
-- 不给这张表就又要靠猜。这条查询**只读**，不写任何数据。
WITH expected AS (
  SELECT * FROM (VALUES
    ('表',     'forum_likes'),
    ('表',     'forum_bookmarks'),
    ('列',     'forum_posts.pinned_at'),
    ('列',     'forum_posts.reply_count'),
    ('列',     'forum_posts.like_count'),
    ('列',     'users.onboarded'),
    ('列',     'users.contact_phone'),
    ('列',     'users.contact_email'),
    ('触发器', 'trg_forum_replies_count'),
    ('触发器', 'trg_forum_likes_count'),
    ('触发器', 'trg_forum_posts_pin_guard'),
    ('策略',   'forum_likes_read_all'),
    ('策略',   'forum_likes_insert_own'),
    ('策略',   'forum_likes_delete_own'),
    ('策略',   'forum_bookmarks_read_all'),
    ('策略',   'forum_bookmarks_insert_own'),
    ('策略',   'forum_bookmarks_delete_own'),
    ('索引',   'idx_forum_likes_user'),
    ('索引',   'idx_forum_bookmarks_user'),
    ('索引',   'idx_forum_posts_pinned')
  ) AS e(kind, name)
)
SELECT t."类型", t."对象", CASE WHEN t."存在" THEN '[OK]' ELSE '[缺失]' END AS "结果"
FROM (
  SELECT e.kind AS "类型", e.name AS "对象",
    CASE e.kind
      WHEN '表' THEN EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = e.name AND c.relkind = 'r')
      WHEN '列' THEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = split_part(e.name, '.', 1)
          AND column_name  = split_part(e.name, '.', 2))
      WHEN '触发器' THEN EXISTS (
        SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT g.tgisinternal AND n.nspname = 'public' AND g.tgname = e.name)
      WHEN '策略' THEN EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = e.name)
      ELSE EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = e.name)
    END AS "存在"
  FROM expected e
  UNION ALL
  SELECT '数据', 'forum_posts.reply_count 与真实回复数一致',
    NOT EXISTS (
      SELECT 1 FROM public.forum_posts p
      WHERE p.reply_count <> (SELECT count(*) FROM public.forum_replies r WHERE r.post_id = p.id))
  UNION ALL
  SELECT '数据', 'forum_posts.like_count 与真实点赞数一致',
    NOT EXISTS (
      SELECT 1 FROM public.forum_posts p
      WHERE p.like_count <> (SELECT count(*) FROM public.forum_likes l WHERE l.post_id = p.id))
) t
ORDER BY t."类型", t."对象";
