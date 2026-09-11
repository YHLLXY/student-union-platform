/**
 * 本地 Supabase 桩服务器——仅在本地后端不可达时用于离线 UI/布局测试。
 * 用法:
 *   node scripts/dev-stub.mjs                      # 监听 9999
 *   VITE_SUPABASE_URL=http://127.0.0.1:9999 VITE_SUPABASE_ANON_KEY=stub-key npm run build
 * 模拟范围:auth(password 登录/刷新/user/signup/logout) + PostgREST(过滤/单行/插入/更新) + rpc(grab_ticket/reset_user_password)
 */
import http from 'node:http';

// STUB_PORT 允许测试框架（vitest globalSetup / e2e runner）用独立端口拉起隔离实例
const PORT = Number(process.env.STUB_PORT) || 9999;
const DEV_AUTH_ID = '11111111-1111-4111-8111-111111111111';
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const days = (d, h = 10) => new Date(Date.now() + d * 864e5 + h * 36e5).toISOString();

/* ---------- 种子数据 ---------- */
const users = [
  { id: uid(1), auth_id: DEV_AUTH_ID, name: '王开发', student_id: 'DEV0001', department: 'developer', role: 'developer', avatar_url: null, created_at: days(-300) },
  { id: uid(2), auth_id: uid(101), name: '陈主席', student_id: 'PRES2026', department: 'presidium', role: 'president', avatar_url: null, created_at: days(-280) },
  { id: uid(3), auth_id: uid(102), name: '刘副主席', student_id: 'VICE2026', department: 'presidium', role: 'presidium', avatar_url: null, created_at: days(-270) },
  { id: uid(4), auth_id: uid(103), name: '赵敏', student_id: 'XUAN2026', department: 'publicity', role: 'dept_head', avatar_url: null, created_at: days(-260) },
  { id: uid(5), auth_id: uid(104), name: '孙晓雨', student_id: 'XUAN1001', department: 'publicity', role: 'volunteer', avatar_url: null, created_at: days(-200) },
  { id: uid(6), auth_id: uid(105), name: '钱强', student_id: 'TIYU2026', department: 'sports', role: 'dept_head', avatar_url: null, created_at: days(-250) },
  { id: uid(7), auth_id: uid(106), name: '周子杰', student_id: 'TIYU1001', department: 'sports', role: 'volunteer', avatar_url: null, created_at: days(-190) },
  { id: uid(8), auth_id: uid(107), name: '吴雅婷', student_id: 'WENYI2026', department: 'arts', role: 'dept_head', avatar_url: null, created_at: days(-240) },
  { id: uid(9), auth_id: uid(108), name: '郑安然', student_id: 'WENYI1001', department: 'arts', role: 'volunteer', avatar_url: null, created_at: days(-180) },
  { id: uid(10), auth_id: uid(109), name: '冯志远', student_id: 'ZUZHI2026', department: 'organization', role: 'dept_head', avatar_url: null, created_at: days(-230) },
  { id: uid(11), auth_id: uid(110), name: '褚文博', student_id: 'XUEFU2026', department: 'academic_support', role: 'dept_head', avatar_url: null, created_at: days(-220) },
  { id: uid(12), auth_id: uid(111), name: '卫思思', student_id: 'BANGONG2026', department: 'student_office', role: 'dept_head', avatar_url: null, created_at: days(-210) },
  { id: uid(13), auth_id: uid(112), name: '严浩宇', student_id: 'QINXIE2026', department: 'youth_volunteers', role: 'dept_head', avatar_url: null, created_at: days(-205) },
  { id: uid(14), auth_id: uid(113), name: '柳知恩', student_id: 'XUEZI2026', department: 'student_aid', role: 'dept_head', avatar_url: null, created_at: days(-200) },
  { id: uid(15), auth_id: uid(114), name: '岳星辰', student_id: 'KEXIA2026', department: 'science_competition', role: 'dept_head', avatar_url: null, created_at: days(-195) },
  { id: uid(16), auth_id: uid(115), name: '蔡佳宁', student_id: 'SHENGHUO2026', department: 'life_services', role: 'dept_head', avatar_url: null, created_at: days(-190) },
  { id: uid(17), auth_id: uid(116), name: '林书豪', student_id: 'RENWEN2026', department: 'humanities', role: 'dept_head', avatar_url: null, created_at: days(-185) },
  { id: uid(18), auth_id: uid(117), name: '何老师', student_id: 'TEACHER01', department: 'presidium', role: 'teacher', avatar_url: null, created_at: days(-400) },
];

