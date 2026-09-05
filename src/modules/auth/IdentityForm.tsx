import { Form, Input, Button } from 'antd';
import { UserOutlined, IdcardOutlined, KeyOutlined } from '@ant-design/icons';

/* === 身份校验步骤（学生/教师共用一套表单结构） === */

export interface IdentityValues {
  name: string;
  id: string;
  inviteCode: string;
}

interface IdentityFormProps {
  kind: 'student' | 'teacher';
  values: IdentityValues;
  onChange: (patch: Partial<IdentityValues>) => void;
  loading: boolean;
  onFinish: () => void;
}

export default function IdentityForm({
  kind,
  values,
  onChange,
  loading,
  onFinish,
}: IdentityFormProps) {
  const idLabel = kind === 'student' ? '学号' : '工号';
  const codeLabel = kind === 'student' ? '部门邀请码' : '教师邀请码';

  return (
    <Form layout="vertical" onFinish={onFinish} size="large">
      <Form.Item rules={[{ required: true, message: '请输入姓名' }]}>
        <Input
          prefix={<UserOutlined />}
          placeholder="姓名"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Form.Item>
      <Form.Item rules={[{ required: true, message: `请输入${idLabel}` }]}>
        <Input
          prefix={<IdcardOutlined />}
          placeholder={idLabel}
          value={values.id}
          onChange={(e) => onChange({ id: e.target.value })}
        />
      </Form.Item>
      <Form.Item rules={[{ required: true, message: `请输入${codeLabel}` }]}>
        <Input
          prefix={<KeyOutlined />}
          placeholder={codeLabel}
          value={values.inviteCode}
          onChange={(e) => onChange({ inviteCode: e.target.value })}
        />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          继续
        </Button>
      </Form.Item>
    </Form>
  );
}
