-- ⚠️ 本文件由 scripts/extract-sql-section.mjs 从 supabase-migration.sql 自动抽取，请勿手工编辑。
--    改动请改 supabase-migration.sql 的「第二十部分」章节，然后重新执行：
--      node scripts/extract-sql-section.mjs 第二十部分 supabase-phase4-v4.6.0.sql
-- ============================================================
-- 第二十部分：Phase 4 权限收口 —— 细粒度 RLS + RPC 授权审计（2026-09-12，v4.6.0）
-- ============================================================
-- 目标：把 ISSUES #5 剩下的那一半补上（已登录用户之间没有行级隔离）。
-- 现状（第十六部分留下的）：14 张业务表各有一条
--   `authenticated_full_access FOR ALL TO authenticated USING (true) WITH CHECK (true)`
-- ——anon 被挡住，但**任何登录用户可以对任何表做任何事**。实测含义：一个志愿者拿
--   anon key（前端 JS 里就有）直接打 REST，就能
--   `PATCH /rest/v1/users?id=eq.<自己> {"role":"president"}` 给自己提权，
--   也能删光 tasks / notices。前端那套 hasMinRole 只是藏按钮，不构成边界。
--
-- 本部分的取舍（改动前务必先读，否则会误以为「读侧没收干净」是漏做）：
--   ① **写侧全面收口**：逐表按 INSERT / UPDATE / DELETE 定义策略——这是真缺口。
--   ② **读侧只收该收的**：users / tasks / tickets / ticket_records / school_notices
--      这 5 张表**有意保持「登录即可全量读」**，理由逐条写在对应策略上方。它们被
--      通讯录（读全员）、@提及名册（读全员）、通讯录里的「他人任务计数」（读全校任务）、
--      剩余票数（读全体票券行）、校级公告占用——这些是刻意的全量读取，收紧的后果是
--      **页面静默少数据而不是报错**，比收紧本身危险得多。真要收，得先把这几处改成
--      聚合 RPC（已记入 docs/ISSUES.md #14，含具体落法）。
--   ③ **RPC 的 EXECUTE 授权一并审计**：第十六部分只关了表，没关函数。Supabase 建库时
--      对 public schema 有 `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO anon`，
--      所以**后建的函数默认 anon 也能调**。2026-09-12 用 anon key 直打 REST 实测：
--        · public.role_level('volunteer')          → 200 / 0            ← anon 可调
--        · public.is_organizer()                   → 200 / false        ← anon 可调
--        · public.semester_of()                    → 200 / 2026-2027-1   ← anon 可调
--        · public.check_in_ticket('PROBE')         → 200 {forbidden}     ← anon 可调（内部挡住了）
--        · public.ticket_qr_token(<随机 uuid>)      → 400 {票券记录不存在} ← anon 可调（内部挡住了）
--        · public.verify_ticket_qr_token('PROBE')  → 401 42501           ← 已收口（Phase 2 显式 REVOKE）
--      逐个显式 REVOKE，不再依赖「函数内部自己有守卫」这层运气。
--      **触发器函数不在审计范围**：PostgREST 根本不暴露返回 trigger 的函数，实测
--      `POST /rest/v1/rpc/touch_updated_at` → 404 PGRST202（schema cache 里没有），无暴露面。
--   ④ **顺序：先建新策略、后拆旧策略**。CREATE POLICY 没有 IF NOT EXISTS，本文件对每个策略
--      都是先 DROP 再 CREATE；但「拆全量放行」这一动作统一放到**最后**执行——permissive
--      策略之间是并集，两套并存时权限仍是宽松的旧状态，等新策略全部就位再收窄，
--      全程不存在「一条策略都没有 → 线上请求被拒」的真空期。
--   ⑤ 幂等可重跑：策略先 DROP 后 CREATE，触发器先 DROP 后 CREATE，函数 CREATE OR REPLACE。
--   ⑥ **本文件的验收不在 E2E/单测里**：测试打的是本地 stub，而 stub 不实现 RLS
--      （单测/E2E 只能证明「功能没坏」，证明不了「策略对」）。策略的验收靠配套的
--      只读自证脚本 supabase-verify-v4.6.0.sql —— 它在事务里冒充三种角色逐条断言
--      「该放行的放行、该拒绝的拒绝」，最后 ROLLBACK，不改任何数据。

SET search_path = public;

-- ---- 1. 策略辅助函数（新增 8 个，一律 SECURITY DEFINER）----
-- 为什么必须 SECURITY DEFINER：策略里要判断「这条帖子是不是我部门的」这类跨表条件，
-- 而策略表达式是以**当前用户**身份求值的——直接写子查询会连带触发被引用表的 RLS，
-- 变成「策略依赖策略」，既慢又难推理（典型症状：本该放行的行被判拒绝）。
-- SECURITY DEFINER 让函数以属主（postgres，表属主天然绕过 RLS）身份去读那一行，
-- 只把布尔结论交回策略。全部标 STABLE：同一语句内结果可复用，规划器能缓存。

COMMENT ON FUNCTION public.role_level(text) IS
  '角色 → 权限等级（与前端 src/utils/constants.ts 的 ROLE_LEVEL 同口径，改一处要两处同步）。';

-- 当前登录者所属部门（无部门者如老师返回空串，不是 NULL，便于直接比较）
CREATE OR REPLACE FUNCTION public.my_department()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.department, '') FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1
$$;

COMMENT ON FUNCTION public.my_department() IS
  '当前登录者的部门键；未登录/无部门返回空串。配合 is_dept_head_of() 做「本部门」判定。';

-- 管理员 = 主席 / 老师 / 开发者（level 3），与前端 isAdmin() 同口径
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.role_level(public.current_app_role()) >= 3
$$;

-- 主席团及以上（level 2）：跨部门可见/可管的门槛
CREATE OR REPLACE FUNCTION public.is_presidium()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.role_level(public.current_app_role()) >= 2
$$;

