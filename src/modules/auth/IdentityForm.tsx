import { Form, Input, Button, Alert, Spin } from 'antd';
import { UserOutlined, IdcardOutlined, KeyOutlined } from '@ant-design/icons';

/* === 身份校验步骤（学生/教师共用一套表单结构） ===
   已注册用户（学号/工号 debounce 即查命中）不再展示邀请码栏——
   邀请码只用于「加入」新用户；老用户被要求填邀请码是走查实测到的断点。 */

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
  /** 学号/工号已注册：隐藏邀请码栏，按钮文案切到「下一步：输入密码」 */
  registered: boolean;
  /** 学号/工号查询进行中（输入框右侧转圈提示） */
  checking: boolean;
}

export default function IdentityForm({
  kind,
  values,
  onChange,
  loading,
  onFinish,
  registered,
  checking,
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
          suffix={checking ? <Spin size="small" /> : null}
        />
      </Form.Item>
      {registered ? (
        <Alert
          type="info"
          showIcon
          message={`该${idLabel}已注册，无需邀请码`}
          description="下一步输入密码即可登录；忘记密码可在密码页重置。"
          style={{ marginBottom: 24 }}
        />
      ) : (
        <Form.Item rules={[{ required: true, message: `请输入${codeLabel}` }]}>
          <Input
            prefix={<KeyOutlined />}
            placeholder={codeLabel}
            value={values.inviteCode}
            onChange={(e) => onChange({ inviteCode: e.target.value })}
          />
        </Form.Item>
      )}
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {registered ? '下一步：输入密码' : '继续'}
        </Button>
      </Form.Item>
    </Form>
  );
}