const tasks = [
  { id: uid(201), title: '秋季迎新晚会舞台布置与物资搬运协调', content: '本周日晚大礼堂正式彩排,需要提前完成舞台背景板安装、灯光调试与后台物资分区摆放。请各小组按分工表执行,物资清单见附件。', priority: 'high', status: 'in_progress', deadline: days(3, 18), created_by: uid(3), assigned_to: uid(5), assigned_department: 'publicity', created_at: days(-5), updated_at: days(-1), collaborating_departments: ['arts', 'organization'], has_milestones: true },
  { id: uid(202), title: '招新宣传推文终稿校对与排版', content: '面向 2026 级新生的招新推文,重点检查部门介绍数据、报名二维码与往届活动照片版权。', priority: 'urgent', status: 'pending', deadline: days(1, 12), created_by: uid(4), assigned_to: uid(5), assigned_department: 'publicity', created_at: days(-2), updated_at: days(-2), collaborating_departments: [], has_milestones: false },
  { id: uid(203), title: '校运会方阵训练考勤统计表更新', content: '每日训练结束后两小时内更新考勤,缺席名单单独报备。', priority: 'normal', status: 'submitted', deadline: days(2, 22), created_by: uid(6), assigned_to: uid(7), assigned_department: 'sports', created_at: days(-7), updated_at: days(0), collaborating_departments: [], has_milestones: false },
  { id: uid(204), title: '百团大战活动场地申请材料整理', content: '包含活动方案、安全预案与物资清单三部分,模板见部门共享盘。', priority: 'normal', status: 'completed', deadline: days(-1, 18), created_by: uid(10), assigned_to: uid(7), assigned_department: 'sports', created_at: days(-12), updated_at: days(-1), collaborating_departments: ['organization'], has_milestones: false },
  { id: uid(205), title: '迎新晚会节目单第三轮审校', content: '确认 14 个节目的时长、配乐版本与串词衔接,输出最终演出流程表。', priority: 'high', status: 'in_progress', deadline: days(4, 20), created_by: uid(8), assigned_to: uid(9), assigned_department: 'arts', created_at: days(-4), updated_at: days(-1), collaborating_departments: ['publicity'], has_milestones: true },
  { id: uid(206), title: '学习经验分享会嘉宾邀请函发放', content: '共 6 位受邀学长学姐,纸质邀请函需本人签收,电子版同步邮箱。', priority: 'normal', status: 'pending', deadline: days(6, 17), created_by: uid(11), assigned_to: uid(9), assigned_department: 'arts', created_at: days(-3), updated_at: days(-3), collaborating_departments: [], has_milestones: false },
  { id: uid(207), title: '九月部门例会纪要归档', content: '按新归档模板整理,纪要需在会后 48 小时内上传。', priority: 'low', status: 'approved', deadline: days(8, 18), created_by: uid(12), assigned_to: uid(5), assigned_department: 'publicity', created_at: days(-1), updated_at: days(-1), collaborating_departments: [], has_milestones: false },
  { id: uid(208), title: '运动会器材清点与损坏登记(超长标题测试:含全角标点、英文字符 Venue-Equipment-Checklist 2026)', content: '对仓库全部器材逐项清点,损坏器材拍照登记并估价,形成报废/维修建议清单。', priority: 'normal', status: 'rejected', deadline: days(5, 16), created_by: uid(6), assigned_to: uid(7), assigned_department: 'sports', created_at: days(-2), updated_at: days(0), collaborating_departments: ['life_services'], has_milestones: false },
];

const taskSubmissions = [
  { id: uid(301), task_id: uid(203), user_id: uid(7), note: '本周考勤已更新,周四 2 人病假已备注。', status: 'submitted', review_note: null, submitted_at: days(0, 9), reviewed_at: null },
  { id: uid(302), task_id: uid(204), user_id: uid(7), note: '场地申请材料已提交至团委。', status: 'approved', review_note: '材料齐全,通过。', submitted_at: days(-2, 15), reviewed_at: days(-1, 10) },
  { id: uid(303), task_id: uid(208), user_id: uid(7), note: '第一批清点完成,表格见群文件。', status: 'rejected', review_note: '缺少器材编号列,请补齐后重新提交。', submitted_at: days(-1, 11), reviewed_at: days(0, 9) },
];

const taskMilestones = [
  { id: uid(311), task_id: uid(201), title: '背景板设计与印刷', description: '含两轮打样确认', deadline: days(-2, 18), status: 'completed', sort_order: 1, completed_at: days(-2, 17), completed_by: uid(5), created_at: days(-5) },
  { id: uid(312), task_id: uid(201), title: '灯光音响进场调试', description: '', deadline: days(1, 18), status: 'pending', sort_order: 2, completed_at: null, completed_by: null, created_at: days(-5) },
  { id: uid(313), task_id: uid(201), title: '彩排全流程走位', description: '全体演职人员参加', deadline: days(3, 14), status: 'pending', sort_order: 3, completed_at: null, completed_by: null, created_at: days(-5) },
  { id: uid(314), task_id: uid(205), title: '节目时长复核', description: '', deadline: days(1, 20), status: 'pending', sort_order: 1, completed_at: null, completed_by: null, created_at: days(-4) },
];

const taskTemplates = [
  { id: uid(321), title: '晚会类活动执行模板', description: '适用于大型文娱活动全流程', department: 'arts', steps: [{ title: '方案申报', days: 14 }, { title: '物资采购', days: 7 }, { title: '彩排', days: 2 }, { title: '正式演出', days: 0 }], created_by: uid(8), created_at: days(-60), updated_at: days(-30) },
  { id: uid(322), title: '推文发布流程模板', description: '宣传口常规推文三审三校', department: 'publicity', steps: [{ title: '初稿', days: 3 }, { title: '部长审核', days: 2 }, { title: '主席团审核', days: 1 }, { title: '发布', days: 0 }], created_by: uid(4), created_at: days(-55), updated_at: days(-25) },
];