-- 「这个人管得着这个部门吗」：主席团及以上管全部；部门负责人只管自己那一个部门。
-- 末尾的 `p_dept <> ''` 是刻意的：防止「角色等级≥1 但部门为空」（历史脏数据）的人
-- 因为 `'' = ''` 而管到所有部门为空的行。
CREATE OR REPLACE FUNCTION public.is_dept_head_of(p_dept text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_presidium()
      OR (public.role_level(public.current_app_role()) >= 1
          AND p_dept IS NOT NULL AND p_dept <> '' AND p_dept = public.my_department())
$$;

-- 帖子可见性：本部门 + 协同部门 + 主席团及以上（= fetchPosts / 看板 / 搜索的口径）
CREATE OR REPLACE FUNCTION public.can_view_post(p_post uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.forum_posts f
    WHERE f.id = p_post
      AND (public.is_presidium()
           OR f.department = public.my_department()
           OR public.my_department() = ANY (f.collaborating_departments))
  )
$$;

-- 帖子管理权：作者 / 管理员 / 该帖所属部门的负责人
-- （逐字对应 PostDetail.tsx 的 canDelete = isAuthor || (isDeptHead && 同部门) || isPlatformAdmin）
CREATE OR REPLACE FUNCTION public.can_manage_post(p_post uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.forum_posts f
    WHERE f.id = p_post
      AND (public.is_admin()
           OR f.created_by = public.current_app_user_id()
           OR public.is_dept_head_of(f.department))
  )
$$;

-- 任务可见性：指派给我 / 我创建 / 本部门 / 主席团及以上（= fetchTasks 的口径）
CREATE OR REPLACE FUNCTION public.can_view_task(p_task uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task
      AND (public.is_presidium()
           OR t.assigned_to = public.current_app_user_id()
           OR t.created_by = public.current_app_user_id()
           OR t.assigned_department = public.my_department())
  )
$$;

-- 任务审核权：该任务所属部门的负责人及以上（配合既有守卫触发器限制状态流转）
CREATE OR REPLACE FUNCTION public.can_review_task(p_task uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task AND public.is_dept_head_of(t.assigned_department)
  )
$$;

-- 授权：策略只对 authenticated 生效，故这些函数只给 authenticated。
-- 注意 REVOKE ... FROM PUBLIC 会连带收回 authenticated（PUBLIC 是所有角色的集合），
-- 所以「先 REVOKE 再 GRANT」的顺序不能颠倒。
REVOKE ALL ON FUNCTION public.my_department()            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin()                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_presidium()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_dept_head_of(text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_post(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_post(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_task(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_review_task(uuid)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_department()        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_admin()             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_presidium()         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_dept_head_of(text)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_view_post(uuid)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_manage_post(uuid)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_view_task(uuid)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_review_task(uuid)  TO authenticated;

-- 第十八部分建立的四个判定函数同样被 anon 调得到（实测），一并收回 anon。
-- authenticated 必须保留：策略表达式以当前用户身份求值，收回它会让所有策略报权限错。
REVOKE ALL ON FUNCTION public.role_level(text)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_app_user_id()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_app_role()         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_organizer()             FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.role_level(text)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.current_app_user_id()  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.current_app_role()     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_organizer()         TO authenticated;

-- 同理：semester_of() 现在是 authenticated 内部使用（积分/学期键），不需要 anon
REVOKE ALL ON FUNCTION public.semester_of(timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.semester_of(timestamptz) TO authenticated;

-- ---- 2. RPC 授权收口（函数层，与表级 RLS 是两道独立的门）----

-- 2.1 grab_ticket：原实现把 p_user_id 完全交给调用方，谁都能替别人抢票
-- （消耗对方的限购额度、占用票池）。加一道「只能替自己抢」的校验，放行 service_role。
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
  -- 0. 身份校验（v4.6.0 新增）：非 service_role 时 p_user_id 必须就是调用者本人。
  --    没有这一步，匿名/任何登录用户都能用别人的 user_id 抢票。
  IF auth.role() <> 'service_role'
     AND p_user_id IS DISTINCT FROM public.current_app_user_id() THEN
    RETURN jsonb_build_object('success', false, 'message', '身份校验失败，请重新登录后重试');
  END IF;

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

-- 2.2 逐一收口 anon 的 EXECUTE（函数内部有守卫不等于不该收权限，最小权限优先）。
--     这两个函数前端只在登录后调用，收回 anon 无功能影响。
REVOKE ALL ON FUNCTION public.grab_ticket(uuid, uuid, text, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_in_ticket(text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticket_qr_token(uuid, integer)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.grab_ticket(uuid, uuid, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.check_in_ticket(text)               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.ticket_qr_token(uuid, integer)      TO authenticated;

-- 2.3 reset_user_password：**有意保留 anon**（登录页「忘记密码」的必经之路：
--     verify_user_identity 拿 auth_id → reset_user_password 改密码，此时必然未登录）。
--     副作用是「知道姓名 + 学号即可改这个人密码」，属既有产品设计（身份证明就是这两项），
--     不是本部分引入的。要收口需要改产品流程（加第二因子/改由负责人发一次性重置码），
--     已作为**高危待决策项**记入 docs/ISSUES.md #13，此处不擅自改变行为。

-- ---- 3. 新增 RPC：register_user（注册的唯一入口）----
-- 为什么注册必须搬进函数：原流程是「前端直插 users，role / department 由前端传」，
-- 而 role 直接决定权限等级——只要 users 还允许登录用户 INSERT，任何拿到邀请码的人
-- 都能直接 `POST /rest/v1/users` 把自己写成 president（比改 role 那条路更直接）。
-- 搬进函数后：
--   ① role 与 department **由邀请码推导**，客户端说了不算；
--   ② 邀请码核销与建号在同一事务、同一行锁下完成——顺带修掉「两人同时用同一张码注册，
--      都读到同一个旧值各自写回 → 只 +1」的 TOCTOU（与 P0-01 抢票是同一类问题）；
--   ③ 表侧因此不再需要 INSERT 策略：**没有策略就是没有人能直接插入**（RLS 默认拒绝）。
-- 返回 { ok, error?, user? }，user 为落库后的整行（与 PostgREST 的 representation 同形）。
CREATE OR REPLACE FUNCTION public.register_user(
  p_auth_id     uuid,
  p_name        text,
  p_student_id  text,
  p_invite_code text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code public.invite_codes;
  v_used integer;
  v_max  integer;
  v_role text;
  v_dept text;
  v_row  public.users;
BEGIN
  -- 身份校验：只能为自己注册（service_role 例外，供运维补建账号）
  IF auth.role() <> 'service_role' AND p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', '注册身份校验失败，请重新登录后重试');
  END IF;
  IF p_auth_id IS NULL OR COALESCE(p_name, '') = '' OR COALESCE(p_student_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', '注册信息不完整');
  END IF;
  IF COALESCE(p_invite_code, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', '请填写邀请码');
  END IF;
  -- 先查重给出人话提示（并发下仍由唯一约束兜底，见 EXCEPTION 段）
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.student_id = p_student_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', '该学号已注册，请直接登录');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = p_auth_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', '该账号已注册过，请直接登录');
  END IF;

  -- 邀请码：行锁串行化 + 复核撤销 / 过期 / 用尽
  SELECT * INTO v_code FROM public.invite_codes ic WHERE ic.code = p_invite_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '邀请码无效');
  END IF;
  IF v_code.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '邀请码已被撤销，请联系部门负责人');
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', '邀请码已过期，请联系部门负责人');
  END IF;
  v_used := COALESCE(v_code.used_count, CASE WHEN v_code.is_used THEN 1 ELSE 0 END);
  v_max  := COALESCE(v_code.max_uses, 1);
  IF v_used >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'error', '邀请码已用完，请联系部门负责人');
  END IF;

  -- 角色与部门由邀请码决定；教师无部门（沿用既有业务规则，此前写在前端 signUpTeacher 里）
  v_role := v_code.role;
  v_dept := CASE WHEN v_role = 'teacher' THEN '' ELSE COALESCE(v_code.department, '') END;

  INSERT INTO public.users (auth_id, name, student_id, department, role)
  VALUES (p_auth_id, p_name, p_student_id, v_dept, v_role)
  RETURNING * INTO v_row;

  UPDATE public.invite_codes
  SET used_count = v_used + 1,
      is_used    = (v_used + 1) >= v_max,
      used_by    = v_row.id
  WHERE id = v_code.id;

  RETURN jsonb_build_object('ok', true, 'user', to_jsonb(v_row));

EXCEPTION
  WHEN unique_violation THEN
    -- 并发下另一个同名学号刚插入：唯一约束是最终裁决
    RETURN jsonb_build_object('ok', false, 'error', '该学号已注册，请直接登录');
END $$;

REVOKE ALL ON FUNCTION public.register_user(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_user(uuid, text, text, text) TO authenticated;

-- ============================================================
-- 4. 逐表策略
-- ============================================================
-- 命名约定：<表>_<操作>_<范围>。
-- SELECT 策略里的 `TO authenticated` 一个都不能省：不写 TO 就是 TO PUBLIC（对 anon 也生效），
-- 与「anon 一律拒绝」的既定姿态相悖。
-- 每张表**只建用得到的操作**：没有对应前端路径就干脆不建策略（RLS 默认拒绝＝删掉入口），
-- 这比留一条宽松策略更安全。前端确实没有 DELETE 通路的表已逐个注明。

-- ---- 4.1 users ----
-- SELECT 有意全量：通讯录（MemberDirectory 需全员）、@提及名册（fetchMentionUsers）、
-- 工作看板的成员聚合都要求「任何登录用户能读全员」。联系方式（contact_phone/email）的
-- 可见性是页面级规则（见 CLAUDE.md Phase 3 记录），RLS 做不到「按列可见」——
-- 要收紧得改成视图/列级 GRANT，而列级 GRANT 会让现有的 select('*') 直接报权限错，
-- 故保持现状并把这条记入 ISSUES #14。
DROP POLICY IF EXISTS users_select_all           ON public.users;
DROP POLICY IF EXISTS users_insert_self          ON public.users;
DROP POLICY IF EXISTS users_update_self_or_admin ON public.users;
CREATE POLICY users_select_all ON public.users
  FOR SELECT TO authenticated USING (true);
-- 本人改自己的资料；管理员改任何人（改 role/department 的越权由下面的守卫触发器再拦一道）
CREATE POLICY users_update_self_or_admin ON public.users
  FOR UPDATE TO authenticated
  USING (id = public.current_app_user_id() OR public.is_admin())
  WITH CHECK (id = public.current_app_user_id() OR public.is_admin());
-- 有意**不建** INSERT 策略：注册只能走 register_user()（SECURITY DEFINER，角色由邀请码推导）。
-- 这一条很关键——留一条 `WITH CHECK (auth_id = auth.uid())` 看起来只允许「写自己」，
-- 但 role 是请求体里带来的，等于允许任何人把自己注册成 president。
-- 同样有意不建 DELETE 策略：本项目从无删除用户的路径（离职走 role='removed'）。

-- ---- 4.2 invite_codes ----
-- SELECT 收到负责人：注册者不再需要读这张表（注册与核销都在 register_user 里完成）。
-- 这条同时关掉一个实际泄露面——原策略下任何志愿者都能列出全部邀请码并转发出去。
DROP POLICY IF EXISTS invite_codes_select_dept ON public.invite_codes;
DROP POLICY IF EXISTS invite_codes_insert_dept ON public.invite_codes;
DROP POLICY IF EXISTS invite_codes_update_dept ON public.invite_codes;
DROP POLICY IF EXISTS invite_codes_delete_dept ON public.invite_codes;
CREATE POLICY invite_codes_select_dept ON public.invite_codes
  FOR SELECT TO authenticated USING (public.is_dept_head_of(department));
CREATE POLICY invite_codes_insert_dept ON public.invite_codes
  FOR INSERT TO authenticated WITH CHECK (public.is_dept_head_of(department));
CREATE POLICY invite_codes_update_dept ON public.invite_codes
  FOR UPDATE TO authenticated
  USING (public.is_dept_head_of(department))
  WITH CHECK (public.is_dept_head_of(department));
CREATE POLICY invite_codes_delete_dept ON public.invite_codes
  FOR DELETE TO authenticated USING (public.is_dept_head_of(department));

-- ---- 4.3 tasks ----
-- SELECT 有意全量：profileService.fetchAllMembers 会 `.in('assigned_to', 全员id)`
-- 去算「通讯录里每个人的任务数」，adminService 的工作看板在 presidium+ 下读全校任务。
-- 按部门收紧 SELECT 会让通讯录的任务数静默变成 0（不报错）。收法见 ISSUES #14。
DROP POLICY IF EXISTS tasks_select_all          ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_organizer    ON public.tasks;
DROP POLICY IF EXISTS tasks_update_participant  ON public.tasks;
CREATE POLICY tasks_select_all ON public.tasks
  FOR SELECT TO authenticated USING (true);
-- 发布任务：部门负责人及以上，且 created_by 必须是本人（taskService.createTask 传的就是 user.id）
CREATE POLICY tasks_insert_organizer ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_organizer() AND created_by = public.current_app_user_id());
-- 更新任务：四种合法场景的并集——
--   ① 发布者改自己的任务（updateTask，UI 的 canEdit）
--   ② 执行人改状态/填交接说明（submitTask→updateTaskStatus、updateHandoverNote）
--   ③ 主席/老师/开发者改任何任务
--   ④ 本部门负责人审核（reviewSubmission→updateTaskStatus）
CREATE POLICY tasks_update_participant ON public.tasks
  FOR UPDATE TO authenticated
  USING (created_by = public.current_app_user_id()
         OR assigned_to = public.current_app_user_id()
         OR public.is_admin()
         OR public.is_dept_head_of(assigned_department))
  WITH CHECK (created_by = public.current_app_user_id()
         OR assigned_to = public.current_app_user_id()
         OR public.is_admin()
         OR public.is_dept_head_of(assigned_department));
-- 有意不建 DELETE 策略：前端无删除任务的路径

-- ---- 4.4 task_submissions ----
-- 可见范围 = 自己的提交 ∪ 看得到该任务的人（TaskDetail 里会把提交记录列出来，含他人提交）
DROP POLICY IF EXISTS task_submissions_select_visible     ON public.task_submissions;
DROP POLICY IF EXISTS task_submissions_insert_self        ON public.task_submissions;
DROP POLICY IF EXISTS task_submissions_update_reviewer    ON public.task_submissions;
CREATE POLICY task_submissions_select_visible ON public.task_submissions
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id() OR public.can_view_task(task_id));
-- 提交只能以自己名义（submitTask 传 user.id）
CREATE POLICY task_submissions_insert_self ON public.task_submissions
  FOR INSERT TO authenticated WITH CHECK (user_id = public.current_app_user_id());
-- 审核只能由该任务所属部门的负责人及以上（status 流转另有 trg_guard_submission_review 兜底）
CREATE POLICY task_submissions_update_reviewer ON public.task_submissions
  FOR UPDATE TO authenticated
  USING (public.can_review_task(task_id))
  WITH CHECK (public.can_review_task(task_id));
-- 有意不建 DELETE 策略：前端无删除提交记录的路径

-- ---- 4.5 notices ----
-- SELECT 按部门：这正是公告的产品语义（只看本部门 + 主席团及以上看全部）。
-- 已知边界：若某任务被跨部门直接指派给某人，其关联公告的展示芯片会因读不到而消失
--（fetchLinkedNotices 无部门过滤）。属极边缘场景，且只影响一个装饰性芯片。
DROP POLICY IF EXISTS notices_select_dept ON public.notices;
DROP POLICY IF EXISTS notices_insert_dept ON public.notices;
DROP POLICY IF EXISTS notices_update_dept ON public.notices;
CREATE POLICY notices_select_dept ON public.notices
  FOR SELECT TO authenticated
  USING (department = public.my_department() OR public.is_presidium());
CREATE POLICY notices_insert_dept ON public.notices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dept_head_of(department) AND created_by = public.current_app_user_id());
CREATE POLICY notices_update_dept ON public.notices
  FOR UPDATE TO authenticated
  USING (public.is_dept_head_of(department))
  WITH CHECK (public.is_dept_head_of(department));
-- 有意不建 DELETE 策略：前端无删除公告的路径

-- ---- 4.6 school_notices ----
-- 校级公告本来就是全员可见，SELECT 保持全量；写入门槛与 UI 一致（presidium+）
DROP POLICY IF EXISTS school_notices_select_all      ON public.school_notices;
DROP POLICY IF EXISTS school_notices_insert_presidium ON public.school_notices;
CREATE POLICY school_notices_select_all ON public.school_notices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY school_notices_insert_presidium ON public.school_notices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_presidium() AND created_by = public.current_app_user_id());

-- ---- 4.7 forum_posts ----
-- SELECT 按「本部门 / 协同部门 / 主席团及以上」，与 fetchPosts、看板动态、全局搜索完全同口径。
-- 行为变化（有意）：跨部门帖子的**直链**不再能打开（原来 POST_SELECT 无过滤，知道 id 就能看）。
DROP POLICY IF EXISTS forum_posts_select_visible   ON public.forum_posts;
DROP POLICY IF EXISTS forum_posts_insert_self      ON public.forum_posts;
DROP POLICY IF EXISTS forum_posts_update_manager   ON public.forum_posts;
DROP POLICY IF EXISTS forum_posts_delete_manager   ON public.forum_posts;
CREATE POLICY forum_posts_select_visible ON public.forum_posts
  FOR SELECT TO authenticated USING (public.can_view_post(id));
CREATE POLICY forum_posts_insert_self ON public.forum_posts
  FOR INSERT TO authenticated WITH CHECK (created_by = public.current_app_user_id());
-- 置顶（本部门负责人+，另有 trg_forum_posts_pin_guard 专管 pinned_at）、改协同部门（presidium+）
CREATE POLICY forum_posts_update_manager ON public.forum_posts
  FOR UPDATE TO authenticated
  USING (public.can_manage_post(id) OR public.is_presidium())
  WITH CHECK (public.can_manage_post(id) OR public.is_presidium());
-- 删帖：作者 / 管理员 / 该帖所属部门负责人（与 PostDetail 的 canDelete 逐字一致）
CREATE POLICY forum_posts_delete_manager ON public.forum_posts
  FOR DELETE TO authenticated USING (public.can_manage_post(id));

-- ---- 4.8 forum_replies ----
DROP POLICY IF EXISTS forum_replies_select_visible          ON public.forum_replies;
DROP POLICY IF EXISTS forum_replies_insert_self             ON public.forum_replies;
DROP POLICY IF EXISTS forum_replies_delete_own_or_manager   ON public.forum_replies;
CREATE POLICY forum_replies_select_visible ON public.forum_replies
  FOR SELECT TO authenticated USING (public.can_view_post(post_id));
CREATE POLICY forum_replies_insert_self ON public.forum_replies
  FOR INSERT TO authenticated WITH CHECK (created_by = public.current_app_user_id());
-- 自己的回复可删；管得着该帖的人可以删该帖下的任何回复
-- （deletePost 会按 post_id 连删所有人的回复，这条策略是那条路径的通行证）
CREATE POLICY forum_replies_delete_own_or_manager ON public.forum_replies
  FOR DELETE TO authenticated
  USING (created_by = public.current_app_user_id() OR public.can_manage_post(post_id));
-- 有意不建 UPDATE 策略：回复没有编辑功能

-- ---- 4.9 tickets ----
DROP POLICY IF EXISTS tickets_select_all        ON public.tickets;
DROP POLICY IF EXISTS tickets_insert_organizer  ON public.tickets;
CREATE POLICY tickets_select_all ON public.tickets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY tickets_insert_organizer ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_organizer() AND created_by = public.current_app_user_id());
-- 有意不建 UPDATE / DELETE 策略：活动发布后不可改不可删（前端也无路径）

-- ---- 4.10 ticket_records ----
-- SELECT 有意全量（两条硬需求）：① 每个人都要看「剩余票数」＝对 ticket_records 做 head count；
-- ② 组织者要拉签到名单。按人收紧会让「剩余票数」对普通志愿者恒为满票。
-- 顺带记一笔：这也是「全员姓名+学号对任何登录用户可读」的来源，收法见 ISSUES #14。
DROP POLICY IF EXISTS ticket_records_select_all         ON public.ticket_records;
DROP POLICY IF EXISTS ticket_records_insert_self        ON public.ticket_records;
DROP POLICY IF EXISTS ticket_records_update_organizer   ON public.ticket_records;
DROP POLICY IF EXISTS ticket_records_delete_self        ON public.ticket_records;
CREATE POLICY ticket_records_select_all ON public.ticket_records
  FOR SELECT TO authenticated USING (true);
-- 抢票走 grab_ticket()（SECURITY DEFINER，绕过 RLS），这条是给「直插」兜底的
CREATE POLICY ticket_records_insert_self ON public.ticket_records
  FOR INSERT TO authenticated WITH CHECK (user_id = public.current_app_user_id());
-- 只有组织者能改（签到写 checked_in_at/checked_by；两个列另有 trg_guard_ticket_checkin 守着）
CREATE POLICY ticket_records_update_organizer ON public.ticket_records
  FOR UPDATE TO authenticated
  USING (public.is_organizer())
  WITH CHECK (public.is_organizer());
-- 退票：**只能退自己的**。原 refundTicket 的 delete 只有
-- `.eq('id', recordId).eq('ticket_id', ticketId)`，没有 user_id 条件——
-- 换句话说「按 id 删别人的票」此前是靠调用点自觉，现在由策略兜住。
CREATE POLICY ticket_records_delete_self ON public.ticket_records
  FOR DELETE TO authenticated USING (user_id = public.current_app_user_id());

-- ---- 4.11 task_templates ----
DROP POLICY IF EXISTS task_templates_select_dept ON public.task_templates;
DROP POLICY IF EXISTS task_templates_insert_dept ON public.task_templates;
DROP POLICY IF EXISTS task_templates_update_dept ON public.task_templates;
DROP POLICY IF EXISTS task_templates_delete_dept ON public.task_templates;
CREATE POLICY task_templates_select_dept ON public.task_templates
  FOR SELECT TO authenticated USING (public.is_dept_head_of(department));
CREATE POLICY task_templates_insert_dept ON public.task_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dept_head_of(department) AND created_by = public.current_app_user_id());
CREATE POLICY task_templates_update_dept ON public.task_templates
  FOR UPDATE TO authenticated
  USING (public.is_dept_head_of(department))
  WITH CHECK (public.is_dept_head_of(department));
CREATE POLICY task_templates_delete_dept ON public.task_templates
  FOR DELETE TO authenticated USING (public.is_dept_head_of(department));

-- ---- 4.12 task_milestones ----
-- 可见性跟任务走；勾选进度是「看得到任务的人都能勾」（MilestonePanel 的 Checkbox 不受
-- canEdit 约束，任何执行人都能打勾并写 completed_by=自己）；建/删由负责人做。
DROP POLICY IF EXISTS task_milestones_select_visible    ON public.task_milestones;
DROP POLICY IF EXISTS task_milestones_insert_manager    ON public.task_milestones;
DROP POLICY IF EXISTS task_milestones_update_visible    ON public.task_milestones;
DROP POLICY IF EXISTS task_milestones_delete_manager    ON public.task_milestones;
CREATE POLICY task_milestones_select_visible ON public.task_milestones
  FOR SELECT TO authenticated USING (public.can_view_task(task_id));
CREATE POLICY task_milestones_insert_manager ON public.task_milestones
  FOR INSERT TO authenticated WITH CHECK (public.can_review_task(task_id));
CREATE POLICY task_milestones_update_visible ON public.task_milestones
  FOR UPDATE TO authenticated
  USING (public.can_view_task(task_id))
  WITH CHECK (public.can_view_task(task_id));
CREATE POLICY task_milestones_delete_manager ON public.task_milestones
  FOR DELETE TO authenticated USING (public.can_review_task(task_id));

-- ---- 4.13 department_guides ----
DROP POLICY IF EXISTS department_guides_select_dept ON public.department_guides;
DROP POLICY IF EXISTS department_guides_insert_dept ON public.department_guides;
DROP POLICY IF EXISTS department_guides_update_dept ON public.department_guides;
CREATE POLICY department_guides_select_dept ON public.department_guides
  FOR SELECT TO authenticated
  USING (department = public.my_department() OR public.is_presidium());
CREATE POLICY department_guides_insert_dept ON public.department_guides
  FOR INSERT TO authenticated WITH CHECK (public.is_dept_head_of(department));
CREATE POLICY department_guides_update_dept ON public.department_guides
  FOR UPDATE TO authenticated
  USING (public.is_dept_head_of(department))
  WITH CHECK (public.is_dept_head_of(department));
-- 有意不建 DELETE 策略：部门指南没有删除入口

-- ---- 4.14 usage_events ----
-- SELECT 只给管理员：这张表是埋点 + 错误日志（含 metadata），唯一的读入口是
-- 成员管理里的「数据看板」Tab，而那个 Tab 只在 isAdmin 时挂载。
DROP POLICY IF EXISTS usage_events_select_admin ON public.usage_events;
DROP POLICY IF EXISTS usage_events_insert_self  ON public.usage_events;
CREATE POLICY usage_events_select_admin ON public.usage_events
  FOR SELECT TO authenticated USING (public.is_admin());
-- 埋点是 fire-and-forget 写入；允许 user_id 为空（未登录/无法归属的事件）
CREATE POLICY usage_events_insert_self ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = public.current_app_user_id());
-- 有意不建 UPDATE / DELETE 策略：埋点只增不改不删

-- ---- 4.15 三张「第十六部分未覆盖」的表：补漏与口径对齐 ----
-- 第十六部分的全量放行只覆盖 14 张表，notifications / notice_reads / platform_guides
-- 在更早的部分（第七/八/九部分）就已有各自策略，故本次不重建，只做两件修正：

-- (a) notice_reads 补 UPDATE 策略。原策略只有 SELECT + INSERT，而
--     noticeService.markNoticeRead 用的是 upsert → 第二次读同一条公告会走
--     ON CONFLICT DO UPDATE，没有 UPDATE 策略时该分支报 RLS 错（前端只 log 不提示，
--     表现为 read_at 不再刷新）。这是**实打实的补漏**，不是加固。
DROP POLICY IF EXISTS notice_reads_select_dept_or_self ON public.notice_reads;
DROP POLICY IF EXISTS notice_reads_insert_self         ON public.notice_reads;
DROP POLICY IF EXISTS notice_reads_update_self         ON public.notice_reads;
-- 旧策略（第七/九部分建的）按 department 子查询判定，等价但多一层嵌套 RLS，统一改成辅助函数
DROP POLICY IF EXISTS "Users can read notice_reads of own dept" ON public.notice_reads;
DROP POLICY IF EXISTS "Users can insert own notice_reads"       ON public.notice_reads;
CREATE POLICY notice_reads_select_dept_or_self ON public.notice_reads
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id()
         OR public.is_presidium()
         OR notice_id IN (SELECT n.id FROM public.notices n WHERE n.department = public.my_department()));
CREATE POLICY notice_reads_insert_self ON public.notice_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = public.current_app_user_id());
CREATE POLICY notice_reads_update_self ON public.notice_reads
  FOR UPDATE TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());
