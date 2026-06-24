import { useState } from 'react';
import { Form, Input, Switch, Button, message } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { createSchoolNotice } from './schoolService';

const { TextArea } = Input;

interface SchoolNoticeFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

export default function SchoolNoticeForm({ onSuccess, onClose }: SchoolNoticeFormProps) {
  const user = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { title: string; content: string; is_pinned: boolean }) => {
    setLoading(true);
    const notice = await createSchoolNotice({
      title: values.title,
      content: values.content ?? '',
      is_pinned: values.is_pinned,
      created_by: user.id,
    });
    setLoading(false);

    if (notice) {
      message.success('校讯发布成功');
      onSuccess();
    } else {
      message.error('发布失败');
    }
  };

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>🏫 发布校讯</h3>
      <Form
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ is_pinned: true }}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="通知标题" maxLength={100} />
        </Form.Item>

        <Form.Item name="content" label="内容">
          <TextArea rows={5} placeholder="通知详细内容" maxLength={5000} />
        </Form.Item>

        <Form.Item name="is_pinned" label="置顶" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>发布</Button>
        </Form.Item>
      </Form>
    </div>
  );
}
