import { useState, useEffect, useCallback } from 'react';
import { Drawer, Tabs, Button, Spin, Empty, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { hasMinRole } from '../../utils/helpers';
import { fetchGuides, deleteGuide, seedDefaultGuides } from './guideService';
import type { GuideEntry } from './guideService';
import GuideForm from './GuideForm';
import styles from './guide.module.css';

interface GuideDrawerProps {
  open: boolean;
  onClose: () => void;
}

const MODULE_TABS = [
  { key: 'tasks', label: '任务管理' },
  { key: 'notices', label: '部门公告' },
  { key: 'forum', label: '部门论坛' },
  { key: 'profile', label: '个人中心' },
];

export default function GuideDrawer({ open, onClose }: GuideDrawerProps) {
  const user = useAuth();
  const canEdit = hasMinRole(user.role, 'dept_head');
  const [activeTab, setActiveTab] = useState('tasks');
  const [guides, setGuides] = useState<GuideEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<GuideEntry | null>(null);

  const loadGuides = useCallback(async () => {
    setLoading(true);
    await seedDefaultGuides(); // 幂等：首次打开自动写入默认内容
    const data = await fetchGuides(activeTab);
    setGuides(data);
    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    if (open) {
      loadGuides();
    }
  }, [open, loadGuides]);

  const handleEdit = (entry: GuideEntry) => {
    setEditingEntry(entry);
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditingEntry(null);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteGuide(id);
    if (ok) {
      message.success('已删除');
      loadGuides();
    } else {
      message.error('删除失败');
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={420}
        title="📖 功能指南"
        destroyOnClose
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
          items={MODULE_TABS.map((t) => ({ key: t.key, label: t.label }))}
          style={{ marginBottom: 16 }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : guides.length === 0 ? (
          <Empty description="该模块暂无指南" />
        ) : (
          <div className={styles.guideList}>
            {guides.map((g) => (
              <div key={g.id} className={styles.guideCard}>
                <div className={styles.guideCardHeader}>
                  <span className={styles.guideCardTitle}>{g.title}</span>
                  {canEdit && (
                    <div className={styles.guideCardActions}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(g)}
                      />
                      <Popconfirm
                        title="确定删除这条指南？"
                        onConfirm={() => handleDelete(g.id)}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </div>
                  )}
                </div>
                <div className={styles.guideCardContent}>{g.content}</div>
                <div className={styles.guideCardMeta}>
                  {g.updater_name ?? g.creator_name ?? '系统'} 编辑于 {formatTime(g.updated_at)}
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className={styles.addBtnWrapper}>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              block
            >
              添加条目
            </Button>
          </div>
        )}
      </Drawer>

      <GuideForm
        open={formOpen}
        moduleKey={activeTab}
        entry={editingEntry}
        userId={user.id}
        onClose={() => setFormOpen(false)}
        onSuccess={loadGuides}
      />
    </>
  );
}
