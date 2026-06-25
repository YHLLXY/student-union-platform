import { useState } from 'react';
import { Form, Input, Select, Button, message } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { FORUM_CATEGORIES, DEPARTMENTS } from '../../utils/constants';
import { hasMinRole } from '../../utils/helpers';
import { createPost } from './forumService';

const { TextArea } = Input;

interface PostFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

const categoryOptions = Object.entries(FORUM_CATEGORIES)
  .filter(([key]) => key !== 'all')
  .map(([key, label]) => ({ value: key, label }));

const deptOptions = Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label }));

export default function PostForm({ onSuccess, onClose }: PostFormProps) {
  const user = useAuth();
  const [loading, setLoading] = useState(false);
  const canCollab = hasMinRole(user.role, 'presidium');

  const handleSubmit = async (values: {
    title: string;
    content: string;
    category: string;
    collaborating_departments?: string[];
  }) => {
    setLoading(true);
    const post = await createPost({
      title: values.title,
      content: values.content ?? '',
      category: values.category,
      department: user.department,
      created_by: user.id,
      collaborating_departments: values.collaborating_departments ?? [],
    });
    setLoading(false);

    if (post) {
      message.success('发帖成功');
      onSuccess();
    } else {
      message.error('发帖失败');
    }
  };

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>📝 发帖</h3>
      <Form
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ category: 'discussion' }}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="帖子标题" maxLength={100} />
        </Form.Item>

        <Form.Item name="category" label="分类">
          <Select options={categoryOptions} />
        </Form.Item>

        {canCollab && (
          <Form.Item name="collaborating_departments" label="协同部门（可选，不选则仅本部门可见）">
            <Select
              mode="multiple"
              placeholder="选择可查看此帖的部门"
              options={deptOptions}
              allowClear
            />
          </Form.Item>
        )}

        <Form.Item name="content" label="内容（支持 Markdown）">
          <TextArea rows={6} placeholder="支持 Markdown 格式编写" maxLength={10000} />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>发布</Button>
        </Form.Item>
      </Form>
    </div>
  );
}