const notices = [
  { id: uid(401), title: '关于迎新晚会彩排时间调整的通知', content: '因场地档期冲突,原定周六下午的彩排调整至周日 14:00-18:00,请各节目组知悉并互相转告,签到地点为大礼堂侧门。', type: 'notification', department: 'presidium', is_pinned: true, created_by: uid(3), created_at: days(-1), linked_tasks: [uid(201)] },
  { id: uid(402), title: '宣传部:九月推文排期表发布', content: '九月共排期 12 篇推文,含招新特辑 3 篇。各栏目负责人按排期表执行,延期需提前 2 天报备。', type: 'notification', department: 'publicity', is_pinned: false, created_by: uid(4), created_at: days(-2), linked_tasks: [] },
  { id: uid(403), title: '关于规范活动物资借用流程的通知', content: '即日起所有物资借用需提前 3 天在平台提交申请,经生活服务部与办公室双重审批后方可领取,归还时需当场核验。', type: 'notification', department: 'student_office', is_pinned: false, created_by: uid(12), created_at: days(-4), linked_tasks: [] },
  { id: uid(404), title: '体育部:校运会志愿者招募启动', content: '招募检录组、计时分 组、后勤组志愿者共 40 名,报名截止本周五 18:00。', type: 'notification', department: 'sports', is_pinned: false, created_by: uid(6), created_at: days(-3), linked_tasks: [] },
  { id: uid(405), title: '文艺部:节目再审意见反馈', content: '第二轮再审共提出 9 条修改意见,详见附件打分表,各节目负责人于周三前提交修改说明。', type: 'notification', department: 'arts', is_pinned: false, created_by: uid(8), created_at: days(-5), linked_tasks: [] },
  { id: uid(406), title: '关于学生会在册成员信息核对的通知', content: '为保障平台权限与通讯录准确,请全体成员于本周日核对本人在"个人中心"的部门、职务与联系方式信息。', type: 'notification', department: 'presidium', is_pinned: false, created_by: uid(2), created_at: days(-6), linked_tasks: [] },
];

const schoolNotices = [
  { id: uid(501), title: '关于 2026 年秋季学期开学教学安排的通知', content: '全校本专科生 9 月 7 日报到注册,9 月 8 日正式上课。补考安排另行通知。', is_pinned: true, created_by: uid(18), created_at: days(-8) },
  { id: uid(502), title: '关于举办第二十二届校园文化艺术节的通知', content: '本届艺术节以"青春与城市"为主题,设开幕式、社团巡礼、闭幕晚会三大板块,10 月中旬举行。', is_pinned: true, created_by: uid(18), created_at: days(-6) },
  { id: uid(503), title: '图书馆新馆开放时间调整公告', content: '自 9 月 10 日起,新馆开放时间延长至 22:30,考试周期间另行公告。', is_pinned: false, created_by: uid(18), created_at: days(-5) },
  { id: uid(504), title: '关于开展 2026 年国家奖学金评选工作的通知', content: '评选名额已下达到学院,请符合条件的同学于 9 月 20 日前向学院提交申请材料。', is_pinned: false, created_by: uid(18), created_at: days(-4) },
  { id: uid(505), title: '校园网络升级维护公告(夜间暂停服务)', content: '9 月 8 日 00:00-06:00 对核心网络设备升级,期间校园网与部分业务系统将短暂中断。', is_pinned: false, created_by: uid(18), created_at: days(-2) },
];

const forumPosts = [
  { id: uid(601), title: '【协作】迎新晚会宣传物料设计需求对接', content: '宣传部计划为迎新晚会产出主视觉海报 1 张、节目单折页 1 套与现场指示牌 6 块。\n现需要文艺部提供节目名称与顺序终版,组织部确认场地布置点位。\n请在评论区对齐时间节点。', category: 'discussion', department: 'publicity', collaborating_departments: ['arts', 'organization'], created_by: uid(4), created_at: days(-2), updated_at: days(-1), template_type: null, template_data: null },
  { id: uid(602), title: '【经验】大型活动抢票系统的并发问题复盘', content: '上学期演唱会抢票出现超卖,复盘结论:行锁 + 原子扣减是关键,平台已改用 rpc 原子操作,供各活动负责部门参考。', category: 'knowledge', department: 'organization', collaborating_departments: [], created_by: uid(10), created_at: days(-10), updated_at: days(-10), template_type: null, template_data: null },
  { id: uid(603), title: '【讨论】新生报名表收集工具选型', content: '今年招新报名表需要支持附件上传与自动去重,大家有推荐的方案吗?', category: 'discussion', department: 'student_office', collaborating_departments: ['science_competition'], created_by: uid(12), created_at: days(-3), updated_at: days(-3), template_type: null, template_data: null },
  { id: uid(604), title: '【知识】推文三审三校要点清单', content: '一审政治性与事实准确性,二审结构与逻辑,三校错别字与标点。\n重点提示:涉及师长姓名与职务必须与官网一致。', category: 'knowledge', department: 'publicity', collaborating_departments: [], created_by: uid(4), created_at: days(-15), updated_at: days(-15), template_type: null, template_data: null },
  { id: uid(605), title: '【协作】校运会开幕式方阵跨部门排练协调', content: '方阵由体育部牵头、五个部门各出 8 人,需协调统一训练场地与时段,初步定在每周三、五晚。', category: 'discussion', department: 'sports', collaborating_departments: ['publicity', 'arts', 'humanities', 'organization', 'youth_volunteers'], created_by: uid(6), created_at: days(-1), updated_at: days(0), template_type: null, template_data: null },
  { id: uid(606), title: '【知识】部门报销流程与发票规范整理', content: '整理了常见报销场景的票据要求,含出租车票、批量采购与电子发票归档口径,欢迎补充。', category: 'knowledge', department: 'student_office', collaborating_departments: [], created_by: uid(12), created_at: days(-20), updated_at: days(-20), template_type: null, template_data: null },
];