-- 有意不建 DELETE 策略：已读记录随公告级联删除，没有单独删除入口

-- (b) notifications：三条策略沿用第八部分的产品语义（只读自己的、只改自己的、
--     给谁都能发），只把里层的「users 子查询」换成辅助函数——少一层嵌套 RLS，快且好读。
--     新名字与旧名字都要删：只删旧名字的话，本脚本**第二次执行**会在这里报
--     `42710 policy "notifications_select_own" for table "notifications" already exists` 并整份中断
--     （2026-09-12 真踩过：用户在补跑 Phase 3 后又跑了一次本部分）。`check-sql.mjs` 已加此检查。
DROP POLICY IF EXISTS "Users can read own notifications"             ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications"           ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS notifications_select_own         ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own          ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (user_id = public.current_app_user_id());
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());
-- 通知是跨用户协作的产物（指派任务 → 通知被指派人；审核 → 通知提交人；@提及 → 通知被提及者）。
-- 强制 created_by/user_id = 自己会让这些功能全部静默失败，故 INSERT 保持开放给全体登录用户。
-- 代价是「可以给任何人写通知」（骚扰面），属可接受的既有语义。
CREATE POLICY notifications_insert_authenticated ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);
-- 有意不建 DELETE 策略：通知只能读/标已读

-- (c) platform_guides：把三条写策略里的 `role IN ('dept_head',…)` 硬编码换成 role_level 口径
--     （两处写法同义，但硬编码那份会在新增角色时走散），并放行「播种行 created_by IS NULL」：
--     seedDefaultGuides 由任意用户首次打开使用指南时触发，写入的行没有 created_by，
--     若 INSERT 只认「负责人」，空库上的播种会失败（表现为使用指南空白）。
--     DROP + CREATE 相邻（这两张表的策略没有全量放行兜底，中间有毫秒级真空，可接受）。
--     同样新老名字都要删（见 (b) 的 42710 说明）。
DROP POLICY IF EXISTS "Dept head+ can insert guides" ON public.platform_guides;
DROP POLICY IF EXISTS "Dept head+ can update guides" ON public.platform_guides;
DROP POLICY IF EXISTS "Dept head+ can delete guides" ON public.platform_guides;
DROP POLICY IF EXISTS platform_guides_insert_seed_or_head ON public.platform_guides;
DROP POLICY IF EXISTS platform_guides_update_head         ON public.platform_guides;
DROP POLICY IF EXISTS platform_guides_delete_head         ON public.platform_guides;
CREATE POLICY platform_guides_insert_seed_or_head ON public.platform_guides
  FOR INSERT TO authenticated
  WITH CHECK (created_by IS NULL OR public.is_organizer());
