-- ============================================================
-- 学生会线上交流平台 — v4.3.0 数据库优化升级（一次性执行脚本）
-- ============================================================
-- 用法：复制本文件全部内容 → Supabase Dashboard → SQL Editor → Run。
-- 内容与 supabase-migration.sql 第十七部分完全一致（由脚本抽取，勿手工编辑本文件，
-- 改动请改 supabase-migration.sql 后重新抽取）。
-- 特性：全部幂等，可重复执行；不改变任何业务语义；可在部署 v4.3.0 前端前后任意时刻执行。
-- 表名已全部写成 public.xxx 并显式 SET search_path —— 2026-09-11 首次执行时遇到
--   ERROR: 42P01 relation "users" does not exist（SQL Editor 会话 search_path 不含 public 所致），
--   故加此两道保险；若你的库不在 public schema，见文末「万一还是报 42P01」三行诊断。
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
-- ⚠️ 为什么所有表名都写成 public.xxx（2026-09-11 用户实测补丁）：
--      首次执行时报 `42P01 relation "users" does not exist`，但 users 明明在库里——
--      PostgREST 的 /rest/v1/users 一直正常工作，说明它就在 API 暴露的 public schema 下；
--      报错是 SQL Editor 会话的 search_path 不一定含 public，未限定表名解析不到。
--      故这里 ① 显式 SET search_path，② 所有表名一律写成 public.表名，两道保险；
--      这样在 search_path 正常/异常、编辑器/psql/CLI 各种入口下都能直接执行。

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