const forumReplies = [
  { id: uid(651), post_id: uid(601), content: '文艺部确认:节目单终版周四上午给到,以微信群文件为准。', created_by: uid(8), created_at: days(-1, 12) },
  { id: uid(652), post_id: uid(601), content: '组织部:点位图周五出初稿,先按 6 块指示牌规划。', created_by: uid(10), created_at: days(-1, 15) },
  { id: uid(653), post_id: uid(601), content: '宣传这边汇总后出物料时间轴,统一在帖子里更新。', created_by: uid(5), created_at: days(-1, 18) },
  { id: uid(654), post_id: uid(602), content: '补充:前端还做了 500ms 防抖与按钮禁用,双重保险。', created_by: uid(15), created_at: days(-9) },
  { id: uid(655), post_id: uid(603), content: '推荐用平台自带的问卷模块,附件与去重都支持。', created_by: uid(13), created_at: days(-2) },
  { id: uid(656), post_id: uid(605), content: '人文部 8 人名单已报,周三可训练。', created_by: uid(17), created_at: days(0, 8) },
  { id: uid(657), post_id: uid(605), content: '建议训练场地点位固定,避免每次换场地。', created_by: uid(7), created_at: days(0, 9) },
  { id: uid(658), post_id: uid(604), content: '收藏了,建议加一条:图片需注明拍摄者或来源。', created_by: uid(9), created_at: days(-14) },
];

const tickets = [
  { id: uid(701), title: '"青春与城市"迎新晚会门票', description: '凭票入场,一人一票,开场前 30 分钟开始检票。座位随机分配,禁止转售。', cover_url: null, total_count: 800, per_user_limit: 1, open_time: days(-1, 12), event_time: days(7, 19), created_by: uid(8), created_at: days(-3) },
  { id: uid(702), title: '校园歌手大赛决赛入场券', description: '决赛设大众评审环节,持票观众可现场扫码报名。', cover_url: null, total_count: 300, per_user_limit: 2, open_time: days(1, 12), event_time: days(14, 19), created_by: uid(8), created_at: days(-2) },
  { id: uid(703), title: '名家讲坛:人工智能与未来学习', description: '主讲人信息详见海报。提问环节有机会获得签名书籍。', cover_url: null, total_count: 200, per_user_limit: 1, open_time: days(-10, 12), event_time: days(-2, 15), created_by: uid(11), created_at: days(-12) },
  { id: uid(704), title: '秋季越野赛观赛补给券', description: '可在终点补给站兑换热饮与能量棒。', cover_url: null, total_count: 500, per_user_limit: 1, open_time: days(0, 8), event_time: days(10, 9), created_by: uid(6), created_at: days(-1) },
  // 705 的活动时间刻意落在「现在 +1 小时」= 签到时间窗内（活动前 2 小时 ~ 后 6 小时），
  // 供 E2E 走通「扫码签到成功」；其余票据的活动时间都在窗外，用于验证拒绝分支。
  { id: uid(705), title: '校运会志愿者现场签到凭证', description: '入场凭本凭证扫码签到，签到计入本学期考核积分。', cover_url: null, total_count: 120, per_user_limit: 1, open_time: days(-2, 12), event_time: days(0, 1), created_by: uid(6), created_at: days(-2) },
];

const ticketRecords = [
  { id: uid(711), ticket_id: uid(701), user_id: uid(1), student_id: 'DEV0001', name: '王开发', grabbed_at: days(-1, 13), checked_in_at: null, checked_by: null },
  { id: uid(712), ticket_id: uid(703), user_id: uid(1), student_id: 'DEV0001', name: '王开发', grabbed_at: days(-10, 13), checked_in_at: null, checked_by: null },
  // 705 的两条：一条未签到（供签到成功用例），一条已签到（供幂等分支与名单统计用例）
  { id: uid(713), ticket_id: uid(705), user_id: uid(1), student_id: 'DEV0001', name: '王开发', grabbed_at: days(-1, 14), checked_in_at: null, checked_by: null },
  { id: uid(714), ticket_id: uid(705), user_id: uid(5), student_id: 'XUAN1001', name: '孙晓雨', grabbed_at: days(-1, 15), checked_in_at: days(0, 0), checked_by: uid(6) },
];

/* 考核积分流水种子（第十八部分）。semester 用运行时的当前学期，
   口径与数据库 public.semester_of() 一致——写死会让用例跨学期后突然查不到。 */
function currentSemester(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  if (m >= 9) return `${y}-${y + 1}-1`;
  if (m === 1) return `${y - 1}-${y}-1`;
  return `${y - 1}-${y}-2`;
}
const SEMESTER = currentSemester();

