-- ============================================================
-- v4.3.0 数据库优化 —— 验收查询（只读，可反复执行）
-- ============================================================
-- 为什么需要它：建索引 / 建触发器这类 DDL 执行成功时，Supabase SQL Editor
--   只会显示「Success. No rows returned」——它只展示「返回行的结果集」，
--   不会告诉你到底做了什么。所以「跑完没反馈」是正常现象，不等于没生效；
--   要确认生效，得靠下面这条查询把结果查出来看。
--
-- 用法：整份粘贴到 **正确项目**（bbyykrgitgawqwdgcxhp）的 SQL Editor 执行。
-- 期望：结果集「结果」列全部以 [OK] 开头，末尾汇总行异常项数为 0。
-- 本文件不含任何写操作（只有 SET search_path，会话级、不留痕），可安全重复执行。

SET search_path = public;

WITH idx AS (
  SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
),
expected AS (
  SELECT * FROM (VALUES
    ( 1, 'idx_users_department_role',   'users 部门 / 角色筛选'),
    ( 2, 'idx_tasks_assigned_to',       'tasks 外键 assigned_to'),
    ( 3, 'idx_tasks_created_by',        'tasks 外键 created_by'),
    ( 4, 'idx_tasks_template_id',       'tasks 外键 template_id'),
    ( 5, 'idx_tasks_linked_notice_id',  'tasks 外键 linked_notice_id'),
    ( 6, 'idx_task_submissions_task',   'task_submissions 外键 task_id'),
    ( 7, 'idx_task_submissions_user',   'task_submissions 外键 user_id'),
    ( 8, 'idx_task_milestones_task',    'task_milestones 外键 task_id'),
    ( 9, 'idx_task_milestones_done_by', 'task_milestones 外键 completed_by'),
    (10, 'idx_task_templates_created',  'task_templates 外键 created_by'),
    (11, 'idx_notices_created_by',      'notices 外键 created_by'),
    (12, 'idx_school_notices_created',  'school_notices 外键 created_by'),
    (13, 'idx_forum_posts_created_by',  'forum_posts 外键 created_by'),
    (14, 'idx_forum_replies_post',      'forum_replies 外键 post_id'),
    (15, 'idx_forum_replies_created',   'forum_replies 外键 created_by'),
    (16, 'idx_tickets_created_by',      'tickets 外键 created_by'),
    (17, 'idx_ticket_records_ticket',   'ticket_records 外键 ticket_id'),
    (18, 'idx_ticket_records_user',     'ticket_records 外键 user_id'),
    (19, 'idx_ticket_records_student',  'ticket_records 外键 student_id'),
    (20, 'idx_invite_codes_used_by',    'invite_codes 外键 used_by'),
    (21, 'idx_invite_codes_dept',       'invite_codes 部门筛选'),
    (22, 'idx_notice_reads_user',       'notice_reads 外键 user_id'),
    (23, 'idx_dept_guides_updated_by',  'department_guides 外键 updated_by'),
    (24, 'idx_platform_guides_module',  'platform_guides 模块排序'),
    (25, 'idx_notifications_user_time', '通知：用户 + 时间倒序翻页'),
    (26, 'idx_notifications_unread',    '通知：未读部分索引'),
    (27, 'idx_tasks_dept_status_time',  '任务：部门 + 状态 + 时间'),
    (28, 'idx_tasks_status_deadline',   '任务：状态 + 截止时间'),
    (29, 'idx_tasks_updated_at',        '任务：updated_at 倒序（周报时间窗）'),
    (30, 'idx_notices_dept_time',       '公告：部门 + 时间倒序'),
    (31, 'idx_school_notices_pin_time', '校级通知：置顶 + 时间倒序'),
    (32, 'idx_forum_posts_dept_time',   '论坛：部门 + 时间倒序'),
    (33, 'idx_tickets_open_time',       '票务：开抢时间倒序'),
    (34, 'idx_usage_events_module_time','埋点：模块 + 类型 + 时间')
  ) AS e(ord, name, note)
),
checks AS (
  -- A. 索引是否存在
  SELECT 'A 索引' AS "类别", e.ord AS "序", e.name AS "对象",
         CASE WHEN i.indexname IS NULL THEN '[缺失]' ELSE '[OK]' END AS "结果",
         e.note AS "说明"
  FROM expected e
  LEFT JOIN idx i ON i.indexname = e.name

  UNION ALL
  -- users.auth_id：唯一索引与降级普通索引「二选一即算通过」
  SELECT 'A 索引', 0, 'users.auth_id 索引',
         CASE
           WHEN EXISTS (SELECT 1 FROM idx WHERE indexname = 'uq_users_auth_id') THEN '[OK] 唯一索引'
           WHEN EXISTS (SELECT 1 FROM idx WHERE indexname = 'idx_users_auth_id') THEN '[OK] 普通索引（库里有重复 auth_id）'
           ELSE '[缺失]'
         END,
         'RLS 每条策略都要算 auth_id = auth.uid()，这是登录后所有查询的公共开销'

  UNION ALL
  -- 部分索引必须真的带谓词，否则退化成全表索引、吃不到体积与扫描收益
  SELECT 'A 索引', 35, 'idx_notifications_unread 部分索引谓词',
         CASE
           WHEN EXISTS (
             SELECT 1 FROM idx
             WHERE indexname = 'idx_notifications_unread' AND indexdef ILIKE '%WHERE%is_read%false%'
           ) THEN '[OK]'
           ELSE '[异常]'
         END,
         '应为 WHERE is_read = false'

  UNION ALL
  -- B. updated_at 统一维护函数与 5 个触发器
  SELECT 'B 函数/触发器', 40, 'public.touch_updated_at()',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'touch_updated_at'
         ) THEN '[OK]' ELSE '[缺失]' END,
         'updated_at 由库统一维护（前端漏写也不会失真）'

  UNION ALL
  SELECT 'B 函数/触发器', 41 + v.ord, 'trg_' || v.t || '_touch',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_trigger g
           JOIN pg_class c ON c.oid = g.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE NOT g.tgisinternal AND n.nspname = 'public'
             AND g.tgname = 'trg_' || v.t || '_touch'
         ) THEN '[OK] BEFORE UPDATE' ELSE '[缺失]' END,
         '表 ' || v.t
  FROM (VALUES (0, 'tasks'), (1, 'task_templates'), (2, 'forum_posts'),
               (3, 'department_guides'), (4, 'platform_guides')) AS v(ord, t)

  UNION ALL
  -- C. 两个 CHECK 约束（NOT VALID：存量行不校验、只约束后续写入）
  SELECT 'C 约束', 50 + v.ord, v.name,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = v.name AND connamespace = 'public'::regnamespace AND NOT convalidated
         ) THEN '[OK] NOT VALID' ELSE '[缺失]' END,
         v.note
  FROM (VALUES (0, 'chk_users_role', 'users.role 取值枚举'),
               (1, 'chk_task_milestones_status', '里程碑状态枚举')) AS v(ord, name, note)

  UNION ALL
  -- D. 统计信息（新索引要立刻被规划器采纳，需 ANALYZE）
  SELECT 'D 统计信息', 60 + v.ord, v.t,
         CASE WHEN st.last_analyze IS NOT NULL
              THEN '[OK] ' || to_char(st.last_analyze, 'MM-DD HH24:MI')
              ELSE '[未 ANALYZE]' END,
         '最近一次 ANALYZE 时间'
  FROM (VALUES (0, 'users'), (1, 'tasks'), (2, 'task_submissions'), (3, 'task_milestones'),
               (4, 'notices'), (5, 'forum_posts'), (6, 'forum_replies'), (7, 'tickets'),
               (8, 'ticket_records'), (9, 'notifications')) AS v(ord, t)
  LEFT JOIN pg_stat_user_tables st ON st.schemaname = 'public' AND st.relname = v.t

  UNION ALL
  -- E. 数据体检：唯一索引是否真的升成了唯一
  SELECT 'E 数据体检', 70, 'users.auth_id 重复值',
         CASE WHEN d.n = 0 THEN '[OK] 0 组' ELSE '[注意] ' || d.n || ' 组' END,
         '为 0 说明唯一索引生效；不为 0 说明走的是降级分支（见执行时的 NOTICE）'
  FROM (
    SELECT count(*) AS n FROM (
      SELECT 1 FROM public.users
      WHERE auth_id IS NOT NULL
      GROUP BY auth_id
      HAVING count(*) > 1
    ) dup
  ) d
),
labeled AS (
  SELECT "类别", "序", "对象", "结果", "说明" FROM checks
  UNION ALL
  SELECT 'Z 汇总', 999, '异常项数',
         (SELECT count(*)::text FROM checks WHERE "结果" NOT LIKE '[OK]%'),
         '期望 0'
)
SELECT "类别", "对象", "结果", "说明"
FROM labeled
ORDER BY "类别", "序";
