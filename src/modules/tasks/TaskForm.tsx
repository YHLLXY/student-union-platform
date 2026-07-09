import type { Dayjs } from 'dayjs';
import { useState, useEffect } from 'react';
import { Form, Input, Select, DatePicker, Button, Checkbox, message } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { DEPARTMENTS } from '../../utils/constants';
import { isAdmin } from '../../utils/helpers';
import { createTask, fetchTemplates } from './taskService';
import type { TaskTemplate } from './taskService';
import FileUpload, { type Attachment } from '../../components/FileUpload';

const { TextArea } = Input;

interface TaskFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

export default function TaskForm({ onSuccess, onClose }: TaskFormProps) {
  const user = useAuth();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    fetchTemplates(user.department).then(setTemplates);
  }, [user.department]);

  const handleTemplateSelect = (templateId: string) => {
    if (!templateId) {
      setSelectedTemplate(null);
      form.setFieldsValue({ content: '' });
      return;
    }
    setSelectedTemplate(templateId);
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      const stepsMd = tmpl.steps
        .map((s) => `- [ ] **${s.title}**${s.description ? ` — ${s.description}` : ''}`)
        .join('\n');
      const content = tmpl.description
        ? `${tmpl.description}\n\n## 步骤清单\n${stepsMd}`
        : `## 步骤清单\n${stepsMd}`;
      form.setFieldsValue({ content });
    }
  };

  const handleSubmit = async (values: {
    title: string;
    content: string;
    priority: string;
    assignedDepartment: string;
    deadline: Dayjs | null;
    collaborating_departments?: string[];
    enableMilestones?: boolean;
  }) => {
    setLoading(true);
    const task = await createTask({
      title: values.title,
      content: values.content ?? '',
      priority: values.priority,
      assigned_department: values.assignedDepartment,
      deadline: values.deadline?.toISOString() ?? null,
      created_by: user.id,
      template_id: selectedTemplate || null,
      collaborating_departments: values.collaborating_departments ?? [],
      has_milestones: values.enableMilestones ?? false,
      attachments,
    });

    setLoading(false);
    if (task) {
      message.success('任务发布成功');
      onSuccess();
    } else {
      message.error('发布失败，请重试');
    }
  };

  const myDept = user.department;
  const deptOptions = Object.entries(DEPARTMENTS)
    .filter(([key]) => isAdmin(user.role) || user.role === 'presidium' || key === myDept)
    .map(([key, label]) => ({ value: key, label }));

  const allDeptOptions = Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label }));

  const assignedDept = Form.useWatch('assignedDepartment', form);

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>📝 发布任务</h3>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          priority: 'normal',
          assignedDepartment: myDept,
        }}
      >
        {templates.length > 0 && (
          <Form.Item label="📋 从模板创建（可选）">
            <Select
              allowClear
              placeholder="选择已有模板自动填入内容"
              options={templates.map((t) => ({ value: t.id, label: t.title }))}
              onChange={(val) => handleTemplateSelect(val ?? '')}
            />
          </Form.Item>
        )}

        <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="输入任务标题" maxLength={100} />
        </Form.Item>

        <Form.Item name="content" label="任务内容">
          <TextArea rows={4} placeholder="描述任务详情" maxLength={5000} />
        </Form.Item>

        <Form.Item name="priority" label="优先级">
          <Select
            options={[
              { value: 'normal', label: '🔵 普通' },
              { value: 'important', label: '🟠 重要' },
              { value: 'urgent', label: '🔴 紧急' },
            ]}
          />
        </Form.Item>

        <Form.Item name="assignedDepartment" label="指派部门">
          <Select options={deptOptions} />
        </Form.Item>

        <Form.Item name="collaborating_departments" label="🤝 关联部门（可选）">
          <Select
            mode="multiple"
            placeholder="选择需要配合的部门"
            options={allDeptOptions.filter((d) => d.value !== assignedDept)}
            allowClear
          />
        </Form.Item>

        <Form.Item name="enableMilestones" valuePropName="checked">
          <Checkbox>✅ 启用里程碑模式，将模板步骤转为可追踪的检查点</Checkbox>
        </Form.Item>

        <Form.Item name="deadline" label="截止时间">
          <DatePicker showTime style={{ width: '100%' }} placeholder="选择截止时间（可选）" />
        </Form.Item>

        <FileUpload module="tasks" value={attachments} onChange={setAttachments} />

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>发布</Button>
        </Form.Item>
      </Form>
    </div>
  );
}
