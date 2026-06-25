import { useState } from 'react';
import { Modal, Form, Input, Select, Button, message } from 'antd';
import { BugOutlined, BulbOutlined, MessageOutlined } from '@ant-design/icons';

const { TextArea } = Input;

const FEEDBACK_TYPES = [
  { value: 'bug', label: '🐛 问题反馈', icon: <BugOutlined /> },
  { value: 'feature', label: '💡 功能建议', icon: <BulbOutlined /> },
  { value: 'other', label: '💬 其他意见', icon: <MessageOutlined /> },
];

const DEV_EMAIL = '3244780834@qq.com';

const BUG_TEMPLATE = `## 问题描述
（请详细描述遇到的问题）


## 复现步骤
1.
2.
3.

## 预期结果
（你期望看到什么）


## 实际结果
（实际发生了什么）


## 设备信息
- 浏览器：${navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Edge') ? 'Edge' : '其他'}
- 时间：${new Date().toLocaleString()}
`;

const FEATURE_TEMPLATE = `## 功能建议
（请描述你希望增加的功能）


## 使用场景
（什么情况下会用到这个功能）


`;

const OTHER_TEMPLATE = `## 反馈内容


`;

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [form] = Form.useForm();
  const [type, setType] = useState('bug');

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const typeLabel = FEEDBACK_TYPES.find((t) => t.value === type)?.label || '反馈';
      const subject = `[学生会平台反馈] ${typeLabel} — ${values.title || '无标题'}`;

      const body = [
        `反馈类型：${typeLabel}`,
        `标题：${values.title || '无'}`,
        ``,
        values.description || '',
        ``,
        `---`,
        `提交时间：${new Date().toLocaleString()}`,
        `联系方式：${values.contact || '未填写'}`,
      ].join('\n');

      // 尝试用 mailto 打开邮件客户端
      const mailto = `mailto:${DEV_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailto, '_blank');

      message.success('已打开邮件客户端，请发送邮件即可');
      form.resetFields();
      onClose();
    });
  };

  const handleTypeChange = (value: string) => {
    setType(value);
    let template = '';
    if (value === 'bug') template = BUG_TEMPLATE;
    else if (value === 'feature') template = FEATURE_TEMPLATE;
    else template = OTHER_TEMPLATE;
    form.setFieldValue('description', template);
  };

  return (
    <Modal
      title="📬 联系开发者"
      open={open}
      onCancel={onClose}
      width={560}
      footer={null}
      destroyOnClose
    >
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        你的反馈将直接发送到 <strong>{DEV_EMAIL}</strong>，开发者会尽快回复。
      </p>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ type: 'bug', description: BUG_TEMPLATE }}
      >
        <Form.Item name="type" label="反馈类型">
          <Select
            options={FEEDBACK_TYPES}
            onChange={handleTypeChange}
            size="large"
          />
        </Form.Item>

        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, message: '请输入标题' }]}
        >
          <Input placeholder="简要概括你的反馈" size="large" />
        </Form.Item>

        <Form.Item
          name="description"
          label="详细描述"
          rules={[{ required: true, message: '请填写描述' }]}
        >
          <TextArea rows={10} placeholder="请详细描述..." />
        </Form.Item>

        <Form.Item name="contact" label="联系方式（选填）">
          <Input placeholder="QQ / 微信 / 手机号，方便我联系你" size="large" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" size="large" block onClick={handleSubmit}>
            📧 打开邮件客户端发送反馈
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
