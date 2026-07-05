import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';
import { hasMinRole } from '../../utils/helpers';

const log = logger.for('tasks/taskService');

export interface Task {
  id: string;
  title: string;
  content: string;
  priority: string;
  status: string;
  deadline: string | null;
  created_by: string;
  assigned_to: string | null;
  assigned_department: string;
  creator_name?: string;
  assignee_name?: string;
  created_at: string;
  updated_at: string;
  // 新增字段
  template_id?: string | null;
  handover_note?: string | null;
  collaborating_departments?: string[];
  // 关联公告
  linked_notices?: LinkedNotice[];
  // 二期新增
  linked_notice_id?: string | null;
  has_milestones?: boolean;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  user_id: string;
  note: string;
  status: string;
  review_note: string;
  submitter_name?: string;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface LinkedNotice {
  id: string;
  title: string;
  type: string;
}

export interface TaskMilestone {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: 'pending' | 'completed';
  sort_order: number;
  completed_at: string | null;
  completed_by: string | null;
  completer_name?: string;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string | null;
  department: string;
  steps: TemplateStep[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateStep {
  order: number;
  title: string;
  description: string;
}

/** 按角色权限获取任务列表 */
export async function fetchTasks(userId: string, department: string, role: string): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select('*, creator:created_by(name), assignee:assigned_to(name)')
    .order('created_at', { ascending: false });

  // volunteer: 只看指派给自己的或本部门的任务
  if (!hasMinRole(role, 'dept_head')) {
    query = query.or(`assigned_to.eq.${userId},assigned_department.eq.${department}`);
  } else if (!hasMinRole(role, 'president')) {
    // dept_head / presidium: 看本部门的
    query = query.eq('assigned_department', department);
  }
  // president / teacher / developer: 看全部，不加过滤

  const { data, error } = await query;

  if (error) {
    log.error('fetchTasks 查询失败', error);
    return [];
  }

  return (data || []).map((t: Record<string, unknown>) => ({
    ...t,
    creator_name: (t.creator as { name: string } | null)?.name ?? '未知',
    assignee_name: (t.assignee as { name: string } | null)?.name ?? undefined,
  })) as unknown as Task[];
}

/** 获取单个任务详情 */
export async function fetchTaskDetail(taskId: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, creator:created_by(name), assignee:assigned_to(name)')
    .eq('id', taskId)
    .single();

  if (error || !data) return null;

  const t = data as Record<string, unknown>;
  return {
    ...t,
    creator_name: (t.creator as { name: string } | null)?.name ?? '未知',
    assignee_name: (t.assignee as { name: string } | null)?.name ?? undefined,
  } as unknown as Task;
}

/** 创建任务 */
export async function createTask(task: {
  title: string;
  content: string;
  priority: string;
  assigned_department: string;
  assigned_to?: string | null;
  deadline?: string | null;
  created_by: string;
  template_id?: string | null;
  collaborating_departments?: string[];
  has_milestones?: boolean;    // 二期新增
  linked_notice_id?: string;   // 二期新增
}): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: task.title,
      content: task.content,
      priority: task.priority,
      assigned_department: task.assigned_department,
      assigned_to: task.assigned_to ?? null,
      deadline: task.deadline ?? null,
      created_by: task.created_by,
      status: 'pending',
      template_id: task.template_id ?? null,
      collaborating_departments: task.collaborating_departments ?? [],
      has_milestones: task.has_milestones ?? false,
      linked_notice_id: task.linked_notice_id ?? null,
    })
    .select('*')
    .single();

  if (error) {
    log.error('createTask 创建失败', error);
    return null;
  }
  return data as Task;
}

/** 更新任务状态 */
export async function updateTaskStatus(taskId: string, status: string): Promise<boolean> {
  const { error } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId);

  return !error;
}

/** 提交任务（成员完成） */
export async function submitTask(
  taskId: string,
  userId: string,
  note: string,
): Promise<{ success: boolean; error?: string }> {
  // 检查是否已提交
  const { data: existing } = await supabase
    .from('task_submissions')
    .select('id')
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return { success: false, error: '你已提交过该任务' };
  }

  // 插入提交记录
  const { error: subError } = await supabase
    .from('task_submissions')
    .insert({ task_id: taskId, user_id: userId, note });

  if (subError) {
    return { success: false, error: subError.message };
  }

  // 更新任务状态为待审核
  await updateTaskStatus(taskId, 'review');

  return { success: true };
}

/** 获取任务提交记录 */
export async function fetchTaskSubmissions(taskId: string): Promise<TaskSubmission[]> {
  const { data, error } = await supabase
    .from('task_submissions')
    .select('*, submitter:user_id(name)')
    .eq('task_id', taskId)
    .order('submitted_at', { ascending: false });

  if (error) return [];

  return (data || []).map((s: Record<string, unknown>) => ({
    ...s,
    submitter_name: (s.submitter as { name: string } | null)?.name ?? '未知',
  })) as unknown as TaskSubmission[];
}

