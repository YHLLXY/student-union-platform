-- ============================================================
-- supabase-verify-v4.6.0.sql —— Phase 4 权限收口自证脚本
--（核对第二十部分的细粒度 RLS 与 RPC 授权是否真的生效）
-- ============================================================
-- 用法：整段贴进 Supabase SQL Editor（正确项目 bbyykrgitgawqwdgcxhp）执行一次，
--       看最后一张结果表的「结果」列——全为 [OK] 即通过；出现 [缺失] / [越权] / [失败] 说明没生效。
-- 可反复执行；中途报错也没关系，重跑一次开头会先把上次的标记数据清掉。
--
-- **为什么必须有这份脚本**：单测与 E2E 打的是本地 dev-stub，而 stub 不实现 RLS
--（它只保证报文形态），所以「策略到底写对了没有」在自动化测试里**无法被验证**。
-- 唯一能验证的办法就是拿真实角色去撞真实策略——也就是本脚本做的事。
--
-- 本脚本对数据做了什么（先说清楚，不藏）：
--   · 第一段「结构核对」纯只读（只查 pg_catalog 与 information_schema）；
--   · 第二段「语义冒充」要真的去撞策略，因此会**短暂插入几行标记数据**
--     （标题/备注带 `__RLS自证标记__`，用于验证「负责人能审本部门提交、不能审他部门提交」
--     这类跨表条件），结尾全部删除；
--   · 所有「允许类」的更新探测一律用 `SET 列 = 列` 的无变化写法，不产生真实改动；
--     唯一会真实改值的两条（管理员改角色）在探测内**立刻**用补偿语句改回；
--   · 末尾第三段会核对「标记数据 0 残留」与「被冒充的志愿者仍是志愿者」。
--
-- 角色冒充手法：`SET ROLE authenticated` + 注入 `request.jwt.claims` 的 sub。
--   Postgres 只禁止在 SECURITY DEFINER 函数里切换角色，DO 块是 invoker，故可用；
--   若本会话确实无权切换，第二段会打印一行 [跳过] 并说明，不会让脚本整体失败。

-- ---- 0. 本次自证用的临时表（只在本会话可见，断开即消失）----
DROP TABLE IF EXISTS pg_temp._rls_verify;
DROP TABLE IF EXISTS pg_temp._rls_probe;
DROP TABLE IF EXISTS pg_temp._rls_marker;

CREATE TEMP TABLE _rls_verify (
  phase    text,      -- 一、结构 / 二、语义 / 三、清理
  seq      integer,
  label    text,      -- 探测项
  expected text,      -- 期望
  actual   text,      -- 实测
  ok       boolean
);

CREATE TEMP TABLE _rls_probe (
  seq      integer,
  persona  text,       -- volunteer / dept_head / president
  uid      uuid,       -- 冒充谁的 users.id
  auth_id  uuid,       -- 对应 auth.users.id（写进 jwt claims）
  label    text,
  sql      text,       -- 必须以「返回一个整数」的形式给出（行数或可见行数）
  expect   text,       -- 'deny'（必须被拒）或整数字符串（必须等于该行数）
  undo     text        -- 以 postgres 身份执行的补偿语句（可为空串）
);

CREATE TEMP TABLE _rls_marker (kind text, id uuid);

-- ============================================================
-- 一、结构核对（纯只读）：策略清单 / 残留 / anon 权限 / 函数授权
-- ============================================================
DO $$
DECLARE
  t record;
  f record;
  v_missing text;
  v_cnt integer;
  v_pub integer;
