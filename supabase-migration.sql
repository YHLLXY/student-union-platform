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

-- 3. 初始数据（4 个模块各 1 条默认介绍）
INSERT INTO platform_guides (module_key, title, content, sort_order) VALUES
('tasks', '如何查看与提交任务', '任务管理是你在学生会的主要工作入口。\n\n你可以在这里查看分配给你的所有任务，每个任务都有优先级（紧急/重要/普通）和状态（待开始/进行中/待审核/已完成）。\n\n提交任务时，点击任务卡片进入详情，填写完成说明后点击"提交审核"。部门负责人会审核你的提交，审核通过后任务状态变为"已完成"。\n\n如果任务有里程碑（子任务），你可以在任务详情中逐个勾选完成。逾期未完成的里程碑会显示警告标记。', 0),
('notices', '部门公告的使用', '部门公告用于发布本部门的重要通知、会议纪要和活动信息。\n\n公告分为三种类型：\n• 通知 — 一般性工作通知\n• 会议纪要 — 会议记录和决议\n• 活动 — 部门活动相关\n\n发布公告时，可以选择关联已有任务，这样任务详情中会显示该公告的链接。部门负责人及以上可以置顶公告，置顶的公告会始终显示在列表最上方。', 0),
('forum', '部门论坛介绍', '部门论坛是部门内部的交流讨论空间。\n\n论坛分类：\n• 工作讨论 — 日常工作话题\n• 活动策划 — 活动方案讨论\n• 资料共享 — 文件和资源分享\n• 闲聊 — 轻松话题\n• 知识库 — 重要文档和模板归档\n\n发帖时支持 Markdown 格式，可以插入标题、列表、链接等。知识库分类的帖子会作为部门知识沉淀长期保存。', 0),
('profile', '个人中心功能概览', '个人中心汇集了你的所有个人信息和工作数据。\n\n主要功能：\n• 任务统计卡片 — 展示你已完成、待完成和已逾期的任务数量\n• 工作量热力图 — 按日历形式展示你每月完成任务的时间分布\n• 本月任务排行 — 查看本部门成员的本月任务完成排名（负责人及以上可见）\n• 任务日历 — 在日历上查看各日期的任务截止情况\n• 通讯录 — 查看全学生会成员信息\n• 新人指南 — 查看本部门的常用信息、模板和 FAQ\n• 修改密码 — 在页面底部的个人信息区域', 0)
ON CONFLICT DO NOTHING;
