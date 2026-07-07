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

-- 3. 初始数据（每个模块 2-3 条介绍，按 sort_order 排序）
INSERT INTO platform_guides (module_key, title, content, sort_order) VALUES

-- ========== 任务管理 ==========
('tasks', '任务系统概述', '任务管理是本平台的核心功能，用于分配、跟踪和审核学生会各部门的工作任务。\n\n【角色与权限】\n• 普通成员（志愿者）：查看分配给自己的任务，提交完成申请\n• 部门负责人：发布任务、指定执行人、审核提交、管理模板\n• 主席团及以上：跨部门查看所有任务\n\n【任务生命周期】\n待开始 → 进行中 → 待审核 → 已完成\n\n负责人发布任务后，任务状态为"待开始"。执行人可以自行将状态改为"进行中"。完成后提交审核，状态变为"待审核"。负责人审核通过后标记为"已完成"。', 0),

('tasks', '如何查看与提交任务', '【查看任务】\n进入"任务管理"页面，默认显示与你相关的所有任务。顶部 Tab 可按状态筛选：全部 / 待开始 / 进行中 / 待审核 / 已完成。\n\n【提交任务】\n1. 点击任务卡片，进入任务详情\n2. 在"提交成果"区域填写完成说明（做了什么、如何完成、注意事项）\n3. 点击"提交审核"\n4. 等待负责人审核，审核结果会即时反馈\n\n【注意事项】\n• 提交后不可撤回修改，请确认内容完整后再提交\n• 如果任务有关联的里程碑（子任务），建议在提交前完成所有里程碑\n• 逾期未提交的任务会在统计面板中显示红色警告', 1),

('tasks', '任务优先级与里程碑说明', '【优先级】\n每个任务有一个优先级，用卡片左侧色条和 Tag 标识：\n• 紧急（红色）— 需要立即处理，通常有较紧的截止时间\n• 重要（橙色）— 重要但不紧急，需合理安排时间\n• 普通（蓝色）— 常规任务，按部就班完成\n\n【里程碑（子任务）】\n负责人可将大任务拆分为多个里程碑：\n• 每个里程碑有自己的标题和截止日期\n• 执行人在任务详情中逐个勾选完成\n• 逾期的里程碑会显示红色警告标记\n• 负责人可在任务详情中查看所有里程碑的完成进度', 2),

-- ========== 部门公告 ==========
('notices', '公告系统概述', '部门公告是本部门内部信息传达的主要渠道，包括通知、会议纪要和活动信息。\n\n【公告类型】\n• 通知 — 一般性工作通知，如部门会议提醒、材料提交截止等\n• 会议纪要 — 部门会议的记录和决议，便于缺席成员补看\n• 活动 — 部门组织的各类活动信息\n\n【置顶规则】\n部门负责人及以上可以将重要公告置顶。置顶公告始终显示在列表最上方，确保不会被遗漏。建议将长期有效的公告（如部门规章制度）置顶。', 0),

('notices', '如何发布与管理公告', '【发布公告】（需部门负责人及以上权限）\n1. 点击"发布公告"按钮\n2. 填写标题、选择类型（通知/会议纪要/活动）\n3. 编写正文内容\n4. 可选择关联已有任务，关联后任务详情中会显示公告链接\n5. 发布后本部门所有成员可见\n\n【关联任务】\n公告可以关联到已有任务。例如：发布"迎新晚会任务分工"公告时，可直接关联已创建的晚会相关任务。执行人在查看任务时能看到公告链接，避免信息分散。\n\n【管理功能】\n• 置顶/取消置顶\n• 编辑公告内容（修改后原发布时间不变）\n• 删除公告', 1),

-- ========== 部门论坛 ==========
('forum', '论坛使用指南', '部门论坛是部门内部的交流讨论空间，支持发帖和回复。\n\n【论坛分类】\n• 工作讨论 — 日常工作话题，如方案讨论、问题求助\n• 活动策划 — 活动方案的讨论和征求意见\n• 资料共享 — 文件和资源分享，如模板、教程链接\n• 闲聊 — 轻松的社交话题\n• 知识库 — 重要文档和模板的归档区\n\n【发帖与回复】\n• 发帖时需选择分类，标题简洁明了\n• 正文支持换行和分段排版\n• 可回复他人帖子进行讨论\n• 知识库分类的帖子由负责人维护，作为部门长期参考资料', 0),

('forum', '知识库使用说明', '【什么是知识库】\n知识库是部门论坛中的特殊分类（📚 知识库），用于沉淀部门的重要文档、模板和经验总结。与普通讨论帖不同，知识库帖子是长期保留的参考资料。\n\n【适合放入知识库的内容】\n• 部门工作流程和规范文档\n• 常用模板（活动策划模板、会议纪要模板等）\n• 往年活动经验总结\n• 常见问题解答（FAQ）\n\n【维护方式】\n• 部门负责人及以上可以编辑和整理知识库帖子\n• 建议定期清理过时内容，保持知识库的时效性\n• 好的知识库能让新人快速上手', 1),

-- ========== 个人中心 ==========
('profile', '个人中心概述', '个人中心汇集了你的个人信息和工作数据，是了解自己工作状况的主要入口。\n\n【页面结构】\n• 顶部统计卡片 — 已完成/待完成/已逾期任务数量，点击可查看详情\n• 工作量热力图 — 按日历展示你每天的提交活跃度\n• 本月任务排行 — 本部门成员完成排名（仅负责人及以上可见）\n• 任务日历 — 在日历上查看各日期的任务分布\n• 通讯录 — 全学生会成员信息\n• 新人指南 — 本部门常用信息和 FAQ\n\n【数据说明】\n• 统计卡片点击后会弹出详细任务列表，分为已完成/待完成/已逾期三个 Tab\n• 热力图基于你实际提交任务的时间生成，颜色越深表示当天越活跃\n• 修改密码入口在页面底部"个人信息"区域', 0),

('profile', '统计面板与工作量查看', '【顶部统计卡片】\n三个卡片分别显示：已完成、待完成、已逾期的任务数量。点击任一卡片弹出任务列表弹窗，弹窗内按三个状态分 Tab 展示，可查看每个任务的具体信息（标题、优先级、截止日期、所属部门）。\n\n【工作量热力图】\n• 展示你每月的工作活跃度\n• 每个格子代表一天，颜色越深表示当天提交的任务越多\n• 点击有数据的格子，可以看到当天提交了哪些任务\n• 通过左右箭头切换月份\n• 统计学口径：统计的是你实际提交任务的时间，不是任务截止日期\n\n【任务日历】\n• 在日历视图上查看各日期的任务分布\n• 点击日期格子可以看到当天截止/提交的任务列表\n• 切换月份时自动加载对应月的任务数据', 1),

('profile', '排行榜与通讯录', '【本月任务排行】\n• 显示本部门成员本月完成任务数的排名（仅负责人及以上可见）\n• 前三名以领奖台卡片形式展示（🥇🥈🥉）\n• 第四名及以后显示排行榜列表，含进度条\n• 当前用户的行会高亮显示\n• 数据来源：当月截止日期在本月的已完成任务数\n\n【通讯录】\n• 查看全学生会所有成员信息\n• 支持按部门筛选（顶部 Tag 栏）\n• 支持按姓名或学号搜索\n• 普通成员查看通讯录时，不显示联系方式\n• 每张成员卡片显示该成员当前的任务统计\n\n【新人指南】\n• 由部门负责人维护的部门专属指南\n• 包含：部门基本信息、常用模板链接、FAQ\n• 新成员加入后应首先查看本部门的新人指南', 2)
ON CONFLICT DO NOTHING;