BEGIN
  -- 1.1 逐表核对策略清单（按名字逐个点，少一条就点出来）
  FOR t IN
    SELECT * FROM (VALUES
      ('users',             ARRAY['users_select_all','users_update_self_or_admin']),
      ('invite_codes',      ARRAY['invite_codes_select_dept','invite_codes_insert_dept','invite_codes_update_dept','invite_codes_delete_dept']),
      ('tasks',             ARRAY['tasks_select_all','tasks_insert_organizer','tasks_update_participant']),
      ('task_submissions',  ARRAY['task_submissions_select_visible','task_submissions_insert_self','task_submissions_update_reviewer']),
      ('notices',           ARRAY['notices_select_dept','notices_insert_dept','notices_update_dept']),
      ('school_notices',    ARRAY['school_notices_select_all','school_notices_insert_presidium']),
      ('forum_posts',       ARRAY['forum_posts_select_visible','forum_posts_insert_self','forum_posts_update_manager','forum_posts_delete_manager']),
      ('forum_replies',     ARRAY['forum_replies_select_visible','forum_replies_insert_self','forum_replies_delete_own_or_manager']),
      ('tickets',           ARRAY['tickets_select_all','tickets_insert_organizer']),
      ('ticket_records',    ARRAY['ticket_records_select_all','ticket_records_insert_self','ticket_records_update_organizer','ticket_records_delete_self']),
      ('task_templates',    ARRAY['task_templates_select_dept','task_templates_insert_dept','task_templates_update_dept','task_templates_delete_dept']),
      ('task_milestones',   ARRAY['task_milestones_select_visible','task_milestones_insert_manager','task_milestones_update_visible','task_milestones_delete_manager']),
      ('department_guides', ARRAY['department_guides_select_dept','department_guides_insert_dept','department_guides_update_dept']),
      ('usage_events',      ARRAY['usage_events_select_admin','usage_events_insert_self']),
      ('notifications',     ARRAY['notifications_select_own','notifications_update_own','notifications_insert_authenticated']),
      ('notice_reads',      ARRAY['notice_reads_select_dept_or_self','notice_reads_insert_self','notice_reads_update_self']),
      ('platform_guides',   ARRAY['platform_guides_insert_seed_or_head','platform_guides_update_head','platform_guides_delete_head'])
    ) AS x(tbl, names)
  LOOP
    SELECT string_agg(n, ', ' ORDER BY n) INTO v_missing
    FROM unnest(t.names) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t.tbl AND p.policyname = n
    );

    SELECT count(*) INTO v_cnt FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t.tbl;

    INSERT INTO _rls_verify VALUES (
      '一、结构', 100, '策略清单 ' || t.tbl,
      array_length(t.names, 1) || ' 条关键策略',
      CASE WHEN v_missing IS NULL THEN '[OK] 该表共 ' || v_cnt || ' 条策略'
           ELSE '[缺失] ' || v_missing END,
      v_missing IS NULL
    );
  END LOOP;

  -- 1.2 旧的全量放行必须清零
  SELECT count(*) INTO v_cnt FROM pg_policies
  WHERE schemaname = 'public' AND policyname = 'authenticated_full_access';
  INSERT INTO _rls_verify VALUES (
    '一、结构', 110, '旧的全量放行策略', '0 条',
    CASE WHEN v_cnt = 0 THEN '[OK] 已全部拆除' ELSE '[缺失] 仍残留 ' || v_cnt || ' 条' END,
    v_cnt = 0
  );

  -- 1.3 本次新建的策略必须都限定 TO authenticated
  --（不写 TO 就是 TO PUBLIC，对 anon 也生效，与「anon 一律拒绝」的姿态相悖）
  SELECT count(*) INTO v_pub FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('users','invite_codes','tasks','task_submissions','notices','school_notices',
                      'forum_posts','forum_replies','tickets','ticket_records','task_templates',
                      'task_milestones','department_guides','usage_events','notifications',
                      'notice_reads','platform_guides')
    AND (roles IS NULL OR 'public' = ANY (roles));
  INSERT INTO _rls_verify VALUES (
    '一、结构', 111, '本次策略的生效角色', '0 条对 PUBLIC 生效',
    CASE WHEN v_pub = 0 THEN '[OK] 全部限定 TO authenticated'
         ELSE '[提示] ' || v_pub || ' 条对 PUBLIC 生效（anon 已无表权限，暂无风险，建议限定角色）' END,
    v_pub = 0
  );

  -- 1.4 防提权守卫触发器
  INSERT INTO _rls_verify VALUES (
    '一、结构', 120, '触发器 trg_guard_users_privilege', '存在',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_guard_users_privilege')
         THEN '[OK]' ELSE '[缺失]' END,
    EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_guard_users_privilege')
  );

  -- 1.5 新增的注册函数
  INSERT INTO _rls_verify VALUES (
    '一、结构', 121, '函数 register_user', '存在',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = 'register_user')
         THEN '[OK]' ELSE '[缺失] 注册会退回旧直插写法' END,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'register_user')
  );

  -- 1.5b users 必须没有 INSERT 策略：留一条 `WITH CHECK (auth_id = auth.uid())` 看着无害，
  --      但 role 是请求体带来的 —— 等于允许任何人把自己注册成 president。
  INSERT INTO _rls_verify VALUES (
    '一、结构', 122, 'users 无 INSERT 策略（注册只能走 register_user）', '0 条',
    CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT')
         THEN '[OK]' ELSE '[越权] 任何人都能直接插入自己那行并自选角色' END,
    NOT EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT')
  );

  -- 1.6 八个策略辅助函数
  FOR f IN
    SELECT * FROM (VALUES ('my_department()'), ('is_admin()'), ('is_presidium()'), ('is_dept_head_of(text)'),
                           ('can_view_post(uuid)'), ('can_manage_post(uuid)'), ('can_view_task(uuid)'), ('can_review_task(uuid)')) AS x(sig)
  LOOP
    INSERT INTO _rls_verify VALUES (
      '一、结构', 130, '辅助函数 ' || f.sig, '存在',
      CASE WHEN to_regprocedure('public.' || f.sig) IS NOT NULL THEN '[OK]' ELSE '[缺失]' END,
      to_regprocedure('public.' || f.sig) IS NOT NULL
    );
  END LOOP;

  -- 1.7 anon 不该再有表级权限
  SELECT count(*) INTO v_cnt FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND grantee = 'anon';
  INSERT INTO _rls_verify VALUES (
    '一、结构', 140, 'anon 的表级权限', '0 条',
    CASE WHEN v_cnt = 0 THEN '[OK] 已全部收回' ELSE '[越权] 仍有 ' || v_cnt || ' 条' END,
    v_cnt = 0
  );

  -- 1.8 anon 不该能执行这些函数
  --（改前用 anon key 直打 REST 实测：role_level / is_organizer / semester_of / check_in_ticket /
  --  ticket_qr_token 全部 HTTP 200，即 Supabase 的默认授权让 anon 可调后建的函数）
  FOR f IN
    SELECT * FROM (VALUES
      ('role_level(text)',                 'public.role_level(text)'),
      ('is_organizer()',                   'public.is_organizer()'),
      ('current_app_user_id()',            'public.current_app_user_id()'),
      ('semester_of(timestamptz)',         'public.semester_of(timestamptz)'),
      ('grab_ticket(uuid,uuid,text,text)', 'public.grab_ticket(uuid, uuid, text, text)'),
      ('check_in_ticket(text)',            'public.check_in_ticket(text)'),
      ('ticket_qr_token(uuid,integer)',    'public.ticket_qr_token(uuid, integer)'),
      ('register_user(uuid,text,text,text)','public.register_user(uuid, text, text, text)')
    ) AS x(name, sig)
  LOOP
    INSERT INTO _rls_verify VALUES (
      '一、结构', 150, 'anon 不可执行 ' || f.name, '拒绝',
      CASE WHEN to_regprocedure(f.sig) IS NULL THEN '[—] 函数不存在，跳过'
           WHEN has_function_privilege('anon', f.sig, 'EXECUTE') THEN '[越权] anon 仍可执行'
           ELSE '[OK]' END,
      to_regprocedure(f.sig) IS NOT NULL AND NOT has_function_privilege('anon', f.sig, 'EXECUTE')
    );
  END LOOP;

  -- 1.9 反向自证：authenticated 必须能执行策略用到的判定函数
  --（策略表达式以当前用户身份求值，收回了这些权限会让**所有**策略报 42501）
  FOR f IN
    SELECT * FROM (VALUES
      ('current_app_user_id()', 'public.current_app_user_id()'),
      ('current_app_role()',    'public.current_app_role()'),
      ('role_level(text)',      'public.role_level(text)'),
      ('my_department()',       'public.my_department()'),
      ('is_admin()',            'public.is_admin()'),
      ('is_presidium()',        'public.is_presidium()'),
      ('is_dept_head_of(text)', 'public.is_dept_head_of(text)'),
      ('can_view_task(uuid)',   'public.can_view_task(uuid)')
    ) AS x(name, sig)
  LOOP
    INSERT INTO _rls_verify VALUES (
      '一、结构', 160, 'authenticated 可执行 ' || f.name, '允许',
      CASE WHEN has_function_privilege('authenticated', f.sig, 'EXECUTE') THEN '[OK]'
           ELSE '[缺失] 策略会整体报权限错' END,
      has_function_privilege('authenticated', f.sig, 'EXECUTE')
    );
  END LOOP;

  -- 1.10 有意保留 anon 的三个登录前函数（缺一个登录/注册就断）
  FOR f IN
    SELECT * FROM (VALUES
      ('validate_invite_code(text)',      'public.validate_invite_code(text)'),
      ('check_student_registered(text)',  'public.check_student_registered(text)'),
      ('verify_user_identity(text,text)', 'public.verify_user_identity(text, text)')
    ) AS x(name, sig)
  LOOP
    INSERT INTO _rls_verify VALUES (
      '一、结构', 170, 'anon 仍可执行 ' || f.name || '（登录前必需）', '允许',
      CASE WHEN has_function_privilege('anon', f.sig, 'EXECUTE') THEN '[OK]'
           ELSE '[缺失] 登录/注册流程会断' END,
      has_function_privilege('anon', f.sig, 'EXECUTE')
    );
  END LOOP;