const pointsLedger = [
  { id: uid(901), user_id: uid(1), delta: 2, reason: 'task_approved', ref_type: 'submission', ref_id: uid(302), semester: SEMESTER, created_at: days(-2, 10) },
  { id: uid(902), user_id: uid(1), delta: 1, reason: 'submission_on_time', ref_type: 'submission', ref_id: uid(302), semester: SEMESTER, created_at: days(-2, 10) },
  { id: uid(903), user_id: uid(1), delta: 1, reason: 'ticket_checkin', ref_type: 'ticket_record', ref_id: uid(714), semester: SEMESTER, created_at: days(0, 0) },
  { id: uid(904), user_id: uid(5), delta: 2, reason: 'task_approved', ref_type: 'submission', ref_id: uid(311), semester: SEMESTER, created_at: days(-1, 9) },
  { id: uid(905), user_id: uid(5), delta: 1, reason: 'submission_on_time', ref_type: 'submission', ref_id: uid(311), semester: SEMESTER, created_at: days(-1, 9) },
  { id: uid(906), user_id: uid(5), delta: 1, reason: 'ticket_checkin', ref_type: 'ticket_record', ref_id: uid(714), semester: SEMESTER, created_at: days(0, 0) },
  { id: uid(907), user_id: uid(7), delta: 2, reason: 'task_approved', ref_type: 'submission', ref_id: uid(302), semester: SEMESTER, created_at: days(-1, 10) },
  { id: uid(908), user_id: uid(7), delta: 1, reason: 'submission_on_time', ref_type: 'submission', ref_id: uid(302), semester: SEMESTER, created_at: days(-1, 10) },
  { id: uid(909), user_id: uid(7), delta: -1, reason: 'submission_late', ref_type: 'submission', ref_id: uid(303), semester: SEMESTER, created_at: days(0, 9) },
];

const notifications = [
  { id: uid(801), user_id: uid(1), type: 'task_assigned', title: '你有新任务:招新宣传推文终稿校对与排版', content: '截止时间:明天 12:00', related_link: '/tasks', is_read: false, created_at: days(-2) },
  { id: uid(802), user_id: uid(1), type: 'new_notice', title: '新公告:关于迎新晚会彩排时间调整的通知', content: '', related_link: '/notices', is_read: false, created_at: days(-1) },
  { id: uid(803), user_id: uid(1), type: 'forum_reply', title: '赵敏 回复了协作帖', content: '宣传部汇总后出物料时间轴,统一在帖子里更新。', related_link: '/forum', is_read: true, created_at: days(-1, 18) },
  { id: uid(804), user_id: uid(1), type: 'submission_approved', title: '你的任务提交已通过审核', content: '百团大战活动场地申请材料整理', related_link: '/tasks', is_read: true, created_at: days(-2, 10) },
];

const inviteCodes = [
  { id: uid(811), code: 'ZHUZI_ADM', department: 'presidium', role: 'presidium', is_used: false, used_by: null, created_at: days(-100), batch_id: null },
  { id: uid(812), code: 'XUAN_ADM', department: 'publicity', role: 'dept_head', is_used: false, used_by: null, created_at: days(-100), batch_id: null },
  { id: uid(813), code: 'TIYU_VOL', department: 'sports', role: 'volunteer', is_used: false, used_by: null, created_at: days(-100), batch_id: null },
];

const departmentGuides = [
  { id: uid(821), department: 'publicity', basic_info: { leader: '赵敏', teacher: '何老师', office: '学生活动中心 302', group_chat: '宣传部大群' }, templates: [{ title: '推文排版规范', url: '#' }, { title: '物料申请单', url: '#' }], faqs: [{ question: '推文发布前需要哪些审核?', answer: '三审三校:初审干事自查、二审部长、三审分管主席。' }], updated_by: uid(4), updated_at: days(-20) },
];

const platformGuides = [
  { id: uid(831), module_key: 'dashboard', title: '工作台使用指南', content: '工作台聚合了任务、公告与票务的待办入口,卡片可点击直达对应模块。', sort_order: 1, created_by: uid(1), updated_by: uid(1), created_at: days(-30), updated_at: days(-30) },
  { id: uid(832), module_key: 'tickets', title: '抢票模块指南', content: '开抢前 1 分钟进入详情页,点击抢票按钮即可,抢到后可在"我的票券"查看。', sort_order: 1, created_by: uid(1), updated_by: uid(1), created_at: days(-30), updated_at: days(-30) },
];

const noticeReads = [
  { id: uid(841), notice_id: uid(406), user_id: uid(1), read_at: days(-5) },
];

const usageEvents = [];

const db = {
  users, tasks, task_submissions: taskSubmissions, task_milestones: taskMilestones,
  task_templates: taskTemplates, notices, school_notices: schoolNotices,
  forum_posts: forumPosts, forum_replies: forumReplies, tickets, ticket_records: ticketRecords,
  notifications, invite_codes: inviteCodes, department_guides: departmentGuides,
  platform_guides: platformGuides, notice_reads: noticeReads, usage_events: usageEvents,
  points_ledger: pointsLedger,
};
let seq = 9000;

/* 测试隔离：启动即快照种子，POST /__reset 可整体回滚（E2E 每个用例前调用，避免用例间互相污染） */
const SEED_SNAPSHOT = JSON.parse(JSON.stringify(db));
const SEED_SEQ = seq;

function resetDb() {
  for (const k of Object.keys(db)) {
    db[k] = k in SEED_SNAPSHOT ? JSON.parse(JSON.stringify(SEED_SNAPSHOT[k])) : [];
  }
  seq = SEED_SEQ;
}

