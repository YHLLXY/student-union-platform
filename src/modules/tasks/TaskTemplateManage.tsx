import { useState, useEffect } from 'react';
import { Card, Button, Modal, Form, Input, Popconfirm, message, Empty, Spin } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { logger } from '../../diagnostics';
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate } from './taskService';
import type { TaskTemplate, TemplateStep } from './taskService';

const log = logger.for('tasks/TaskTemplateManage');
const { TextArea } = Input;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TaskTemplateManage({ open, onClose }: Props) {
  const user = useAuth();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [stepsText, setStepsText] = useState('');

  const load = async () => {
    setLoading(true);
    log.info('fetching templates', { department: user.department });
    const data = await fetchTemplates(user.department);
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open, user.department]);

  const handleSave = async (values: { title: string; description: string }) => {
    const steps: TemplateStep[] = stepsText
      .split('\n')
      .filter((line) => line.trim())
      .map((line, i) => {
        const colonIdx = line.indexOf('：');
        if (colonIdx === -1) {
          return { order: i + 1, title: line.trim(), description: '' };
        }
        return {
          order: i + 1,
          title: line.substring(0, colonIdx).trim(),
          description: line.substring(colonIdx + 1).trim(),
        };
      });

    setSaving(true);
    if (editing) {
      const ok = await updateTemplate(editing.id, {
        title: values.title,
        description: values.description,
        steps,
      });
      if (ok) { message.success('模板已更新'); }
      else { message.error('更新失败'); }
    } else {
      const tmpl = await createTemplate({
        title: values.title,
        description: values.description,
        department: user.department,
        steps,
        created_by: user.id,
      });
      if (tmpl) { message.success('模板已创建'); }
      else { message.error('创建失败'); }
    }
    setSaving(false);
    setEditModal(false);
    load();
  };

  const handleEdit = (tmpl: TaskTemplate) => {
    setEditing(tmpl);
    form.setFieldsValue({ title: tmpl.title, description: tmpl.description ?? '' });
    setStepsText(tmpl.steps.map((s) => `${s.title}：${s.description}`).join('\n'));
    setEditModal(true);
  };

  const handleCreate = () => {
    setEditing(null);
    form.resetFields();
    setStepsText('');
    setEditModal(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteTemplate(id);
    if (ok) { message.success('模板已删除'); load(); }
    else { message.error('删除失败'); }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      title="📋 任务模板管理"
      destroyOnClose
    >
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建模板
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : templates.length === 0 ? (
        <Empty description="暂无模板，点击上方按钮创建" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {templates.map((tmpl) => (
            <Card
              key={tmpl.id}
              size="small"
              title={tmpl.title}
              actions={[
                <EditOutlined key="edit" onClick={() => handleEdit(tmpl)} />,
                <Popconfirm
                  key="del"
                  title="确认删除此模板？"
                  onConfirm={() => handleDelete(tmpl.id)}
                  okText="确认"
                  cancelText="取消"
                >
                  <DeleteOutlined style={{ color: '#e74c3c' }} />
                </Popconfirm>,
              ]}
            >
              {tmpl.description && (
                <p style={{ fontSize: 13, color: '#7f8c8d', marginBottom: 8 }}>{tmpl.description}</p>
              )}
              {tmpl.steps.length > 0 && (
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {tmpl.steps.map((s) => (
                    <li key={s.order} style={{ marginBottom: 4 }}>
                      <strong>{s.title}</strong>
                      {s.description && <span style={{ color: '#7f8c8d' }}> — {s.description}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editModal}
        onCancel={() => setEditModal(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        title={editing ? '编辑模板' : '新建模板'}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="title" label="模板名称" rules={[{ required: true, message: '请输入' }]}>
            <Input placeholder="例如：迎新晚会筹备" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="模板描述">
            <TextArea rows={2} placeholder="简要说明模板用途" maxLength={500} />
          </Form.Item>
          <Form.Item label="步骤清单">
            <TextArea
              rows={6}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder={'每行一个步骤，格式：步骤标题：步骤描述\n例如：\n确定节目单：收集各班级节目申报表\n审核节目：组织一审二审\n场地布置：联系体育馆管理方'}
            />
            <div style={{ fontSize: 12, color: '#95a5a6', marginTop: 4 }}>
              每行一个步骤，"："前面是标题，后面是描述（可选）
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
}
