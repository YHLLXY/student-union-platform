import { useState, useEffect } from 'react';
import { Modal, Input, InputNumber, message } from 'antd';
import { createGuide, updateGuide } from './guideService';
import type { GuideEntry } from './guideService';

const { TextArea } = Input;

interface GuideFormProps {
  open: boolean;
  moduleKey: string;
  entry: GuideEntry | null; // null = 新增模式
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function GuideForm({ open, moduleKey, entry, userId, onClose, onSuccess }: GuideFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setContent(entry.content);
      setSortOrder(entry.sort_order);
    } else {
      setTitle('');
      setContent('');
      setSortOrder(0);
    }
  }, [entry, open]);

  const handleSave = async () => {
    if (!title.trim()) {
      message.warning('请输入标题');
      return;
    }
    if (!content.trim()) {
      message.warning('请输入内容');
      return;
    }

    setSaving(true);
    let ok: boolean;
    if (entry) {
      ok = await updateGuide(entry.id, {
        title: title.trim(),
        content: content.trim(),
        sort_order: sortOrder,
        updated_by: userId,
      });
    } else {
      const result = await createGuide({
        module_key: moduleKey,
        title: title.trim(),
        content: content.trim(),
        sort_order: sortOrder,
        created_by: userId,
      });
      ok = result !== null;
    }

    setSaving(false);
    if (ok) {
      message.success(entry ? '更新成功' : '添加成功');
      onSuccess();
      onClose();
    } else {
      message.error('保存失败，请重试');
    }
  };

  return (
    <Modal
      open={open}
      title={entry ? '编辑指南' : '添加指南'}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      width={520}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>标题</div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="如：如何查看与提交任务"
          maxLength={100}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>内容</div>
        <TextArea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="在此输入功能介绍内容，支持换行，建议分段描述"
          rows={8}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>排序</div>
        <InputNumber
          value={sortOrder}
          onChange={(v) => setSortOrder(v ?? 0)}
          min={0}
          max={999}
          style={{ width: 120 }}
        />
        <span style={{ marginLeft: 8, fontSize: 12, color: '#95a5a6' }}>数字越小越靠前</span>
      </div>
    </Modal>
  );
}
