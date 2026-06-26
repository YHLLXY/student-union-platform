import supabase from '../../supabaseClient';
import { logger } from '../../diagnostics';

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

/** 按角色权限获取任务列表 */
export async function fetchTasks(userId: string, department: string, role: string): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select('*, creator:created_by(name), assignee:assigned_to(name)')
    .order('created_at', { ascending: false });

  // 志愿者只看指派给自己的或本部门的任务
  if (role === 'volunteer') {
    query = query.or(`assigned_to.eq.${userId},assigned_department.eq.${department}`);
  } else if (role === 'dept_head' || role === 'presidium') {
    // 负责人和主席团看本部门的
    query = query.eq('assigned_department', department);
  }
  // teacher 看全部，不加过滤

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
}): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...task,
      status: 'pending',
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
