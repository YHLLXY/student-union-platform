import { describe, it, expect } from 'vitest';
import {
  fetchTasks, fetchTaskDetail, createTask, updateTaskStatus, submitTask,
  fetchTaskSubmissions, reviewSubmission,
  fetchTemplates, createTemplate, updateTemplate, deleteTemplate,
  fetchMilestones, createMilestone, updateMilestoneStatus, deleteMilestone,
  fetchTaskOverdueMilestones, fetchLinkedNotices,
} from '@/modules/tasks/taskService';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U_ZHAOMIN = uid(4);   // 赵敏 宣传部部长
const U_SUN = uid(5);       // 孙晓雨 宣传部志愿者
const U_PRES = uid(2);      // 陈主席

const uniqTitle = (p: string) => `${p}-${Date.now().toString(36).slice(-6)}`;

describe('fetchTasks 角色数据边界', () => {
  it('president 视角看全部，creator_name 正确联出', async () => {
    const all = await fetchTasks(U_PRES, 'presidium', 'president');
    expect(all.length).toBeGreaterThanOrEqual(8);
    const withCreator = all.find((t) => t.title.startsWith('秋季迎新晚会'));
    expect(withCreator!.creator_name).toBe('刘副主席');
  });

  it('dept_head 视角只看本部门', async () => {
    const rows = await fetchTasks(U_ZHAOMIN, 'publicity', 'dept_head');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.assigned_department === 'publicity')).toBe(true);
  });

  it('volunteer 视角 = 指派给自己 ∪ 本部门（or 条件）', async () => {
    const rows = await fetchTasks(U_SUN, 'publicity', 'volunteer');
    expect(rows.length).toBeGreaterThan(0);
    for (const t of rows) {
      expect(t.assigned_to === U_SUN || t.assigned_department === 'publicity').toBe(true);
    }
  });
});

describe('fetchTaskDetail', () => {
  it('按 id 取详情并联出发布者', async () => {
    const t = await fetchTaskDetail(uid(201));
    expect(t).not.toBeNull();
    expect(t!.assigned_department).toBe('publicity');
    expect(t!.creator_name).not.toBe('未知');
  });
});

describe('createTask → submitTask → reviewSubmission 闭环', () => {
  let taskId = '';
  let submissionId = '';

  it('创建任务默认 pending 状态', async () => {
    const t = await createTask({
      title: uniqTitle('单测任务'), content: '内容', priority: 'normal',
      assigned_department: 'publicity', created_by: U_ZHAOMIN,
    });
    expect(t).not.toBeNull();
    expect(t!.status).toBe('pending');
    taskId = t!.id;
  });

  it('提交后状态转 review，重复提交被拒', async () => {
    const r1 = await submitTask(taskId, U_SUN, '已完成，请查收');
    expect(r1.success).toBe(true);
    expect((await fetchTaskDetail(taskId)).status).toBe('review');

    const r2 = await submitTask(taskId, U_SUN, '再交一次');
    expect(r2.success).toBe(false);
    expect(r2.error).toContain('已提交过');
  });

  it('提交记录联出提交者姓名', async () => {
    const subs = await fetchTaskSubmissions(taskId);
    expect(subs.length).toBe(1);
    submissionId = subs[0].id;
    expect(subs[0].submitter_name).toBe('孙晓雨');
  });

  it('审核通过：提交转 approved，任务转 completed，提交者收通知', async () => {
    const ok = await reviewSubmission(submissionId, taskId, true, '干得漂亮');
    expect(ok).toBe(true);
    expect((await fetchTaskDetail(taskId)).status).toBe('completed');

    const subs = await fetchTaskSubmissions(taskId);
    expect(subs[0].status).toBe('approved');
    expect(subs[0].review_note).toBe('干得漂亮');

    // 审核结果通知（fire-and-forget，稍等写入）
    await new Promise((r) => setTimeout(r, 300));
    const { fetchNotifications } = await import('@/modules/notification/notificationService');
    const notes = (await fetchNotifications(U_SUN)).items;
    expect(notes.some((n) => n.type === 'submission_approved' && n.title.includes('通过'))).toBe(true);
  });

  it('打回：提交转 rejected，任务回到 in_progress', async () => {
    const t = await createTask({
      title: uniqTitle('打回流'), content: '', priority: 'normal',
      assigned_department: 'publicity', created_by: U_ZHAOMIN,
    });
    await submitTask(t!.id, U_SUN, '第一版');
    const subs = await fetchTaskSubmissions(t!.id);
    const ok = await reviewSubmission(subs[0].id, t!.id, false, '重做');
    expect(ok).toBe(true);
    expect((await fetchTaskDetail(t!.id)).status).toBe('in_progress');
    const after = await fetchTaskSubmissions(t!.id);
    expect(after[0].status).toBe('rejected');
  });
});

