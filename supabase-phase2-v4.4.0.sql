-- ⚠️ 本文件由 scripts/extract-sql-section.mjs 从 supabase-migration.sql 自动抽取，请勿手工编辑。
--    改动请改 supabase-migration.sql 的「第十八部分」章节，然后重新执行：
--      node scripts/extract-sql-section.mjs 第十八部分 supabase-phase2-v4.4.0.sql
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
