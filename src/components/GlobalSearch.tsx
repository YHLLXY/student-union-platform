import { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Tag } from 'antd';
import type { InputRef } from 'antd';
import { SearchOutlined, FileTextOutlined, PushpinOutlined, MessageOutlined, BookOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { globalSearch } from './globalSearchService';
import type { SearchResult } from './globalSearchService';
import styles from './global-search.module.css';

const MODULE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  tasks:    { icon: <FileTextOutlined />, color: '#3498db', label: '任务' },
  notices:  { icon: <PushpinOutlined />,  color: '#e67e22', label: '公告' },
  forum:    { icon: <MessageOutlined />,  color: '#27ae60', label: '论坛' },
  guides:   { icon: <BookOutlined />,     color: '#8e44ad', label: '指南' },
};

export default function GlobalSearch() {
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
    navigate(item.link);
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
            results.map((item, i) => {
              const cfg = MODULE_CONFIG[item.module];
              return (
                <div
                  key={`${item.module}-${item.id}`}
                  className={`${styles.item} ${i === selectedIdx ? styles.itemSelected : ''}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <span className={styles.itemIcon}>{cfg.icon}</span>
                  <div className={styles.itemBody}>
                    <div className={styles.itemTitle}>
                      <Tag color={cfg.color} style={{ fontSize: 10, marginRight: 6 }}>{cfg.label}</Tag>
                      {highlight(item.title)}
                    </div>
                    {item.subtitle && (
                      <div className={styles.itemSubtitle}>{highlight(item.subtitle)}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