/* 数据库列默认值（真实库有 DEFAULT，插入缺列时补齐，避免 eq 过滤静默失配） */
const TABLE_DEFAULTS = {
  notifications: { is_read: false, content: '' },
  tasks: { status: 'pending', priority: 'normal' },
  task_submissions: { status: 'submitted' },
  task_milestones: { status: 'pending', sort_order: 0 },
  users: { role: 'volunteer', department: '' },
  invite_codes: { used_count: 0, used_by: null, max_uses: 1, is_used: false, batch_id: null },
  // 第十八部分：签到的两列默认 NULL（真实库由 ALTER TABLE ADD COLUMN 得到，无默认值）
  ticket_records: { checked_in_at: null, checked_by: null },
};

/* 外键嵌入：creator:users!created_by(name) / submitter:user_id(name) / ticket:ticket_id(...) */
const FK_COL_TABLE = {
  user_id: 'users', created_by: 'users', assigned_to: 'users',
  completed_by: 'users', used_by: 'users', ticket_id: 'tickets', task_id: 'tasks',
};
const TABLE_FK = { tasks: 'task_id', tickets: 'ticket_id' };

function embedRows(out, select) {
  const specRe = /(\w+):(\w+)(?:!([\w]+))?\(([^)]*)\)/g;
  const specs = [];
  let m;
  while ((m = specRe.exec(select))) {
    const fields = m[4].split(',').map((s) => s.trim()).filter(Boolean);
    if (!fields.length) continue;
    let col = m[3];
    if (col === 'inner' || col === 'left') col = null; // join 强度提示符，非列名
    specs.push({ alias: m[1], ref: m[2], col, fields });
  }
  if (!specs.length || !out.length) return out;
  return out.map((r) => {
    const row = { ...r };
    for (const s of specs) {
      const knownTable = s.ref in db;
      const colName = knownTable ? (s.col || TABLE_FK[s.ref]) : s.ref;
      if (!colName || !(colName in row)) continue;
      const tname = knownTable ? s.ref : (FK_COL_TABLE[colName] || 'users');
      const target = (db[tname] || []).find((x) => x.id === row[colName]);
      row[s.alias] = target ? Object.fromEntries(s.fields.map((f) => [f, target[f]])) : null;
    }
    return row;
  });
}

/* ---------- 工具 ---------- */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Expose-Headers': '*',
};
function send(res, status, body, extra = {}) {
  // 真实 PostgREST 的标量返回（如 text 型 RPC 函数）是**带引号的 JSON 字符串**，
  // 所以这里一律 JSON 序列化——曾经对字符串原样输出，导致前端把令牌原文当成 error.message
  // （`unwrap` 看到解析失败的响应就抛出，报错信息里赫然是那串令牌）。
  // 例外：空串用于 201/204 的「无内容」响应，按空体直接结束。
  const payload = body === '' ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS, ...extra });
  res.end(payload);
}

/** 极简 PostgREST 过滤:eq / in.(...) / is.null / or.(...) / contains / not.xxx */
function applyFilters(rows, sp) {
  for (const [key, raw] of sp) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    if (key === 'or') {
      // or=(cond1,cond2) —— cond 形如 field.op.value（平台仅用 eq 级简单条件）
      const conds = raw.replace(/^\(|\)$/g, '').split(',');
      rows = rows.filter((r) => conds.some((c) => {
        const m = /^([\w.]+)\.(eq|neq)\.(.*)$/.exec(c);
        if (!m) return false;
        const [, field, op, val] = m;
        const v = r[field];
        return op === 'eq' ? String(v) === val : String(v) !== val;
      }));
      continue;
    }
    // .contains(column, [..]) 的线上形态：column=cs.{a,b}（数组需包含全部元素）
    const cs = /^cs\.(?:\{(.*)\}|\(?(.*?)\)?)$/.exec(raw);
    if (cs) {
      const wanted = (cs[1] ?? cs[2] ?? '').split(',').filter(Boolean);
      rows = rows.filter((r) => {
        const v = r[key];
        return Array.isArray(v) && wanted.every((w) => v.map(String).includes(w));
      });
      continue;
    }
    // .not(col, op, value) 的线上形态：col=not.is.null / col=not.in.(a,b)
    const negate = /^not\.(.*)$/.exec(raw);
    const expr = negate ? negate[1] : raw;
    const m = /^(eq|neq|in|is|gt|gte|lt|lte)\.(.*)$/.exec(expr);
    if (!m) continue;
    const [, op, val] = m;
    const test = (v) => {
      switch (op) {
        case 'eq': return String(v) === val;
        case 'neq': return String(v) !== val;
        case 'in': return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v));
        case 'is': return val === 'null' ? v === null || v === undefined : val === 'true' ? v === true : val === 'false' ? v === false : false;
        case 'gt': return v > val; case 'gte': return v >= val;
        case 'lt': return v < val; case 'lte': return v <= val;
        default: return true;
      }
    };
    rows = rows.filter((r) => (negate ? !test(r[key]) : test(r[key])));
  }
  return rows;
}

/**
 * 排序：order=created_at.desc / deadline.asc.nullslast（可逗号分隔多列）。
 * NULL 默认与 Postgres 一致：ASC 时在最后，DESC 时在最前；可用 nullsfirst / nullslast 覆盖。
 */