END $$;

-- ============================================================
-- 二、语义冒充：拿真实角色去撞真实策略
-- ============================================================
-- 第一段（仍是 postgres 身份）：解析三个角色的样本用户、算出期望值、生成探测清单。
-- 期望值必须在**切换角色之前**算出来——postgres 是表属主，天然绕过 RLS，
-- 这样算出来的才是「不受策略影响」的真值。
DO $$
DECLARE
  v_vol   record; v_head record; v_pres record;
  v_dept  text; v_other_dept text;
  v_post_other uuid; v_post_own uuid;
  v_task_own uuid; v_task_other uuid;
  v_sub_own uuid; v_sub_other uuid;
  v_ticket uuid;
  e_notices_dept integer; e_posts_mine integer; e_posts_all integer;

  e_codes_dept integer; e_codes_all integer; e_templates_dept integer;
  e_notifs_mine integer; e_events_all integer;
  e_records_all integer; e_school_all integer; e_tickets_all integer;
  e_subs_vol integer;
BEGIN
  -- 清理上次运行可能残留的标记数据（上次中途报错时留下的）
  DELETE FROM public.task_submissions WHERE note = '__RLS自证标记__';
  DELETE FROM public.tasks            WHERE title LIKE '__RLS自证标记__%';
  DELETE FROM public.forum_posts      WHERE title LIKE '__RLS自证标记__%';
  DELETE FROM public.notices          WHERE title = '__RLS自证标记__';
  DELETE FROM public.school_notices   WHERE title = '__RLS自证标记__';
  DELETE FROM public.invite_codes     WHERE code = '__RLS_SELFCHECK__';
  DELETE FROM public.ticket_records   WHERE student_id = '__RLS_SELFCHECK__';

  SELECT id, auth_id, department, role INTO v_vol  FROM public.users
   WHERE role = 'volunteer' AND auth_id IS NOT NULL ORDER BY created_at LIMIT 1;
  SELECT id, auth_id, department, role INTO v_head FROM public.users
   WHERE role = 'dept_head' AND auth_id IS NOT NULL AND department <> '' ORDER BY created_at LIMIT 1;
  SELECT id, auth_id, department, role INTO v_pres FROM public.users
   WHERE role IN ('president','teacher') AND auth_id IS NOT NULL ORDER BY created_at LIMIT 1;

  IF v_vol.id IS NULL OR v_head.id IS NULL THEN
    INSERT INTO _rls_verify VALUES ('二、语义', 0, '角色样本', '志愿者与部门负责人各一名',
      '[跳过] 库内缺少 volunteer，或缺少 department 非空的 dept_head，无法冒充', false);
    RETURN;
  END IF;

  v_dept := v_head.department;
  SELECT department INTO v_other_dept FROM public.users
   WHERE department <> '' AND department <> v_dept LIMIT 1;
  v_other_dept := COALESCE(v_other_dept, v_dept);

  -- ---- 标记数据：全部由 postgres 插入（绕过 RLS），仅供探测，结尾删除 ----
  INSERT INTO public.forum_posts (title, content, category, department, created_by)
  VALUES ('__RLS自证标记__本部门他人帖', '自证脚本临时数据，运行结束即删除', 'discussion', v_dept, v_pres.id)
  RETURNING id INTO v_post_other;

  INSERT INTO public.forum_posts (title, content, category, department, created_by)
  VALUES ('__RLS自证标记__他部门帖', '自证脚本临时数据，运行结束即删除', 'discussion', v_other_dept, v_pres.id)
  RETURNING id INTO v_post_own;

  INSERT INTO public.tasks (title, content, priority, status, assigned_department, created_by)
  VALUES ('__RLS自证标记__本部门任务', '自证脚本临时数据', 'normal', 'review', v_dept, v_pres.id)
  RETURNING id INTO v_task_own;

  INSERT INTO public.tasks (title, content, priority, status, assigned_department, created_by)
  VALUES ('__RLS自证标记__他部门任务', '自证脚本临时数据', 'normal', 'review', v_other_dept, v_pres.id)
  RETURNING id INTO v_task_other;

  INSERT INTO public.task_submissions (task_id, user_id, note, status)
  VALUES (v_task_own, v_vol.id, '__RLS自证标记__', 'submitted') RETURNING id INTO v_sub_own;

  INSERT INTO public.task_submissions (task_id, user_id, note, status)
  VALUES (v_task_other, v_vol.id, '__RLS自证标记__', 'submitted') RETURNING id INTO v_sub_other;

  INSERT INTO _rls_marker VALUES
    ('forum_posts', v_post_other), ('forum_posts', v_post_own),
    ('tasks', v_task_own), ('tasks', v_task_other),
    ('task_submissions', v_sub_own), ('task_submissions', v_sub_other);

  -- 退票探测不能拿真票去试（策略若失效会删掉真数据），故造一张挂在负责人名下、
  -- 且他本人没有的标记票券；探测完立刻删掉。
  SELECT t.id INTO v_ticket FROM public.tickets t
   WHERE NOT EXISTS (SELECT 1 FROM public.ticket_records r WHERE r.ticket_id = t.id AND r.user_id = v_head.id)
   LIMIT 1;
  IF v_ticket IS NOT NULL THEN
    INSERT INTO public.ticket_records (ticket_id, user_id, student_id, name)
    VALUES (v_ticket, v_head.id, '__RLS_SELFCHECK__', '__RLS自证标记__');
    INSERT INTO _rls_marker VALUES ('ticket_records', v_ticket);
  END IF;

  -- ---- 期望值（postgres 视角 = 不受 RLS 影响的真值）----
  SELECT count(*) INTO e_notices_dept   FROM public.notices       WHERE department = v_dept;
  SELECT count(*) INTO e_posts_all      FROM public.forum_posts;
  SELECT count(*) INTO e_codes_dept     FROM public.invite_codes  WHERE department = v_dept;
  SELECT count(*) INTO e_codes_all      FROM public.invite_codes;
  SELECT count(*) INTO e_templates_dept FROM public.task_templates WHERE department = v_dept;
  SELECT count(*) INTO e_events_all     FROM public.usage_events;
  SELECT count(*) INTO e_records_all    FROM public.ticket_records;
  SELECT count(*) INTO e_school_all     FROM public.school_notices;
  SELECT count(*) INTO e_tickets_all    FROM public.tickets;
  SELECT count(*) INTO e_notifs_mine    FROM public.notifications  WHERE user_id = v_vol.id;
  -- 帖子可见性：本部门 ∪ 协同部门（志愿者与负责人同口径；主席团及以上另算）
  SELECT count(*) INTO e_posts_mine FROM public.forum_posts f
   WHERE f.department = v_vol.department
      OR v_vol.department = ANY (f.collaborating_departments);
  -- 提交可见性（志愿者）：自己的 ∪ 看得到该任务的人
  SELECT count(*) INTO e_subs_vol FROM public.task_submissions s
   WHERE s.user_id = v_vol.id
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = s.task_id
                 AND (t.assigned_to = v_vol.id OR t.created_by = v_vol.id
                      OR t.assigned_department = v_vol.department));

  -- ---- 探测清单 ----
  INSERT INTO _rls_probe VALUES
  -- ① 志愿者：读侧（含「有意保持全量」的几张表，用来确认没被误收紧）
  (10, 'volunteer', v_vol.id, v_vol.auth_id, '读本部门公告（应等于本部门公告数）',
   format('SELECT (count(*) = %s)::int FROM public.notices', e_notices_dept), '1', ''),
  (11, 'volunteer', v_vol.id, v_vol.auth_id, '读全校公告（有意全量）',
   format('SELECT (count(*) = %s)::int FROM public.school_notices', e_school_all), '1', ''),
  (12, 'volunteer', v_vol.id, v_vol.auth_id, '读邀请码（应读不到）',
   'SELECT count(*)::int FROM public.invite_codes', '0', ''),
  (13, 'volunteer', v_vol.id, v_vol.auth_id, '读任务模板（应读不到）',
   'SELECT count(*)::int FROM public.task_templates', '0', ''),
  (14, 'volunteer', v_vol.id, v_vol.auth_id, '读埋点/错误日志（应读不到）',
   'SELECT count(*)::int FROM public.usage_events', '0', ''),
  (15, 'volunteer', v_vol.id, v_vol.auth_id, '读通知（只该看到自己的）',
   format('SELECT (count(*) = %s)::int FROM public.notifications', e_notifs_mine), '1', ''),
  (16, 'volunteer', v_vol.id, v_vol.auth_id, '读帖子（本部门 ∪ 协同部门）',
   format('SELECT (count(*) = %s)::int FROM public.forum_posts', e_posts_mine), '1', ''),
  (17, 'volunteer', v_vol.id, v_vol.auth_id, '读票券行（有意全量：人人都要算剩余票数）',
   format('SELECT (count(*) = %s)::int FROM public.ticket_records', e_records_all), '1', ''),
  (18, 'volunteer', v_vol.id, v_vol.auth_id, '读提交记录（自己的 ∪ 看得到任务的）',
   format('SELECT (count(*) = %s)::int FROM public.task_submissions', e_subs_vol), '1', ''),
  -- ② 志愿者：写侧（本次收口的重点）
  (20, 'volunteer', v_vol.id, v_vol.auth_id, '改自己的昵称（无变化写入，应放行）',
   'WITH x AS (UPDATE public.users SET name = name WHERE id = public.current_app_user_id() RETURNING 1) SELECT count(*)::int FROM x', '1', ''),
  (21, 'volunteer', v_vol.id, v_vol.auth_id, '改别人的昵称（应 0 行）',
   format('WITH x AS (UPDATE public.users SET name = name WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_head.id), '0', ''),
  (22, 'volunteer', v_vol.id, v_vol.auth_id, '给自己提权为 president（守卫必须拒绝）',
   'WITH x AS (UPDATE public.users SET role = ''president'' WHERE id = public.current_app_user_id() RETURNING 1) SELECT count(*)::int FROM x',
   'deny', format('UPDATE public.users SET role = ''volunteer'' WHERE id = %L', v_vol.id)),
  (23, 'volunteer', v_vol.id, v_vol.auth_id, '插入公告（应被拒）',
   format('WITH x AS (INSERT INTO public.notices (title, department, created_by) VALUES (''__RLS自证标记__'', %L, public.current_app_user_id()) RETURNING 1) SELECT count(*)::int FROM x', v_dept), 'deny', ''),
  (24, 'volunteer', v_vol.id, v_vol.auth_id, '发布任务（应被拒）',
   format('WITH x AS (INSERT INTO public.tasks (title, assigned_department, created_by) VALUES (''__RLS自证标记__'', %L, public.current_app_user_id()) RETURNING 1) SELECT count(*)::int FROM x', v_dept), 'deny', ''),
  (25, 'volunteer', v_vol.id, v_vol.auth_id, '生成邀请码（应被拒）',
   format('WITH x AS (INSERT INTO public.invite_codes (code, department) VALUES (''__RLS_SELFCHECK__'', %L) RETURNING 1) SELECT count(*)::int FROM x', v_dept), 'deny', ''),
  (26, 'volunteer', v_vol.id, v_vol.auth_id, '发校级公告（应被拒）',
   'WITH x AS (INSERT INTO public.school_notices (title, created_by) VALUES (''__RLS自证标记__'', public.current_app_user_id()) RETURNING 1) SELECT count(*)::int FROM x', 'deny', ''),
  (33, 'volunteer', v_vol.id, v_vol.auth_id, '直插 users 把自己写成 president（应被拒）',
   'WITH x AS (INSERT INTO public.users (auth_id, name, student_id, role) VALUES (auth.uid(), ''__RLS自证标记__'', ''__RLS_SELFCHECK__'', ''president'') RETURNING 1) SELECT count(*)::int FROM x',
   'deny', 'DELETE FROM public.users WHERE student_id = ''__RLS_SELFCHECK__'''),
  (27, 'volunteer', v_vol.id, v_vol.auth_id, '删本部门的他人帖（应 0 行）',
   format('WITH x AS (DELETE FROM public.forum_posts WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_post_other), '0', ''),
  (28, 'volunteer', v_vol.id, v_vol.auth_id, '给自己点赞（应放行）',
   format('WITH x AS (INSERT INTO public.forum_likes (post_id, user_id) VALUES (%L, public.current_app_user_id()) ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*)::int FROM x', v_post_other), '1',
   format('DELETE FROM public.forum_likes WHERE post_id = %L AND user_id = %L', v_post_other, v_vol.id)),
  (29, 'volunteer', v_vol.id, v_vol.auth_id, '以别人的名义点赞（应被拒）',
   format('WITH x AS (INSERT INTO public.forum_likes (post_id, user_id) VALUES (%L, %L) RETURNING 1) SELECT count(*)::int FROM x', v_post_other, v_head.id), 'deny',
   format('DELETE FROM public.forum_likes WHERE post_id = %L AND user_id = %L', v_post_other, v_head.id)),
  (30, 'volunteer', v_vol.id, v_vol.auth_id, '退别人的票（应 0 行；针对自造标记票券）',
   format('WITH x AS (DELETE FROM public.ticket_records WHERE user_id = %L RETURNING 1) SELECT count(*)::int FROM x', v_head.id), '0', ''),
  -- ③ 部门负责人
  (40, 'dept_head', v_head.id, v_head.auth_id, '读本部门邀请码（应等于本部门条数）',
   format('SELECT (count(*) = %s)::int FROM public.invite_codes', e_codes_dept), '1', ''),
  (41, 'dept_head', v_head.id, v_head.auth_id, '读本部门任务模板（应等于本部门条数）',
   format('SELECT (count(*) = %s)::int FROM public.task_templates', e_templates_dept), '1', ''),
  (42, 'dept_head', v_head.id, v_head.auth_id, '读埋点数据（非管理员，应读不到）',
   'SELECT count(*)::int FROM public.usage_events', '0', ''),
  (43, 'dept_head', v_head.id, v_head.auth_id, '审本部门任务的提交（应能改到标记行）',
   format('WITH x AS (UPDATE public.task_submissions SET note = note WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_sub_own), '1', ''),
  (44, 'dept_head', v_head.id, v_head.auth_id, '审他部门任务的提交（应 0 行）',
   format('WITH x AS (UPDATE public.task_submissions SET note = note WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_sub_other), '0', ''),
  (45, 'dept_head', v_head.id, v_head.auth_id, '置顶本部门的他人帖（应放行；pinned_at 无变化）',
   format('WITH x AS (UPDATE public.forum_posts SET pinned_at = pinned_at WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_post_other), '1', ''),
  (46, 'dept_head', v_head.id, v_head.auth_id, '改他部门帖的协同部门（应 0 行）',
   format('WITH x AS (UPDATE public.forum_posts SET collaborating_departments = collaborating_departments WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_post_own), '0', ''),
  (47, 'dept_head', v_head.id, v_head.auth_id, '改成员角色（只有管理员可以；策略层就拦掉 → 0 行）',
   format('WITH x AS (UPDATE public.users SET role = ''dept_head'' WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_vol.id), '0',
   format('UPDATE public.users SET role = ''volunteer'' WHERE id = %L', v_vol.id)),
  (48, 'dept_head', v_head.id, v_head.auth_id, '改别人的昵称（应 0 行）',
   format('WITH x AS (UPDATE public.users SET name = name WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_vol.id), '0', '');

  -- ④ 主席 / 老师（管理员）——没有这个角色的账号就整段跳过
  IF v_pres.id IS NOT NULL THEN
    INSERT INTO _rls_probe VALUES
    (60, 'president', v_pres.id, v_pres.auth_id, '插入公告（管理员可发，随即删掉标记行）',
     format('WITH x AS (INSERT INTO public.notices (title, department, created_by) VALUES (''__RLS自证标记__'', %L, public.current_app_user_id()) RETURNING 1) SELECT count(*)::int FROM x', v_dept), '1',
     'DELETE FROM public.notices WHERE title = ''__RLS自证标记__'''),
    (61, 'president', v_pres.id, v_pres.auth_id, '读全部帖子（应等于全库条数）',
     format('SELECT (count(*) = %s)::int FROM public.forum_posts', e_posts_all), '1', ''),
    (62, 'president', v_pres.id, v_pres.auth_id, '读全部邀请码（应等于全库条数）',
     format('SELECT (count(*) = %s)::int FROM public.invite_codes', e_codes_all), '1', ''),
    (63, 'president', v_pres.id, v_pres.auth_id, '读埋点数据（应等于全库条数）',
     format('SELECT (count(*) = %s)::int FROM public.usage_events', e_events_all), '1', ''),
    (64, 'president', v_pres.id, v_pres.auth_id, '删任意帖（应放行，删的是标记帖）',
     format('WITH x AS (DELETE FROM public.forum_posts WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_post_own), '1', ''),
    (65, 'president', v_pres.id, v_pres.auth_id, '改成员角色（应放行；改完立刻还原）',
     format('WITH x AS (UPDATE public.users SET role = ''dept_head'' WHERE id = %L RETURNING 1) SELECT count(*)::int FROM x', v_vol.id), '1',
     format('UPDATE public.users SET role = %L WHERE id = %L', v_vol.role, v_vol.id));
  END IF;

  INSERT INTO _rls_verify VALUES ('二、语义', 1, '角色样本',
    'volunteer / dept_head / president 各一名',
    format('volunteer=%s(%s) · dept_head=%s(%s) · president=%s',
           left(v_vol.id::text, 8), COALESCE(NULLIF(v_vol.department, ''), '无部门'),
           left(v_head.id::text, 8), v_dept,
           COALESCE(left(v_pres.id::text, 8), '无此角色账号')),
    true);
END $$;

-- ---- 第二段：逐条执行（每条自己切换角色，跑完立刻切回）----
DO $$
DECLARE
  p record;
  n integer;
  v_ok boolean;
  v_actual text;
  v_role_ok boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    EXECUTE 'RESET ROLE';
    v_role_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_role_ok := false;
  END;

  IF NOT v_role_ok THEN
    INSERT INTO _rls_verify VALUES ('二、语义', 999, '角色冒充', '可切换角色',
      '[跳过] 本会话无权 SET ROLE，第二段无法执行；第一段结构核对结果仍然有效', false);
    RETURN;
  END IF;

  FOR p IN SELECT * FROM _rls_probe ORDER BY seq LOOP
    v_ok := false;
    v_actual := '';

    -- 注入 JWT 身份（自定义 GUC 跨 SET ROLE 保持），再切到 authenticated 让策略生效
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p.auth_id::text, 'role', 'authenticated')::text, false);
    EXECUTE 'SET ROLE authenticated';

    BEGIN
      EXECUTE p.sql INTO n;
      IF p.expect = 'deny' THEN
        v_actual := format('放行（影响 %s 行）——本应被拒', n);
      ELSE
        v_ok := (n::text = p.expect);
        v_actual := n::text || ' 行' || CASE WHEN v_ok THEN '' ELSE '（期望 ' || p.expect || ' 行）' END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      IF p.expect = 'deny' THEN
        v_ok := true;
        v_actual := '已拒绝（SQLSTATE ' || SQLSTATE || '）';
      ELSE
        v_ok := false;
        v_actual := format('被拒（%s：%s）——本应放行', SQLSTATE, left(SQLERRM, 60));
      END IF;
    END;

    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', false);

    IF p.undo <> '' THEN
      BEGIN
        EXECUTE p.undo;
      EXCEPTION WHEN OTHERS THEN
        v_ok := false;
        v_actual := v_actual || ' · 补偿语句失败(' || SQLSTATE || ')';
      END;
    END IF;

    INSERT INTO _rls_verify VALUES (
      '二、语义', p.seq, p.persona || ' · ' || p.label,
      CASE WHEN p.expect = 'deny' THEN '拒绝' ELSE p.expect || ' 行' END,
      v_actual, v_ok
    );
  END LOOP;
END $$;

-- ---- 第三段：清理标记数据，并自证没在业务数据上留下改动 ----
DO $$
DECLARE
  v_left integer;
  v_esc integer;
BEGIN
  DELETE FROM public.task_submissions WHERE note = '__RLS自证标记__';
  DELETE FROM public.tasks            WHERE title LIKE '__RLS自证标记__%';
  DELETE FROM public.forum_posts      WHERE title LIKE '__RLS自证标记__%';
  DELETE FROM public.notices          WHERE title = '__RLS自证标记__';
  DELETE FROM public.school_notices   WHERE title = '__RLS自证标记__';
  DELETE FROM public.invite_codes     WHERE code = '__RLS_SELFCHECK__';
  DELETE FROM public.ticket_records   WHERE student_id = '__RLS_SELFCHECK__';
  DELETE FROM public.forum_likes l USING public.forum_posts f
   WHERE l.post_id = f.id AND f.title LIKE '__RLS自证标记__%';
  DELETE FROM public.forum_likes l USING _rls_marker m
   WHERE l.post_id = m.id AND m.kind = 'forum_posts';

  -- 标记数据残留（被「管理员删帖」探测删掉的行自然不算残留）
  SELECT count(*) INTO v_left FROM _rls_marker m
   WHERE (m.kind = 'forum_posts'      AND EXISTS (SELECT 1 FROM public.forum_posts      x WHERE x.id = m.id AND x.title LIKE '__RLS自证标记__%'))
      OR (m.kind = 'tasks'            AND EXISTS (SELECT 1 FROM public.tasks            x WHERE x.id = m.id AND x.title LIKE '__RLS自证标记__%'))
      OR (m.kind = 'task_submissions' AND EXISTS (SELECT 1 FROM public.task_submissions x WHERE x.id = m.id AND x.note = '__RLS自证标记__'));

  -- 被冒充的志愿者必须还是志愿者（探测 22 若守卫失效会留下提权）
  SELECT count(*) INTO v_esc FROM public.users u
   WHERE u.id IN (SELECT p.uid FROM _rls_probe p WHERE p.persona = 'volunteer')
     AND u.role <> 'volunteer';

  INSERT INTO _rls_verify VALUES
    ('三、清理', 200, '临时标记数据', '0 行残留',
     CASE WHEN v_left = 0 THEN '[OK] 已清空' ELSE '[注意] 仍有 ' || v_left || ' 行，重跑一次本脚本' END,
     v_left = 0),
    ('三、清理', 201, '业务数据未被改动', '无残留变更',
     CASE WHEN v_esc = 0 THEN '[OK] 角色未被改动' ELSE '[严重] 有 ' || v_esc || ' 个账号被留成非 volunteer，请手工改回' END,
     v_esc = 0),
    ('三、清理', 202, '本次自证未覆盖的范围', '知悉即可',
     '[提示] 不含 Storage 策略（头像/附件，见第十部分的 storage.objects 策略）与 Realtime 订阅；两者不随本次 RLS 改动而变化', true);
END $$;

-- ---- 结果：看「结果」列，全为 [OK] 即通过 ----
SELECT
  phase    AS "阶段",
  seq      AS "序",
  label    AS "探测项",
  expected AS "期望",
  actual   AS "实测",
  CASE WHEN ok THEN '[OK]' ELSE '[失败]' END AS "结果"
FROM _rls_verify
ORDER BY phase, seq;

-- 结果怎么读（写给执行者）：
--   · 全为 [OK]                → 策略与预期一致，权限收口生效；
--   · [失败]（写侧探测被放行）  → 策略没生效，确认是不是在正确项目里执行了 supabase-phase4-v4.6.0.sql；
--   · [缺失]                   → 对应策略/函数没建成功，把 supabase-phase4-v4.6.0.sql 重跑一遍；
--   · [越权]                   → anon 仍有权限，重点看 1.7 / 1.8 两段；
--   · 第一段全 OK、第二段整段 [跳过] → 只是当前会话不允许切换角色，换 Dashboard 的 SQL Editor 再跑；
--   · [注意]/[严重]             → 脚本没能清干净，按提示重跑一次或手工处理。
