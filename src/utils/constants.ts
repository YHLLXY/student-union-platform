// 12 个部门 + 开发者
export const DEPARTMENTS: Record<string, string> = {
  presidium: '主席主任团',
  student_office: '学办',
  academic_support: '学辅',
  youth_volunteers: '青协',
  organization: '组织部',
  student_aid: '学资',
  science_competition: '科项+科竞部',
  publicity: '宣传部',
  life_services: '生活服务部',
  sports: '体育部',
  arts: '文艺部',
  humanities: '人文部',
  developer: '开发者',
};

// 6 种角色
export const ROLES: Record<string, string> = {
  volunteer: '常驻志愿者',
  dept_head: '部门负责人',
  presidium: '主席团成员',
  president: '主席',
  teacher: '老师',
  developer: '开发者',
};

// 角色权限层级（数字越大权限越高）
export const ROLE_LEVEL: Record<string, number> = {
  volunteer: 0,
  dept_head: 1,
  presidium: 2,
  president: 3,
  teacher: 3,
  developer: 3,
};

// 任务优先级
export const TASK_PRIORITIES: Record<string, { label: string; color: string }> = {
  urgent: { label: '紧急', color: '#e74c3c' },
  important: { label: '重要', color: '#e67e22' },
  normal: { label: '普通', color: '#3498db' },
};

// 任务状态
export const TASK_STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: '待开始', color: '#95a5a6' },
  in_progress: { label: '进行中', color: '#3498db' },
  review: { label: '待审核', color: '#e67e22' },
  completed: { label: '已完成', color: '#27ae60' },
  overdue: { label: '已逾期', color: '#e74c3c' },
};

// 公告类型
export const NOTICE_TYPES: Record<string, string> = {
  notification: '通知',
  meeting: '会议纪要',
  activity: '活动',
};

// 论坛分类
export const FORUM_CATEGORIES: Record<string, string> = {
  all: '全部',
  discussion: '工作讨论',
  activity: '活动策划',
  resource: '资料共享',
  casual: '闲聊',
  knowledge: '📚 知识库',
};

// 菜单配置
export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  path: string;
  minRole: number; // ROLE_LEVEL 最低要求
}

export const MENU_ITEMS: MenuItem[] = [
  { key: 'tasks', label: '任务管理', icon: 'CheckSquareOutlined', path: '/tasks', minRole: 0 },
  { key: 'notices', label: '部门公告', icon: 'BellOutlined', path: '/notices', minRole: 0 },
  { key: 'school', label: '学校信息', icon: 'BankOutlined', path: '/school', minRole: 0 },
  { key: 'forum', label: '部门论坛', icon: 'MessageOutlined', path: '/forum', minRole: 0 },
  { key: 'tickets', label: '活动抢票', icon: 'GiftOutlined', path: '/tickets', minRole: 0 },
  { key: 'admin', label: '权限管理', icon: 'SettingOutlined', path: '/admin', minRole: 1 },
  { key: 'profile', label: '个人中心', icon: 'UserOutlined', path: '/profile', minRole: 0 },
];

/** 诊断标签 — 模块/组件级，搜标签即定位到文件 */
export const MODULE_TAGS = {
  auth: {
    LoginPage: 'auth/LoginPage',
    authService: 'auth/authService',
  },
  tasks: {
    TaskListPage: 'tasks/TaskListPage',
    TaskDetail: 'tasks/TaskDetail',
    TaskForm: 'tasks/TaskForm',
    taskService: 'tasks/taskService',
    TaskTemplateManage: 'tasks/TaskTemplateManage',
  },
  notices: {
    NoticeList: 'notices/NoticeList',
    NoticeForm: 'notices/NoticeForm',
    noticeService: 'notices/noticeService',
  },
  school: {
    SchoolNoticeList: 'school/SchoolNoticeList',
    SchoolNoticeForm: 'school/SchoolNoticeForm',
    schoolService: 'school/schoolService',
  },
  profile: {
    ProfilePage: 'profile/ProfilePage',
    ChangePassword: 'profile/ChangePassword',
    TaskCalendar: 'profile/TaskCalendar',
    Heatmap: 'profile/Heatmap',
    Leaderboard: 'profile/Leaderboard',
    profileService: 'profile/profileService',
  },
  forum: {
    PostList: 'forum/PostList',
    PostDetail: 'forum/PostDetail',
    PostForm: 'forum/PostForm',
    forumService: 'forum/forumService',
  },
  admin: {
    MemberManage: 'admin/MemberManage',
    InviteCodeManage: 'admin/InviteCodeManage',
    WorkOverview: 'admin/WorkOverview',
    adminService: 'admin/adminService',
  },
  tickets: {
    TicketList: 'tickets/TicketList',
    TicketForm: 'tickets/TicketForm',
    MyTickets: 'tickets/MyTickets',
    ticketService: 'tickets/ticketService',
  },
} as const;
