import { useState, useEffect, useCallback, useMemo } from 'react';
import { Drawer, Tabs, Button, Spin, Empty, Popconfirm, message, Input, Collapse } from 'antd';
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
  const [searchText, setSearchText] = useState('');
  const [activeKeys, setActiveKeys] = useState<string[]>([]);

  const loadGuides = useCallback(async () => {
    setLoading(true);
    await seedDefaultGuides();
    const data = await fetchGuides(activeTab);
    setGuides(data);
    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    if (open) {
      loadGuides();
    }
  }, [open, loadGuides]);

  // 切换 Tab 时清空搜索和折叠状态
  useEffect(() => {
    setSearchText('');
    setActiveKeys([]);
  }, [activeTab]);

  // 客户端关键词搜索
  const filteredGuides = useMemo(() => {
    if (!searchText.trim()) return guides;
    const kw = searchText.trim().toLowerCase();
    return guides.filter(
      (g) =>
        g.title.toLowerCase().includes(kw) ||
        g.content.toLowerCase().includes(kw),
    );
  }, [guides, searchText]);

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

  const handleExpandAll = () => {
    setActiveKeys(filteredGuides.map((g) => g.id));
  };

  const handleCollapseAll = () => {
    setActiveKeys([]);
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
        width={460}
        title="📖 功能指南"
        destroyOnClose
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
          items={MODULE_TABS.map((t) => ({ key: t.key, label: t.label }))}
          style={{ marginBottom: 12 }}
        />

        <div className={styles.toolbar}>
          <Input.Search
            placeholder="搜索关键词…"
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={(v) => setSearchText(v)}
            style={{ flex: 1 }}
          />
          {filteredGuides.length > 0 && (
            <div className={styles.toolbarActions}>
              <Button size="small" onClick={handleExpandAll}>
                全部展开
              </Button>
              <Button size="small" onClick={handleCollapseAll}>
                全部收起
              </Button>
            </div>
          )}
        </div>

        {searchText.trim() && (
          <div className={styles.searchHint}>
            找到 {filteredGuides.length} 条
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : filteredGuides.length === 0 ? (
          <Empty
            description={searchText.trim() ? '未找到匹配的指南条目' : '该模块暂无指南'}
          />
        ) : (
          <Collapse
            activeKey={activeKeys}
            onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys as string[] : [keys as string])}
            className={styles.guideCollapse}
            items={filteredGuides.map((g) => ({
              key: g.id,
              label: <span className={styles.collapseLabel}>{g.title}</span>,
              extra: canEdit ? (
                <div
                  className={styles.collapseExtra}
                  onClick={(e) => e.stopPropagation()}
                >
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
              ) : undefined,
              children: (
                <>
                  <div className={styles.guideCardContent}>{g.content}</div>
                  <div className={styles.guideCardMeta}>
                    {g.updater_name ?? g.creator_name ?? '系统'} 编辑于 {formatTime(g.updated_at)}
                  </div>
                </>
              ),
            }))}
          />
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
