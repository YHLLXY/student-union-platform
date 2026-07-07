import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';

const log = logger.for('guide/guideService');

export interface GuideEntry {
  id: string;
  module_key: string;
  title: string;
  content: string;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  updater_name?: string;
}

/** 按模块获取所有指南条目（按 sort_order 排序） */
export async function fetchGuides(moduleKey: string): Promise<GuideEntry[]> {
  const { data, error } = await supabase
    .from('platform_guides')
    .select('*, creator:created_by(name), updater:updated_by(name)')
    .eq('module_key', moduleKey)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    log.error('fetchGuides 查询失败', error);
    return [];
  }

  return (data || []).map((g: Record<string, unknown>) => ({
    ...g,
    creator_name: (g.creator as { name: string } | null)?.name ?? undefined,
    updater_name: (g.updater as { name: string } | null)?.name ?? undefined,
  })) as unknown as GuideEntry[];
}

/** 创建指南条目 */
export async function createGuide(entry: {
  module_key: string;
  title: string;
  content: string;
  sort_order?: number;
  created_by: string;
}): Promise<GuideEntry | null> {
  const { data, error } = await supabase
    .from('platform_guides')
    .insert({
      module_key: entry.module_key,
      title: entry.title,
      content: entry.content,
      sort_order: entry.sort_order ?? 0,
      created_by: entry.created_by,
      updated_by: entry.created_by,
    })
    .select('*, creator:created_by(name), updater:updated_by(name)')
    .single();

  if (error) {
    log.error('createGuide 创建失败', error);
    return null;
  }

  const g = data as Record<string, unknown>;
  return {
    ...g,
    creator_name: (g.creator as { name: string } | null)?.name ?? undefined,
    updater_name: (g.updater as { name: string } | null)?.name ?? undefined,
  } as unknown as GuideEntry;
}

/** 更新指南条目 */
export async function updateGuide(
  id: string,
  updates: {
    title?: string;
    content?: string;
    sort_order?: number;
    updated_by: string;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from('platform_guides')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    log.error('updateGuide 更新失败', error);
    return false;
  }
  return true;
}

