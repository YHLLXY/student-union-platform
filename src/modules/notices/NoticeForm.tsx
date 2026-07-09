import { useState, useEffect } from 'react';
import { Form, Input, Select, Switch, Button, message } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { createNotice, fetchActiveTasksForLinking } from './noticeService';
import FileUpload, { type Attachment } from '../../components/FileUpload';

const { TextArea } = Input;

interface NoticeFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

export default function NoticeForm({ onSuccess, onClose }: NoticeFormProps) {
  const user = useAuth();
  const [loading, setLoading] = useState(false);
  const [taskOptions, setTaskOptions] = useState<{ value: string; label: string }[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    fetchActiveTasksForLinking(user.department).then((tasks) => {
      setTaskOptions(tasks.map((t) => ({
        value: t.id,
        label: `[${t.status === 'review' ? '待审' : t.status === 'in_progress' ? '进行中' : '待开始'}] ${t.title}`,
      })));
    });
  }, [user.department]);

  const handleSubmit = async (values: {
    title: string; content: string; type: string; is_pinned: boolean; linked_tasks?: string[];
  }) => {
    setLoading(true);
    const notice = await createNotice({
      title: values.title,
      content: values.content ?? '',
      type: values.type,
      department: user.department,
      is_pinned: values.is_pinned,
      created_by: user.id,
      linked_tasks: values.linked_tasks ?? [],
      attachments,
    });
    setLoading(false);
    if (notice) { message.success('公告发布成功'); onSuccess(); }
    else { message.error('发布失败'); }
  };

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>📢 发布公告</h3>
      <Form
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ type: 'notification', is_pinned: false }}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="公告标题" maxLength={100} />
        </Form.Item>

        <Form.Item name="type" label="类型">
          <Select
            options={[
              { value: 'notification', label: '通知' },
              { value: 'meeting', label: '会议纪要' },
              { value: 'activity', label: '活动' },
            ]}
          />
        </Form.Item>

        <Form.Item name="content" label="内容">
          <TextArea rows={5} placeholder="公告详细内容" maxLength={5000} />
        </Form.Item>

        <Form.Item name="linked_tasks" label="🔗 关联任务（可选）">
          <Select
            mode="multiple"
            placeholder="搜索并选择本部门进行中的任务"
            options={taskOptions}
            allowClear
            showSearch
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>

        <Form.Item name="is_pinned" label="置顶" valuePropName="checked">
          <Switch />
        </Form.Item>

        <FileUpload module="notices" value={attachments} onChange={setAttachments} />

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>发布</Button>
        </Form.Item>
      </Form>
    </div>
  );
}