CREATE POLICY platform_guides_update_head ON public.platform_guides
  FOR UPDATE TO authenticated
  USING (public.is_organizer())
  WITH CHECK (public.is_organizer());
CREATE POLICY platform_guides_delete_head ON public.platform_guides
  FOR DELETE TO authenticated USING (public.is_organizer());

-- ---- 5. users 防提权守卫（列级规则，策略表达不了，交给触发器）----
-- 为什么光有策略不够：users 的 UPDATE 策略必须放行「管理员改别人的 role」，
-- 而策略的 USING/WITH CHECK 看不到「这次更新动了哪些列」——同一个策略无法区分
-- 「改自己的昵称」和「把自己 role 改成 president」。故用 BEFORE UPDATE 触发器判列。
CREATE OR REPLACE FUNCTION public.trg_guard_users_privilege()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 运维脚本（service_role）与数据库直连不受限
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- auth_id 是账号与本库的唯一绑定点：可改＝可劫持（把自己的 auth_id 指向别人的 auth 用户，
  -- 或反过来把别人的行绑到自己身上）。除运维外一律不可变。
  IF NEW.auth_id IS DISTINCT FROM OLD.auth_id THEN
    RAISE EXCEPTION 'auth_id 不可修改（账号绑定关系由数据库维护）';
  END IF;

  -- 学号是身份锚点（登录邮箱 = 学号@stuunion.org），同样不可改
  IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION '学号不可修改（如需更正请联系管理员走运维脚本）';
  END IF;

  -- 角色与部门：只有管理员能改。这一条是整个收口的重中之重——
  -- 没有它，任何志愿者都能 `update users set role='president'` 一步登顶。
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.department IS DISTINCT FROM OLD.department)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION '只有主席 / 老师 / 开发者可以调整成员角色或部门';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_users_privilege ON public.users;
CREATE TRIGGER trg_guard_users_privilege
  BEFORE UPDATE OF role, department, student_id, auth_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_users_privilege();

