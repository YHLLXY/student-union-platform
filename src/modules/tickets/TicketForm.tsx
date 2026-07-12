import { useState } from 'react';
import { Form, Input, InputNumber, DatePicker, Button, message } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { createTicket } from './ticketService';
import styles from './tickets.module.css';

const { TextArea } = Input;

interface TicketFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

export default function TicketForm({ onSuccess, onClose }: TicketFormProps) {
  const user = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: {
    title: string;
    description: string;
    cover_url: string;
    total_count: number;
    per_user_limit: number;
    open_time: { toISOString: () => string };
    event_time: { toISOString: () => string };
  }) => {
    setLoading(true);
    const ticket = await createTicket({
      title: values.title,
      description: values.description ?? '',
      cover_url: values.cover_url ?? '',
      total_count: values.total_count,
      per_user_limit: values.per_user_limit,
      open_time: values.open_time.toISOString(),
      event_time: values.event_time.toISOString(),
      created_by: user.id,
    });
    setLoading(false);

    if (ticket) {
      message.success('票务发布成功');
      onSuccess();
    } else {
      message.error('发布失败');
    }
  };

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>🎫 发布票务</h3>
      <Form
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ total_count: 100, per_user_limit: 1 }}
      >
        <Form.Item name="title" label="活动名称" rules={[{ required: true, message: '请输入活动名' }]}>
          <Input placeholder="例：元旦晚会入场券" maxLength={100} />
        </Form.Item>

        <Form.Item name="description" label="活动描述">
          <TextArea rows={3} placeholder="活动详情" maxLength={2000} />
        </Form.Item>

        <Form.Item name="cover_url" label="封面图 URL（可选）">
          <Input placeholder="https://..." />
        </Form.Item>

        <div className={styles.formRow}>
          <Form.Item name="total_count" label="总票数" style={{ flex: 1 }} rules={[{ required: true }]}>
            <InputNumber min={1} max={9999} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="per_user_limit" label="每人限抢" style={{ flex: 1 }}>
            <InputNumber min={1} max={99} style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <Form.Item name="event_time" label="活动开始时间" rules={[{ required: true, message: '请选择活动开始时间' }]}>
          <DatePicker showTime style={{ width: '100%' }} placeholder="选择活动开始时间" />
        </Form.Item>

        <Form.Item name="open_time" label="开抢时间" rules={[{ required: true, message: '请选择开抢时间' }]}>
          <DatePicker showTime style={{ width: '100%' }} placeholder="选择开抢时间（应早于活动开始时间）" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>发布</Button>
        </Form.Item>
      </Form>
    </div>
  );
}
