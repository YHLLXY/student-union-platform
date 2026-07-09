import { useState } from 'react';
import { Form, Input, Select, Button, message } from 'antd';
import { useAuth } from '../../components/AuthContext';
import { FORUM_CATEGORIES, DEPARTMENTS } from '../../utils/constants';
import { hasMinRole } from '../../utils/helpers';
import { createPost } from './forumService';
import FileUpload, { type Attachment } from '../../components/FileUpload';

const { TextArea } = Input;

interface PostFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

const categoryOptions = Object.entries(FORUM_CATEGORIES)
  .filter(([key]) => key !== 'all')
  .map(([key, label]) => ({ value: key, label }));

const deptOptions = Object.entries(DEPARTMENTS).map(([key, label]) => ({ value: key, label }));

const KNOWLEDGE_TEMPLATES: Record<string, { label: string; fields: { name: string; label: string; type: 'text' | 'textarea' | 'date' | 'number' | 'tags'; required?: boolean }[] }> = {
  meeting: {
    label: '📋 会议纪要',
    fields: [
      { name: 'meeting_time', label: '会议时间', type: 'date', required: true },
      { name: 'location', label: '会议地点', type: 'text', required: true },
      { name: 'attendees', label: '参会人员（逗号分隔）', type: 'tags' },
      { name: 'topics', label: '议题列表（每行一个）', type: 'textarea' },
      { name: 'resolutions', label: '决议', type: 'textarea', required: true },
      { name: 'todos', label: '待办事项（每行一个）', type: 'textarea' },
    ],
  },
  review: {
    label: '📊 活动复盘',
    fields: [
      { name: 'activity_name', label: '活动名称', type: 'text', required: true },
      { name: 'activity_time', label: '活动时间', type: 'date' },
      { name: 'participant_count', label: '参与人数', type: 'number' },
      { name: 'highlights', label: '活动亮点', type: 'textarea', required: true },
      { name: 'shortcomings', label: '不足之处', type: 'textarea', required: true },
      { name: 'improvements', label: '改进建议', type: 'textarea' },
      { name: 'budget_summary', label: '预算决算情况', type: 'textarea' },
    ],
  },
  contact: {
    label: '📇 外联通讯录',
    fields: [
      { name: 'org_name', label: '单位名称', type: 'text', required: true },
      { name: 'contact_person', label: '联系人', type: 'text', required: true },
      { name: 'position', label: '职务', type: 'text' },
      { name: 'phone_wechat', label: '电话/微信', type: 'text', required: true },
      { name: 'cooperation_history', label: '合作历史', type: 'textarea' },
      { name: 'notes', label: '备注', type: 'textarea' },
    ],
  },
};

export default function PostForm({ onSuccess, onClose }: PostFormProps) {
  const user = useAuth();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [category, setCategory] = useState('discussion');
  const [templateType, setTemplateType] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const canCollab = hasMinRole(user.role, 'dept_head');
  const canPostKnowledge = hasMinRole(user.role, 'dept_head');

  const isKnowledge = category === 'knowledge';

  const handleSubmit = async (values: Record<string, unknown>) => {
    setLoading(true);

    let content = '';
    let templateData: Record<string, unknown> | null = null;

    if (isKnowledge && templateType && KNOWLEDGE_TEMPLATES[templateType]) {
      const tmpl = KNOWLEDGE_TEMPLATES[templateType];
      const parts: string[] = [`# ${tmpl.label}`];
      templateData = {};
      for (const field of tmpl.fields) {
        const val = values[field.name];
        templateData[field.name] = val ?? '';
        if (val) {
          parts.push(`**${field.label}**：${Array.isArray(val) ? val.join('、') : val}`);
        }
      }
      content = parts.join('\n\n');
    } else {
      content = (values.content as string) ?? '';
    }

    const post = await createPost({
      title: values.title as string,
      content,
      category: values.category as string,
      department: user.department,
      created_by: user.id,
      collaborating_departments: (values.collaborating_departments as string[]) ?? [],
      template_type: isKnowledge ? templateType : null,
      template_data: templateData,
      attachments,
    });

    setLoading(false);
    if (post) { message.success('发帖成功'); onSuccess(); }
    else { message.error('发帖失败'); }
  };

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>📝 发帖</h3>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ category: 'discussion' }}
      >
        <Form.Item name="category" label="分类">
          <Select
            options={categoryOptions}
            onChange={(val) => {
              setCategory(val);
              setTemplateType(null);
            }}
          />
        </Form.Item>

        {isKnowledge && (
          <>
            {!canPostKnowledge && (
              <div style={{ padding: '8px 12px', background: '#fff7e6', borderRadius: 4, marginBottom: 16, fontSize: 13, color: '#e67e22' }}>
                ⚠️ 知识库仅部门负责人及以上可发布，你当前为只读权限
              </div>
            )}
            <Form.Item label="知识库模板" required>
              <Select
                placeholder="选择模板类型"
                options={Object.entries(KNOWLEDGE_TEMPLATES).map(([key, tmpl]) => ({
                  value: key,
                  label: tmpl.label,
                }))}
                value={templateType}
                onChange={setTemplateType}
                disabled={!canPostKnowledge}
              />
            </Form.Item>
          </>
        )}

        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder={isKnowledge ? '例如：2026年7月主席团例会纪要' : '帖子标题'} maxLength={100} />
        </Form.Item>

        {isKnowledge && templateType && KNOWLEDGE_TEMPLATES[templateType] && (
          <>
            {KNOWLEDGE_TEMPLATES[templateType].fields.map((field) => (
              <Form.Item
                key={field.name}
                name={field.name}
                label={field.label}
                rules={field.required ? [{ required: true, message: `请输入${field.label}` }] : undefined}
              >
                {field.type === 'textarea' ? (
                  <TextArea rows={3} placeholder={field.label} maxLength={2000} disabled={!canPostKnowledge} />
                ) : field.type === 'date' ? (
                  <Input placeholder="例如：2026-07-01 14:00" disabled={!canPostKnowledge} />
                ) : field.type === 'number' ? (
                  <Input placeholder={field.label} disabled={!canPostKnowledge} />
                ) : field.type === 'tags' ? (
                  <Input placeholder={field.label} disabled={!canPostKnowledge} />
                ) : (
                  <Input placeholder={field.label} maxLength={200} disabled={!canPostKnowledge} />
                )}
              </Form.Item>
            ))}
          </>
        )}

        {!isKnowledge && category !== 'casual' && (
          <>
            {canCollab && (
              <Form.Item name="collaborating_departments" label="协同部门（可选）">
                <Select mode="multiple" placeholder="选择可查看此帖的部门" options={deptOptions} allowClear />
              </Form.Item>
            )}
            <Form.Item name="content" label="内容（支持 Markdown）">
              <TextArea rows={6} placeholder="支持 Markdown 格式编写" maxLength={10000} />
            </Form.Item>
          </>
        )}

        <FileUpload module="forum" value={attachments} onChange={setAttachments} />

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
          {(!isKnowledge || canPostKnowledge) && (
            <Button type="primary" htmlType="submit" loading={loading}>发布</Button>
          )}
        </Form.Item>
      </Form>
    </div>
  );
}