-- 只改 name / avatar_url / contact_* / onboarded 的更新不会触发本触发器
--（BEFORE UPDATE OF 只在列出现在 SET 列表里时才触发），故资料编辑零开销。

-- ---- 6. 拆掉全量放行（**必须放在所有新策略之后**）----
-- 与第十六部分的建法对称：那一段是 FOR ALL USING(true) WITH CHECK(true) 一把梭，
-- 这里逐个摘掉。放在最后的原因见文件头 ④：permissive 策略是并集，先建后拆全程无真空期。
-- 漏摘一张表会被结尾验收表的「残留全量放行策略数 = 0」抓到。
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'invite_codes', 'tasks', 'task_submissions', 'notices',
    'school_notices', 'forum_posts', 'forum_replies', 'tickets',
    'ticket_records', 'task_templates', 'task_milestones',
    'department_guides', 'usage_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON public.%I', t);
  END LOOP;
END $$;

-- ---- 7. anon 纵深防御：连表级权限一起收回 ----
-- 第十六部分已经用 RLS 让 anon 读不到任何行，但 anon 手上依然握着 Supabase 建库时
-- 默认授予的表级 SELECT/INSERT/UPDATE/DELETE——「读不到」是策略兜住的，不是没权限。
-- 这里把表级权限也收掉，做到两道门都关上。零功能影响：登录前必需的 3 个查询
--（validate_invite_code / check_student_registered / verify_user_identity）都是
-- SECURITY DEFINER 函数，以属主身份读表，不需要 anon 有表权限。
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- 顺带堵住「未来新建函数默认 anon 可调」这个源头（本次实测的 anon 可调就是这么来的）。
-- 注意：默认权限只对**本语句执行者（postgres）之后创建的对象**生效；将来若要做
-- 登录前可用的新函数，必须像第十六部分那样显式 `GRANT EXECUTE … TO anon`。
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;

