-- ============================================================
-- Supabase 安全加固 · 第 1 步（2026-09-05）
-- ============================================================
-- 作用：创建 3 个 SECURITY DEFINER 函数，承接注册 / 找回密码流程的
--       匿名查询。第 2 步（RLS 收紧）执行后，匿名将无法直查任何业务表，
--       这 3 个函数是匿名仅剩的数据入口，均只做精确匹配、不可枚举。
--
-- 兼容性：本脚本只新增函数、不改任何权限/表结构，先执行完全不影响
--         现有版本前端的运行（前端对未创建的函数有回退逻辑）。
-- 幂等：  可重复执行（CREATE OR REPLACE / GRANT 均幂等）。
-- ============================================================

-- 1. 邀请码校验（学生注册页 / 教师注册页用）
--    旧写法：匿名可 select * 全表 → 任何人可枚举所有有效邀请码
--    现在：  必须提供精确 code 才能取到单条，无法列目录
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

-- 2. 学号是否已注册（注册页查重用）
--    旧写法：匿名直查 users 表 → 可拖走全员名单（姓名/学号/部门/角色）
--    现在：  只返回 true / false，不暴露任何用户字段
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

-- 3. 身份核验（自主重置密码用）
--    旧写法：匿名直查 users 表
--    现在：  姓名 + 学号必须同时精确匹配才返回 auth_id，无法批量枚举
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

-- 授权：注册 / 找回密码发生在未登录状态，anon 必须可调用
-- （函数默认已授予 PUBLIC，这里显式写出便于审计）
GRANT EXECUTE ON FUNCTION validate_invite_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_student_registered(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_user_identity(text, text) TO anon, authenticated;

-- 执行后自检（应返回 3 行函数定义）：
-- SELECT proname FROM pg_proc WHERE proname IN
--   ('validate_invite_code', 'check_student_registered', 'verify_user_identity');
