-- ============================================================
-- Supabase 安全加固 · 第 2 步（2026-09-05）
-- ============================================================
-- 前提：step1 已执行、且新版前端已部署（注册/找回密码已走 rpc）。
--       顺序错了会打断注册与找回密码流程！
--
-- 事故背景（2026-09-05 排查确认）：
--   除 platform_guides / notifications / notice_reads 三表外，其余表均未开启 RLS。
--   Supabase 对未开 RLS 的表默认授予 anon 全部权限，而 anon key 打包在前端
--   公开 JS 里。实测：任何人可匿名 读取全员名单（姓名/学号/部门/角色）、
--   枚举全部邀请码，且可 匿名增删改 任意业务数据（UPDATE/DELETE 探针均 204）。
--
-- 原则：authenticated（登录用户）权限与现状完全一致（USING(true)/WITH CHECK(true)），
--       应用功能零变化；anon（匿名）无任何策略 = 一律拒绝。
--       登录前必需的 3 条匿名查询已改走 step1 的 SECURITY DEFINER 函数。
-- 幂等：可重复执行。
-- ============================================================

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

-- 每表一条 authenticated 全量策略（FOR ALL 覆盖 SELECT/INSERT/UPDATE/DELETE）
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

-- 执行后自检：
-- 1) 匿名读取用户表应返回空数组 []（RLS 过滤，而不是报错）：
--    curl '<URL>/rest/v1/users?select=*' -H 'apikey: <anon key>'
-- 2) 匿名写探针应被拒绝（不再是 204）：
--    curl -X PATCH '<URL>/rest/v1/invite_codes?code=eq.__probe__' \
--      -H 'apikey: <anon key>' -H 'Content-Type: application/json' -d '{"used_count":5}'
