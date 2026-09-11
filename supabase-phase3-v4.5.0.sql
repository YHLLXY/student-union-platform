-- ⚠️ 本文件由 scripts/extract-sql-section.mjs 从 supabase-migration.sql 自动抽取，请勿手工编辑。
--    改动请改 supabase-migration.sql 的「第十九部分」章节，然后重新执行：
--      node scripts/extract-sql-section.mjs 第十九部分 supabase-phase3-v4.5.0.sql
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
