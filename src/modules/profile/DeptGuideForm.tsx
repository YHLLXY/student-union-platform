import { useState } from 'react';
import { Modal, Form, Input, Button, message, Grid } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { updateDeptGuide } from './profileService';
import type { DeptGuide } from './profileService';

interface DeptGuideFormProps {
  open: boolean;
  department: string;
  currentGuide: DeptGuide | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DeptGuideForm({ open, department, currentGuide, onClose, onSaved }: DeptGuideFormProps) {
  const { md } = Grid.useBreakpoint();
  const user = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setLoading(true);

    const guide = {
      basic_info: {
        leader: values.leader || '',
        teacher: values.teacher || '',
        office: values.office || '',
        group_chat: values.group_chat || '',
      },
      templates: values.templates || [],
      faqs: values.faqs || [],
    };

    const ok = await updateDeptGuide(department, guide, user.id);
    setLoading(false);
    if (ok) {
      message.success('指南已保存');
      onSaved();
    } else {
      message.error('保存失败');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="✏️ 编辑部门新人指南"
      width={md ? 600 : undefined}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          leader: currentGuide?.basic_info?.leader ?? '',
          teacher: currentGuide?.basic_info?.teacher ?? '',
          office: currentGuide?.basic_info?.office ?? '',
          group_chat: currentGuide?.basic_info?.group_chat ?? '',
          templates: currentGuide?.templates ?? [],
          faqs: currentGuide?.faqs ?? [],
        }}
      >
        <fieldset style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: '0 12px 12px', marginBottom: 16 }}>
          <legend style={{ fontWeight: 500, fontSize: 14, marginBottom: 0 }}>📌 基本信息</legend>
          <Form.Item name="leader" label="部门负责人" style={{ marginBottom: 8 }}>
            <Input placeholder="例如：张三" />
          </Form.Item>
          <Form.Item name="teacher" label="对接老师" style={{ marginBottom: 8 }}>
            <Input placeholder="例如：王老师" />
          </Form.Item>
          <Form.Item name="office" label="办公地点" style={{ marginBottom: 8 }}>
            <Input placeholder="例如：学生会办公室 301" />
          </Form.Item>
          <Form.Item name="group_chat" label="部门群" style={{ marginBottom: 0 }}>
            <Input placeholder="例如：QQ群 xxxxx" />
          </Form.Item>
        </fieldset>

        <fieldset style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: '0 12px 12px', marginBottom: 16 }}>
          <legend style={{ fontWeight: 500, fontSize: 14, marginBottom: 0 }}>📋 常用模板</legend>
          <Form.List name="templates">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <Form.Item {...rest} name={[name, 'title']} style={{ flex: 1, marginBottom: 0 }} rules={[{ required: true, message: '请输入标题' }]}>
                      <Input placeholder="模板名称" />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'url']} style={{ flex: 2, marginBottom: 0 }} rules={[{ required: true, message: '请输入链接' }]}>
                      <Input placeholder="链接地址" />
                    </Form.Item>
                    <Button icon={<DeleteOutlined />} onClick={() => remove(name)} danger size="small" />
                  </div>
                ))}
                <Button type="dashed" onClick={() => add({ title: '', url: '' })} block icon={<PlusOutlined />}>
                  添加模板
                </Button>
              </>
            )}
          </Form.List>
        </fieldset>

        <fieldset style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: '0 12px 12px', marginBottom: 0 }}>
          <legend style={{ fontWeight: 500, fontSize: 14, marginBottom: 0 }}>❓ 常见问题</legend>
          <Form.List name="faqs">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <div key={key} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Form.Item {...rest} name={[name, 'question']} style={{ flex: 1, marginBottom: 4 }} rules={[{ required: true, message: '请输入问题' }]}>
                        <Input placeholder="问题" />
                      </Form.Item>
                      <Button icon={<DeleteOutlined />} onClick={() => remove(name)} danger size="small" />
                    </div>
                    <Form.Item {...rest} name={[name, 'answer']} style={{ marginBottom: 0 }} rules={[{ required: true, message: '请输入回答' }]}>
                      <Input.TextArea rows={2} placeholder="回答" />
                    </Form.Item>
                  </div>
                ))}
                <Button type="dashed" onClick={() => add({ question: '', answer: '' })} block icon={<PlusOutlined />}>
                  添加问题
                </Button>
              </>
            )}
          </Form.List>
        </fieldset>
      </Form>
    </Modal>
  );
}
