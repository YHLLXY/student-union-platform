import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Input } from 'antd';
import type { InputRef } from 'antd';
import { SearchOutlined, FileTextOutlined, PushpinOutlined, MessageOutlined, BookOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { globalSearch } from './globalSearchService';
import type { SearchResult } from './globalSearchService';
import { MODULE_ACCENT } from '@/utils/themeColors';
import styles from './global-search.module.css';

const MODULE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  tasks:    { icon: <FileTextOutlined />, color: MODULE_ACCENT.tasks, label: '任务' },
  notices:  { icon: <PushpinOutlined />,  color: MODULE_ACCENT.notices, label: '公告' },
  forum:    { icon: <MessageOutlined />,  color: MODULE_ACCENT.forum, label: '论坛' },
  guides:   { icon: <BookOutlined />,     color: MODULE_ACCENT.guides, label: '指南' },
};

/** 分组展示顺序（与侧边栏模块顺序一致，避免结果顺序随查询返回顺序漂移） */
const MODULE_ORDER: SearchResult['module'][] = ['tasks', 'notices', 'forum', 'guides'];

interface GlobalSearchProps {
  onClose?: () => void;
  /** 指南结果的落地方式是打开指南 Drawer（而非路由），由 AppLayout 注入 */
  onOpenGuide?: () => void;
}

export default function GlobalSearch({ onClose, onOpenGuide }: GlobalSearchProps) {
  const user = useAuth();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<InputRef>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 防抖查询
  const doSearch = useCallback((kw: string) => {
    if (!kw.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    globalSearch(kw, user.department, user.role).then((data) => {
      setResults(data);
      setOpen(data.length > 0);
      setSelectedIdx(-1);
    });
  }, [user.department, user.role]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  // Ctrl+K 聚焦
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 按模块分组 + 给每条结果编一个贯穿全列表的下标（键盘上下键跨组连续移动）
  const grouped = useMemo(() => {
    const byModule = new Map<SearchResult['module'], SearchResult[]>();
    for (const r of results) {
      const list = byModule.get(r.module);
      if (list) list.push(r);
      else byModule.set(r.module, [r]);
    }
    let index = 0;
    return MODULE_ORDER
      .filter((m) => byModule.has(m))
      .map((m) => {
        const items = byModule.get(m)!;
        return {
          module: m,
          items: items.map((item) => ({ item, index: index++ })),
        };
      });
  }, [results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < results.length) {
        handleSelect(results[selectedIdx]);
      }
    }
  };

  const handleSelect = (item: SearchResult) => {
    setOpen(false);
    setValue('');
    setResults([]);
    if (item.module === 'guides') {
      // 指南是 Drawer，不占路由：直接打开指南抽屉
      setSelectedIdx(-1);
      onOpenGuide?.();
    } else {
      navigate(item.link);
    }
    onClose?.();
  };

  // 高亮匹配关键词
  const highlight = (text: string) => {
    if (!value.trim()) return text;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === value.toLowerCase()
        ? <mark key={i} className={styles.highlight}>{part}</mark>
        : part,
    );
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <Input
        ref={inputRef}
        prefix={<SearchOutlined className={styles.prefixIcon} />}
        placeholder="搜索任务、公告、帖子… (Ctrl+K)"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        className={styles.input}
        allowClear
        size="small"
      />

      {open && (
        <div className={styles.dropdown}>
          {results.length === 0 ? (
            <div className={styles.empty}>未找到匹配结果</div>
          ) : (
            <>
              {grouped.map((group) => {
                const cfg = MODULE_CONFIG[group.module];
                return (
                  <div key={group.module} className={styles.group}>
                    <div className={styles.groupHeader}>
                      <span className={styles.groupDot} style={{ background: cfg.color }} />
                      <span className={styles.groupLabel}>{cfg.label}</span>
                      <span className={styles.groupCount}>{group.items.length}</span>
                    </div>
                    {group.items.map(({ item, index }) => (
                      <div
                        key={`${item.module}-${item.id}`}
                        className={`${styles.item} ${index === selectedIdx ? styles.itemSelected : ''}`}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIdx(index)}
                      >
                        <span className={styles.itemIcon}>{cfg.icon}</span>
                        <div className={styles.itemBody}>
                          <div className={styles.itemTitle}>{highlight(item.title)}</div>
                          {item.subtitle && (
                            <div className={styles.itemSubtitle}>{highlight(item.subtitle)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className={styles.footer}>
                共 {results.length} 条结果 · 每类最多 5 条
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