-- ---- 8. 刷新统计信息 ----
ANALYZE public.users;
ANALYZE public.invite_codes;
ANALYZE public.tasks;
ANALYZE public.task_submissions;
ANALYZE public.notices;
ANALYZE public.school_notices;
ANALYZE public.forum_posts;
ANALYZE public.forum_replies;
ANALYZE public.tickets;
ANALYZE public.ticket_records;
ANALYZE public.task_templates;
ANALYZE public.task_milestones;
ANALYZE public.department_guides;
ANALYZE public.usage_events;

-- ---- 9. 验收：执行完直接看这张表（「结果」列全为 [OK] 即通过）----
-- 与第十八/十九部分同理：DDL 成功时 SQL Editor 只显示「Success. No rows returned」。
-- 这条查询**只读**，不写任何数据。
-- 「策略数」列给的是**下限**（>=），将来加策略不会让这张表变红，但少一条一定会。
-- 2026-09-12 补：策略数为 0 有两种完全不同的原因——「表不存在」（整批数据层脚本没执行）与
-- 「表在但策略被删过」。前者曾把用户引到错误的排查方向（实测：forum_likes/forum_bookmarks
-- 两行 `[缺失] 只有 0 条`，真相是第十九部分压根没执行），所以这里分开报，并直接说明该跑哪份脚本。
WITH expected AS (
  SELECT * FROM (VALUES
    ('users', 2), ('invite_codes', 4), ('tasks', 3), ('task_submissions', 3),
    ('notices', 3), ('school_notices', 2), ('forum_posts', 4), ('forum_replies', 3),
    ('tickets', 2), ('ticket_records', 4), ('task_templates', 4), ('task_milestones', 4),
    ('department_guides', 3), ('usage_events', 2), ('notifications', 3),
    ('notice_reads', 3), ('platform_guides', 4), ('points_ledger', 1),
    ('forum_likes', 3), ('forum_bookmarks', 3)
  ) AS e(tbl, min_policies)
)
SELECT t."类型", t."对象", t."结果"
FROM (
  SELECT '策略数' AS "类型", e.tbl AS "对象",
    CASE
      WHEN to_regclass('public.' || e.tbl) IS NULL
        THEN '[缺失] 表不存在 —— 该表所属批次的数据层脚本还没执行（如 forum_likes / forum_bookmarks 属于第十九部分 supabase-phase3-v4.5.0.sql），先执行它再重跑本部分'
      WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = e.tbl) >= e.min_policies
        THEN '[OK] 策略 ' || (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = e.tbl)
             || '/' || e.min_policies
      ELSE '[缺失] 表在，但只有 ' || (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = e.tbl)
           || ' 条策略，应 >= ' || e.min_policies || '（重跑本部分脚本可恢复）'
    END AS "结果"
  FROM expected e
  UNION ALL
  SELECT '函数', 'register_user',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = 'register_user')
         THEN '[OK]' ELSE '[缺失]' END
  UNION ALL
  SELECT '权限', 'users 无 INSERT 策略（注册只能走 register_user）',
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT')
         THEN '[OK]' ELSE '[越权] users 仍有 INSERT 策略，任何人都能把自己写成 president' END
  UNION ALL
  SELECT '辅助函数', n.proname,
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                      WHERE ns.nspname = 'public' AND p.proname = n.proname)
         THEN '[OK]' ELSE '[缺失]' END
  FROM (VALUES ('my_department'), ('is_admin'), ('is_presidium'), ('is_dept_head_of'),
               ('can_view_post'), ('can_manage_post'), ('can_view_task'), ('can_review_task')) AS n(proname)
  UNION ALL
  SELECT '触发器', 'trg_guard_users_privilege',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger g WHERE NOT g.tgisinternal
                      AND g.tgname = 'trg_guard_users_privilege')
         THEN '[OK]' ELSE '[缺失]' END
  UNION ALL
  SELECT '权限', '残留全量放行策略',
    CASE WHEN (SELECT count(*) FROM pg_policies
               WHERE schemaname = 'public' AND policyname = 'authenticated_full_access') = 0
         THEN '[OK] 已全部拆除' ELSE '[缺失] 仍有 ' || (SELECT count(*) FROM pg_policies
               WHERE schemaname = 'public' AND policyname = 'authenticated_full_access') || ' 条' END
  UNION ALL
  SELECT '权限', 'anon 对表无任何权限',
    CASE WHEN NOT EXISTS (
           SELECT 1 FROM information_schema.table_privileges
           WHERE table_schema = 'public' AND grantee = 'anon')
         THEN '[OK]' ELSE '[缺失] 仍有 ' || (SELECT count(*) FROM information_schema.table_privileges
           WHERE table_schema = 'public' AND grantee = 'anon') || ' 条表级授权' END
  UNION ALL
  -- anon 不该再调得到这些函数（实测改前全是 200）
  SELECT '权限', 'anon 不可执行 ' || f.name,
    CASE WHEN NOT has_function_privilege('anon', f.sig, 'EXECUTE')
         THEN '[OK]' ELSE '[越权]' END
  FROM (VALUES
    ('role_level',              'public.role_level(text)'),
    ('is_organizer',            'public.is_organizer()'),
    ('semester_of',             'public.semester_of(timestamptz)'),
    ('grab_ticket',             'public.grab_ticket(uuid, uuid, text, text)'),
    ('check_in_ticket',         'public.check_in_ticket(text)'),
    ('ticket_qr_token',         'public.ticket_qr_token(uuid, integer)'),
    ('register_user',           'public.register_user(uuid, text, text, text)')
  ) AS f(name, sig)
  UNION ALL
  -- 反向自证：authenticated 仍必须能执行策略用到的判定函数，否则所有策略会报权限错
  SELECT '权限', 'authenticated 可执行 ' || f.name,
    CASE WHEN has_function_privilege('authenticated', f.sig, 'EXECUTE')
         THEN '[OK]' ELSE '[越权?] 策略会失效' END
  FROM (VALUES
    ('current_app_user_id()', 'public.current_app_user_id()'),
    ('role_level(text)',      'public.role_level(text)'),
    ('is_dept_head_of(text)', 'public.is_dept_head_of(text)'),
    ('can_view_task(uuid)',   'public.can_view_task(uuid)')
  ) AS f(name, sig)
) t
ORDER BY t."类型", t."对象";