describe('updateTaskStatus / updateTask 基础写', () => {
  it('状态更新生效', async () => {
    const t = await createTask({
      title: uniqTitle('状态机'), content: '', priority: 'low' as never,
      assigned_department: 'publicity', created_by: U_ZHAOMIN,
    });
    expect(await updateTaskStatus(t!.id, 'in_progress')).toBe(true);
    expect((await fetchTaskDetail(t!.id)).status).toBe('in_progress');
  });
});

describe('任务模板 CRUD', () => {
  it('fetchTemplates 按部门过滤', async () => {
    const rows = await fetchTemplates('publicity');
    expect(rows.some((t) => t.title.includes('推文发布流程'))).toBe(true);
    expect(rows.every((t) => t.department === 'publicity')).toBe(true);
  });

  it('创建→更新→删除', async () => {
    const t = await createTemplate({
      title: uniqTitle('单测模板'), description: '描述', department: 'testdept',
      steps: [{ order: 1, title: '第一步', description: '' } as never],
      created_by: U_ZHAOMIN,
    });
    expect(t).not.toBeNull();

    expect(await updateTemplate(t!.id, { title: '改名后的模板' })).toBe(true);
    const after = await fetchTemplates('testdept');
    expect(after.some((x) => x.id === t!.id && x.title === '改名后的模板')).toBe(true);

    expect(await deleteTemplate(t!.id)).toBe(true);
    expect((await fetchTemplates('testdept')).some((x) => x.id === t!.id)).toBe(false);
  });
});

describe('任务里程碑', () => {
  it('fetchMilestones 按 sort_order 排序并联出完成人', async () => {
    const rows = await fetchMilestones(uid(201));
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.sort_order)).toEqual([1, 2, 3]);
    expect(rows[0].completer_name).toBe('孙晓雨');
  });

  it('创建→勾选完成→删除', async () => {
    const m = await createMilestone({ task_id: uid(202), title: '单测里程碑' });
    expect(m).not.toBeNull();
    expect(m!.status).toBe('pending');

    expect(await updateMilestoneStatus(m!.id, 'completed', U_ZHAOMIN)).toBe(true);
    const done = (await fetchMilestones(uid(202))).find((x) => x.id === m!.id);
    expect(done!.status).toBe('completed');
    expect(done!.completed_at).toBeTruthy();

    expect(await deleteMilestone(m!.id)).toBe(true);
    expect((await fetchMilestones(uid(202))).some((x) => x.id === m!.id)).toBe(false);
  });

  it('逾期里程碑计数：种子任务 201 无逾期 pending', async () => {
    expect(await fetchTaskOverdueMilestones(uid(201))).toBe(0);
  });

  it('新建已逾期 pending 里程碑后计数 +1', async () => {
    const m = await createMilestone({
      task_id: uid(202), title: '逾期里程碑',
      deadline: new Date(Date.now() - 86400e3).toISOString(),
    });
    expect(await fetchTaskOverdueMilestones(uid(202))).toBe(1);
    await deleteMilestone(m!.id);
    expect(await fetchTaskOverdueMilestones(uid(202))).toBe(0);
  });
});

describe('fetchLinkedNotices（contains 过滤）', () => {
  it('只返回关联了指定任务的公告', async () => {
    const rows = await fetchLinkedNotices(uid(201));
    expect(rows.length).toBe(1);
    expect(rows[0].title).toContain('彩排时间调整');
  });

  it('无关联时返回空', async () => {
    expect(await fetchLinkedNotices(uid(203))).toEqual([]);
  });
});