function applyOrder(rows, orderRaw) {
  if (!orderRaw) return rows;
  const specs = orderRaw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [field, ...mods] = s.split('.');
    return {
      field,
      desc: mods.includes('desc'),
      nullsFirst: mods.includes('nullsfirst'),
      nullsLast: mods.includes('nullslast'),
    };
  }).filter((s) => s.field);
  if (!specs.length) return rows;

  return [...rows].sort((a, b) => {
    for (const s of specs) {
      const av = a[s.field];
      const bv = b[s.field];
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        const nullFirst = s.nullsFirst || (s.desc && !s.nullsLast);
        // a 是 null：nullFirst 时 a 在前（-1），否则在后（1）；b 是 null 时相反
        return aNull ? (nullFirst ? -1 : 1) : (nullFirst ? 1 : -1);
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  });
}

/**
 * 分页：postgrest-js 的 .range(a,b) 走 Range 头，.limit(n) / .offset(n) 走查询参数。
 * 未请求分页时原样返回（保持旧行为）。
 */
function paginate(rows, sp, rangeHeader) {
  const limitP = sp.get('limit');
  const offsetP = sp.get('offset');
  const rm = /^(\d+)-(\d*)$/.exec(String(rangeHeader || '').trim());
  if (!rm && limitP === null && offsetP === null) return { start: 0, rows };

  let start = offsetP !== null ? Number(offsetP) : 0;
  let end = rows.length - 1;
  if (rm) {
    start = Number(rm[1]);
    end = rm[2] === '' ? rows.length - 1 : Number(rm[2]);
  } else if (limitP !== null) {
    end = start + Number(limitP) - 1;
  }
  return { start, rows: rows.slice(start, Math.max(start, end + 1)) };
}

const authUser = (id = DEV_AUTH_ID) => ({
  id, aud: 'authenticated', role: 'authenticated', email: `${id.slice(0, 8)}@stuunion.org`,
  email_confirmed_at: days(-300), confirmed_at: days(-300), phone: '', last_sign_in_at: days(0),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, identities: [], created_at: days(-300), updated_at: days(0),
});
const sessionFor = (id = DEV_AUTH_ID) => ({
  access_token: `stub-access-${id}`, token_type: 'bearer', expires_in: 3600 * 24 * 7,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 7, refresh_token: `stub-refresh-${id}`, user: authUser(id),
});

