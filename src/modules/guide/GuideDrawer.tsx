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

/**
 * 对文本中的关键词做高亮，返回 React 节点数组
 * 支持空格分隔的多关键词（匹配任一即高亮）
 */
function highlightText(text: string, keyword: string): React.ReactNode {
  if (!keyword.trim()) return text;

  // 提取多个关键词（空格分隔），按长度降序排列避免短词先匹配导致长词被截断
  const keywords = keyword
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (keywords.length === 0) return text;

  // 构建正则：多个关键词用 | 连接，大小写不敏感
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    keywords.some((k) => k.toLowerCase() === part.toLowerCase())
      ? <mark key={i} className={styles.highlight}>{part}</mark>
      : part,
  );
}

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

  // 客户端关键词搜索：标题 + 内容，支持多关键词（空格分隔，任一匹配即命中）
  const filteredGuides = useMemo(() => {
    if (!searchText.trim()) return guides;
    const keywords = searchText.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return guides;
    return guides.filter((g) => {
      const haystack = `${g.title} ${g.content}`.toLowerCase();
      return keywords.some((kw) => haystack.includes(kw));
    });
  }, [guides, searchText]);

  // 搜索时自动展开匹配项，清空搜索时全部折叠
  useEffect(() => {
    if (searchText.trim()) {
      setActiveKeys(filteredGuides.map((g) => g.id));
    } else {
      setActiveKeys([]);
    }
  }, [searchText, filteredGuides]);

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

  const kw = searchText.trim();

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
            placeholder="搜索标题或内容，空格分隔多关键词…"
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

        {kw && (
          <div className={styles.searchHint}>
            找到 <strong>{filteredGuides.length}</strong> 条匹配「{kw}」
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : filteredGuides.length === 0 ? (
          <Empty
            description={kw ? `未找到与「${kw}」相关的指南条目` : '该模块暂无指南'}
          />
        ) : (
          <Collapse
            activeKey={activeKeys}
            onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys as string[] : [keys as string])}
            className={styles.guideCollapse}
            items={filteredGuides.map((g) => ({
              key: g.id,
              label: (
                <span className={styles.collapseLabel}>
                  {kw ? highlightText(g.title, kw) : g.title}
                </span>
              ),
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
                  <div className={styles.guideCardContent}>
                    {kw ? highlightText(g.content, kw) : g.content}
                  </div>
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
