import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { Form, Input, Select, DatePicker, Button, message } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { DEPARTMENTS } from '../../utils/constants';
import { createTask } from './taskService';

const { TextArea } = Input;

interface TaskFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

export default function TaskForm({ onSuccess, onClose }: TaskFormProps) {
  const user = useAuth();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: {
    title: string;
    content: string;
    priority: string;
    assignType: string;
    assignedDepartment: string;
    deadline: Dayjs | null;
  }) => {
    setLoading(true);
    const task = await createTask({
      title: values.title,
      content: values.content ?? '',
      priority: values.priority,
      assigned_department: values.assignedDepartment,
      deadline: values.deadline?.toISOString() ?? null,
      created_by: user.id,
    });

    setLoading(false);
    if (task) {
      message.success('任务发布成功');
      onSuccess();
    } else {
      message.error('发布失败，请重试');
    }
  }

  // 负责人只能给本部门发任务
  const myDept = user.department;
  const deptOptions = Object.entries(DEPARTMENTS)
    .filter(([key]) => user.role === 'teacher' || user.role === 'presidium' || key === myDept)
    .map(([key, label]) => ({ value: key, label }));

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>📝 发布任务</h3>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          priority: 'normal',
          assignType: 'department',
          assignedDepartment: myDept,
        }}
      >
        <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="输入任务标题" maxLength={100} />
        </Form.Item>

        <Form.Item name="content" label="任务内容">
          <TextArea rows={4} placeholder="描述任务详情" maxLength={2000} />
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

        <Form.Item name="deadline" label="截止时间">
          <DatePicker showTime style={{ width: '100%' }} placeholder="选择截止时间（可选）" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>发布</Button>
        </Form.Item>
      </Form>
    </div>
  );
}