/* ---------- 服务 ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  // ---- 测试辅助（仅本地 stub）：恢复种子数据，供 E2E 用例间隔离 ----
  if (path === '/__reset' && req.method === 'POST') {
    resetDb();
    return send(res, 200, { ok: true });
  }

  // ---- Auth ----
  if (path === '/auth/v1/token' && req.method === 'POST') {
    // 按邮箱前缀（学号）定位已注册用户 → 返回其 session；未找到回落开发者身份
    const body = await readBody(req);
    const sid = typeof body.email === 'string' ? body.email.split('@')[0] : '';
    const u = db.users.find((x) => x.student_id === sid);
    return send(res, 200, sessionFor(u ? u.auth_id : DEV_AUTH_ID));
  }
  if (path === '/auth/v1/user' && req.method === 'GET') {
    return send(res, 200, authUser());
  }
  if (path === '/auth/v1/user' && req.method === 'PUT') {
    // updateUser（改密等）：回传当前用户即可
    await readBody(req);
    return send(res, 200, authUser(DEV_AUTH_ID));
  }
  if (path === '/auth/v1/signup' && req.method === 'POST') {
    return send(res, 200, sessionFor(uid(++seq)));
  }
  if (path === '/auth/v1/logout' && req.method === 'POST') {
    return send(res, 204, '');
  }

  // ---- RPC ----
  const rpcMatch = /^\/rest\/v1\/rpc\/(\w+)$/.exec(path);
  if (rpcMatch) {
    const fn = rpcMatch[1];
    if (fn === 'grab_ticket') {
      const body = await readBody(req);
      db.ticket_records.push({ id: uid(++seq), ticket_id: body.p_ticket_id, user_id: body.p_user_id, student_id: body.p_student_id, name: body.p_name, grabbed_at: new Date().toISOString() });
      return send(res, 200, { success: true, message: '抢票成功' });
    }
    if (fn === 'reset_user_password') return send(res, 200, true);

    // ---- 票务闭环（第十八部分）：令牌签发与扫码签到 ----
    // 真实实现是「库内随机密钥 + md5 MAC + 15 分钟有效期」，stub 只保证**形状与分支一致**：
    // 令牌 4 段、能过期、已签到幂等、时间窗外拒绝——E2E 依赖的是这些分支，而不是签名强度。
    if (fn === 'ticket_qr_token') {
      const body = await readBody(req);
      const ttl = Number(body?.p_ttl_minutes) || 15;
      const exp = Math.floor(Date.now() / 1000) + ttl * 60;
      return send(res, 200, `SUP1.${body.p_record}.${exp}.stub`);
    }
    if (fn === 'check_in_ticket') {
      const body = await readBody(req);
      const parts = String(body?.p_token || '').split('.');
      const invalid = { ok: false, code: 'invalid_token', message: '签到码无效或已过期——请让持票人刷新二维码后重扫' };

      if (parts.length !== 4 || parts[0] !== 'SUP1' || parts[3] !== 'stub') return send(res, 200, invalid);
      const exp = Number(parts[2]);
      if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return send(res, 200, invalid);

      const rec = db.ticket_records.find((r) => r.id === parts[1]);
      if (!rec) return send(res, 200, { ok: false, code: 'not_found', message: '票券记录不存在（可能已退票）' });

      if (rec.checked_in_at) {
        return send(res, 200, {
          ok: true, code: 'already_checked_in',
          message: `${rec.name} 已于 ${rec.checked_in_at.slice(5, 16).replace('T', ' ')} 签到过`,
          name: rec.name, student_id: rec.student_id, checked_in_at: rec.checked_in_at,
        });
      }

      const ticket = db.tickets.find((t) => t.id === rec.ticket_id);
      if (!ticket) return send(res, 200, { ok: false, code: 'ticket_missing', message: '该票券对应的活动已不存在' });

      // 时间窗与数据库一致：活动开始前 2 小时 ~ 开始后 6 小时
      const ev = new Date(ticket.event_time).getTime();
      if (Date.now() < ev - 2 * 3600e3 || Date.now() > ev + 6 * 3600e3) {
        return send(res, 200, {
          ok: false, code: 'out_of_window',
          message: `不在签到时间窗内（活动 ${ticket.event_time.slice(5, 16).replace('T', ' ')} 前 2 小时至后 6 小时）`,
          event_time: ticket.event_time,
        });
      }

      rec.checked_in_at = new Date().toISOString();
      rec.checked_by = uid(1); // stub 里登录者恒为开发账号
      // 同步模拟 trg_ticket_records_award 触发器：签到 +1 分（否则「签到后积分变化」无法端到端验证）
      db.points_ledger.push({
        id: uid(++seq), user_id: rec.user_id, delta: 1, reason: 'ticket_checkin',
        ref_type: 'ticket_record', ref_id: rec.id, semester: currentSemester(),
        created_at: rec.checked_in_at,
      });
      return send(res, 200, {
        ok: true, code: 'checked_in',
        message: `${rec.name} 签到成功（积分 +1）`,
        name: rec.name, student_id: rec.student_id, ticket: ticket.title,
        checked_in_at: rec.checked_in_at,
      });
    }

    if (fn === 'validate_invite_code') {
      const body = await readBody(req);
      return send(res, 200, db.invite_codes.find((c) => c.code === body.code_input) || null);
    }
    if (fn === 'check_student_registered') {
      const body = await readBody(req);
      return send(res, 200, db.users.some((u) => u.student_id === body.student_id_input));
    }
    if (fn === 'verify_user_identity') {
      const body = await readBody(req);
      const u = db.users.find((x) => x.student_id === body.student_id_input && x.name === body.name_input);
      return send(res, 200, u ? { auth_id: u.auth_id, name: u.name } : null);
    }
    return send(res, 200, {});
  }

  // ---- PostgREST ----
  const restMatch = /^\/rest\/v1\/([\w]+)$/.exec(path);
  if (restMatch) {
    const table = restMatch[1];
    const rows = db[table] || (db[table] = []);
    const wantsSingle = String(req.headers.accept || '').includes('vnd.pgrst.object');

    if (req.method === 'GET' || req.method === 'HEAD') {
      // 过滤 → 排序 → 分页 → 嵌入，与 PostgREST 的处理顺序一致
      const filtered = applyOrder(applyFilters([...rows], url.searchParams), url.searchParams.get('order'));
      const total = filtered.length;
      const { start, rows: windowed } = paginate(filtered, url.searchParams, req.headers.range);

      // FK 嵌入（select 里的 alias:表/列(fields) 形态）
      const select = url.searchParams.get('select') || '';
      const out = embedRows(windowed, select);

      // count=exact（含 head:true）→ 用 Content-Range 回传总数（分子是本次窗口，分母是过滤后总数）
      const prefer = String(req.headers.prefer || '');
      const extra = {};
      if (prefer.includes('count=exact')) {
        extra['Content-Range'] = total
          ? `${start}-${start + out.length - 1}/${total}`
          : '*/0';
      }
      if (wantsSingle) {
        return out.length ? send(res, 200, out[0], extra) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null });
      }
      if (req.method === 'HEAD') {
        res.writeHead(200, { ...CORS, ...extra });
        return res.end();
      }
      return send(res, 200, out, extra);
    }
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
      const body = await readBody(req);
      if (req.method === 'POST') {
        const created = Array.isArray(body) ? body : [body];
        for (const item of created) {
          const row = { id: uid(++seq), created_at: new Date().toISOString(), ...TABLE_DEFAULTS[table], ...item };
          rows.push(row);
        }
        const prefer = String(req.headers.prefer || '');
        if (prefer.includes('representation')) {
          const out = created.map((item) => ({ id: rows[rows.length - 1].id, created_at: rows[rows.length - 1].created_at, ...item }));
          return send(res, 201, wantsSingle ? out[0] : out);
        }
        return send(res, 201, '');
      }
      if (req.method === 'PATCH') {
        const targets = applyFilters([...rows], url.searchParams);
        for (const t of targets) Object.assign(t, body);
        return send(res, 200, wantsSingle ? targets[0] || null : targets);
      }
      if (req.method === 'DELETE') {
        const targets = applyFilters([...rows], url.searchParams);
        for (const t of targets) rows.splice(rows.indexOf(t), 1);
        return send(res, 204, '');
      }
    }
  }

  if (path === '/' || path === '/health') return send(res, 200, { ok: true, stub: true });
  return send(res, 200, {});
});

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

server.listen(PORT, () => console.log(`[dev-stub] Supabase stub on http://127.0.0.1:${PORT} (tables: ${Object.keys(db).length})`));