/** 审核提交（通过/打回） */
export async function reviewSubmission(
  submissionId: string,
  taskId: string,
  approved: boolean,
  reviewNote: string,
): Promise<boolean> {
  const { error: subError } = await supabase
    .from('task_submissions')
    .update({
      status: approved ? 'approved' : 'rejected',
      review_note: reviewNote,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  if (subError) return false;

  // 更新任务状态
  await updateTaskStatus(taskId, approved ? 'completed' : 'in_progress');

  return true;
}

/** 实时订阅任务变更 */
export function subscribeToTasks(
  department: string,
  callback: (task: Task) => void,
): () => void {
  const channel = supabase
    .channel('tasks-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'tasks',
        filter: `assigned_department=eq.${department}`,
      },
      (payload) => {
        callback(payload.new as Task);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'tasks',
        filter: `assigned_department=eq.${department}`,
      },
      (payload) => {
        callback(payload.new as Task);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ========== 任务模板 CRUD ==========

/** 获取本部门任务模板列表 */
export async function fetchTemplates(department: string): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('department', department)
    .order('created_at', { ascending: false });

  if (error) {
    log.error('fetchTemplates 查询失败', error);
    return [];
  }
  return (data || []) as TaskTemplate[];
}

/** 创建任务模板 */
export async function createTemplate(template: {
  title: string;
  description?: string;
  department: string;
  steps: TemplateStep[];
  created_by: string;
}): Promise<TaskTemplate | null> {
  const { data, error } = await supabase
    .from('task_templates')
    .insert(template)
    .select('*')
    .single();

  if (error) {
    log.error('createTemplate 创建失败', error);
    return null;
  }
  return data as TaskTemplate;
}

/** 更新任务模板 */
export async function updateTemplate(
  id: string,
  updates: { title?: string; description?: string; steps?: TemplateStep[] },
): Promise<boolean> {
  const { error } = await supabase
    .from('task_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    log.error('updateTemplate 更新失败', error);
    return false;
  }
  return true;
}

/** 删除任务模板 */
export async function deleteTemplate(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('task_templates')
    .delete()
    .eq('id', id);

  if (error) {
    log.error('deleteTemplate 删除失败', error);
    return false;
  }
  return true;
}

/** 更新任务交接备注 */
export async function updateHandoverNote(taskId: string, note: string): Promise<boolean> {
  const { error } = await supabase
    .from('tasks')
    .update({ handover_note: note, updated_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) {
    log.error('updateHandoverNote 更新失败', error);
    return false;
  }
  return true;
}

/** 获取关联到某任务的通知 */
export async function fetchLinkedNotices(taskId: string): Promise<LinkedNotice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select('id, title, type')
    .contains('linked_tasks', [taskId]);

  if (error) {
    log.error('fetchLinkedNotices 查询失败', error);
    return [];
  }
  return (data || []) as LinkedNotice[];
}

// ========== 任务里程碑 CRUD ==========

/** 获取任务的里程碑列表 */
export async function fetchMilestones(taskId: string): Promise<TaskMilestone[]> {
  const { data, error } = await supabase
    .from('task_milestones')
    .select('*, completer:completed_by(name)')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true });

  if (error) {
    log.error('fetchMilestones 查询失败', error);
    return [];
  }

  return (data || []).map((m: Record<string, unknown>) => ({
    ...m,
    completer_name: (m.completer as { name: string } | null)?.name ?? undefined,
  })) as unknown as TaskMilestone[];
}

/** 创建里程碑 */
export async function createMilestone(milestone: {
  task_id: string;
  title: string;
  description?: string;
  deadline?: string | null;
  sort_order?: number;
}): Promise<TaskMilestone | null> {
  const { data, error } = await supabase
    .from('task_milestones')
    .insert({ ...milestone, status: 'pending' })
    .select('*')
    .single();

  if (error) {
    log.error('createMilestone 创建失败', error);
    return null;
  }
  return data as TaskMilestone;
}

/** 更新里程碑状态（勾选完成/取消完成） */
export async function updateMilestoneStatus(
  id: string,
  status: 'pending' | 'completed',
  userId: string,
): Promise<boolean> {
  const update: Record<string, unknown> = { status };
  if (status === 'completed') {
    update.completed_at = new Date().toISOString();
    update.completed_by = userId;
  } else {
    update.completed_at = null;
    update.completed_by = null;
  }

  const { error } = await supabase
    .from('task_milestones')
    .update(update)
    .eq('id', id);

  if (error) {
    log.error('updateMilestoneStatus 更新失败', error);
    return false;
  }
  return true;
}

/** 删除里程碑 */
export async function deleteMilestone(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('task_milestones')
    .delete()
    .eq('id', id);

  if (error) {
    log.error('deleteMilestone 删除失败', error);
    return false;
  }
  return true;
}

/** 获取某任务的逾期里程碑数（用于任务卡片 Badge） */
export async function fetchTaskOverdueMilestones(taskId: string): Promise<number> {
  const { count } = await supabase
    .from('task_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId)
    .eq('status', 'pending')
    .lt('deadline', new Date().toISOString());

  return count ?? 0;
}