/** 默认指南内容 */
const DEFAULT_GUIDES: { module_key: string; title: string; content: string; sort_order: number }[] = [
  {
    module_key: 'tasks', title: '任务系统概述', sort_order: 0,
    content: '任务管理是本平台的核心功能，用于分配、跟踪和审核学生会各部门的工作任务。\n\n【角色与权限】\n• 普通成员（志愿者）：查看分配给自己的任务，提交完成申请\n• 部门负责人：发布任务、指定执行人、审核提交、管理模板\n• 主席团及以上：跨部门查看所有任务\n\n【任务生命周期】\n待开始 → 进行中 → 待审核 → 已完成\n\n负责人发布任务后，任务状态为"待开始"。执行人可以自行将状态改为"进行中"。完成后提交审核，状态变为"待审核"。负责人审核通过后标记为"已完成"。',
  },
  {
    module_key: 'tasks', title: '如何查看与提交任务', sort_order: 1,
    content: '【查看任务】\n进入"任务管理"页面，默认显示与你相关的所有任务。顶部 Tab 可按状态筛选：全部 / 待开始 / 进行中 / 待审核 / 已完成。\n\n【提交任务】\n1. 点击任务卡片，进入任务详情\n2. 在"提交成果"区域填写完成说明（做了什么、如何完成、注意事项）\n3. 点击"提交审核"\n4. 等待负责人审核，审核结果会即时反馈\n\n【注意事项】\n• 提交后不可撤回修改，请确认内容完整后再提交\n• 如果任务有关联的里程碑（子任务），建议在提交前完成所有里程碑\n• 逾期未提交的任务会在统计面板中显示红色警告',
  },
  {
    module_key: 'tasks', title: '任务优先级与里程碑说明', sort_order: 2,
    content: '【优先级】\n每个任务有一个优先级，用卡片左侧色条和 Tag 标识：\n• 紧急（红色）— 需要立即处理，通常有较紧的截止时间\n• 重要（橙色）— 重要但不紧急，需合理安排时间\n• 普通（蓝色）— 常规任务，按部就班完成\n\n【里程碑（子任务）】\n负责人可将大任务拆分为多个里程碑：\n• 每个里程碑有自己的标题和截止日期\n• 执行人在任务详情中逐个勾选完成\n• 逾期的里程碑会显示红色警告标记\n• 负责人可在任务详情中查看所有里程碑的完成进度',
  },
  {
    module_key: 'notices', title: '公告系统概述', sort_order: 0,
    content: '部门公告是本部门内部信息传达的主要渠道，包括通知、会议纪要和活动信息。\n\n【公告类型】\n• 通知 — 一般性工作通知，如部门会议提醒、材料提交截止等\n• 会议纪要 — 部门会议的记录和决议，便于缺席成员补看\n• 活动 — 部门组织的各类活动信息\n\n【置顶规则】\n部门负责人及以上可以将重要公告置顶。置顶公告始终显示在列表最上方，确保不会被遗漏。建议将长期有效的公告（如部门规章制度）置顶。',
  },
  {
    module_key: 'notices', title: '如何发布与管理公告', sort_order: 1,
    content: '【发布公告】（需部门负责人及以上权限）\n1. 点击"发布公告"按钮\n2. 填写标题、选择类型（通知/会议纪要/活动）\n3. 编写正文内容\n4. 可选择关联已有任务，关联后任务详情中会显示公告链接\n5. 发布后本部门所有成员可见\n\n【关联任务】\n公告可以关联到已有任务。例如：发布"迎新晚会任务分工"公告时，可直接关联已创建的晚会相关任务。执行人在查看任务时能看到公告链接，避免信息分散。\n\n【管理功能】\n• 置顶/取消置顶\n• 编辑公告内容（修改后原发布时间不变）\n• 删除公告',
  },
  {
    module_key: 'forum', title: '论坛使用指南', sort_order: 0,
    content: '部门论坛是部门内部的交流讨论空间，支持发帖和回复。\n\n【论坛分类】\n• 工作讨论 — 日常工作话题，如方案讨论、问题求助\n• 活动策划 — 活动方案的讨论和征求意见\n• 资料共享 — 文件和资源分享，如模板、教程链接\n• 闲聊 — 轻松的社交话题\n• 知识库 — 重要文档和模板的归档区\n\n【发帖与回复】\n• 发帖时需选择分类，标题简洁明了\n• 正文支持换行和分段排版\n• 可回复他人帖子进行讨论\n• 知识库分类的帖子由负责人维护，作为部门长期参考资料',
  },
  {
    module_key: 'forum', title: '知识库使用说明', sort_order: 1,
    content: '【什么是知识库】\n知识库是部门论坛中的特殊分类（📚 知识库），用于沉淀部门的重要文档、模板和经验总结。与普通讨论帖不同，知识库帖子是长期保留的参考资料。\n\n【适合放入知识库的内容】\n• 部门工作流程和规范文档\n• 常用模板（活动策划模板、会议纪要模板等）\n• 往年活动经验总结\n• 常见问题解答（FAQ）\n\n【维护方式】\n• 部门负责人及以上可以编辑和整理知识库帖子\n• 建议定期清理过时内容，保持知识库的时效性\n• 好的知识库能让新人快速上手',
  },
  {
    module_key: 'profile', title: '个人中心概述', sort_order: 0,
    content: '个人中心汇集了你的个人信息和工作数据，是了解自己工作状况的主要入口。\n\n【页面结构】\n• 顶部统计卡片 — 已完成/待完成/已逾期任务数量，点击可查看详情\n• 工作量热力图 — 按日历展示你每天的提交活跃度\n• 本月任务排行 — 本部门成员完成排名（仅负责人及以上可见）\n• 任务日历 — 在日历上查看各日期的任务分布\n• 通讯录 — 全学生会成员信息\n• 新人指南 — 本部门常用信息和 FAQ\n\n【数据说明】\n• 统计卡片点击后会弹出详细任务列表，分为已完成/待完成/已逾期三个 Tab\n• 热力图基于你实际提交任务的时间生成，颜色越深表示当天越活跃\n• 修改密码入口在页面底部"个人信息"区域',
  },
  {
    module_key: 'profile', title: '统计面板与工作量查看', sort_order: 1,
    content: '【顶部统计卡片】\n三个卡片分别显示：已完成、待完成、已逾期的任务数量。点击任一卡片弹出任务列表弹窗，弹窗内按三个状态分 Tab 展示，可查看每个任务的具体信息（标题、优先级、截止日期、所属部门）。\n\n【工作量热力图】\n• 展示你每月的工作活跃度\n• 每个格子代表一天，颜色越深表示当天提交的任务越多\n• 点击有数据的格子，可以看到当天提交了哪些任务\n• 通过左右箭头切换月份\n• 统计学口径：统计的是你实际提交任务的时间，不是任务截止日期\n\n【任务日历】\n• 在日历视图上查看各日期的任务分布\n• 点击日期格子可以看到当天截止/提交的任务列表\n• 切换月份时自动加载对应月的任务数据',
  },
  {
    module_key: 'profile', title: '排行榜与通讯录', sort_order: 2,
    content: '【本月任务排行】\n• 显示本部门成员本月完成任务数的排名（仅负责人及以上可见）\n• 前三名以领奖台卡片形式展示（🥇🥈🥉）\n• 第四名及以后显示排行榜列表，含进度条\n• 当前用户的行会高亮显示\n• 数据来源：当月截止日期在本月的已完成任务数\n\n【通讯录】\n• 查看全学生会所有成员信息\n• 支持按部门筛选（顶部 Tag 栏）\n• 支持按姓名或学号搜索\n• 普通成员查看通讯录时，不显示联系方式\n• 每张成员卡片显示该成员当前的任务统计\n\n【新人指南】\n• 由部门负责人维护的部门专属指南\n• 包含：部门基本信息、常用模板链接、FAQ\n• 新成员加入后应首先查看本部门的新人指南',
  },
];

/** 如果表为空则播种默认数据（幂等） */
export async function seedDefaultGuides(): Promise<void> {
  const { count, error } = await supabase
    .from('platform_guides')
    .select('id', { count: 'exact', head: true });

  if (error) {
    log.error('seedDefaultGuides 查询失败', error);
    return;
  }

  if ((count ?? 0) > 0) return; // 已有数据，跳过

  const { error: insertError } = await supabase
    .from('platform_guides')
    .insert(DEFAULT_GUIDES);

  if (insertError) {
    log.error('seedDefaultGuides 插入失败', insertError);
  }
}

/** 删除指南条目 */
export async function deleteGuide(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('platform_guides')
    .delete()
    .eq('id', id);

  if (error) {
    log.error('deleteGuide 删除失败', error);
    return false;
  }
  return true;
}
