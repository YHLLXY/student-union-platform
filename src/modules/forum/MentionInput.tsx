import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Popover, theme } from 'antd';
import type { GetRef } from 'antd';
import { getDepartmentLabel } from '@/utils/helpers';
import { activeMentionQuery } from './mention';
import type { MentionUser } from './forumService';
import styles from './forum.module.css';

const { TextArea } = Input;
type TextAreaRef = GetRef<typeof TextArea>;

/** 一次最多列出的候选人数：面板不该把输入框整个盖住 */
const MAX_CANDIDATES = 8;

interface MentionInputProps {
  /** value / onChange 与 antd Form.Item 的注入约定一致，故可作为受控子组件直接放进表单 */
  value?: string;
  onChange?: (value: string) => void;
  /**
   * 正文里**当前仍存在**的提及对象 id（点选后又把名字删掉的不算），
   * 用于发「有人提到了你」的通知 —— 组件内部只在确实点选过的人里挑。
   */
  onMentionsChange?: (userIds: string[]) => void;
  users: MentionUser[];
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}

/**
 * 带 @提及 的文本输入框。
 *
 * 只在**光标前正处在一个没输完的提及**里时才弹候选面板，判定逻辑在 mention.ts 的
 * activeMentionQuery 里（纯函数，有单测）。选中后把 `@` + 已输入的部分整段替换成 `@姓名 `，
 * 并把光标移到插入内容之后 —— 否则用户接着打字会插到姓名中间。
 */
export default function MentionInput({
  value = '',
  onChange,
  onMentionsChange,
  users,
  rows = 2,
  placeholder,
  maxLength = 2000,
}: MentionInputProps) {
  const { token } = theme.useToken();
  const areaRef = useRef<TextAreaRef>(null);
  // 姓名 → id：只在本次编辑会话里累积，避免「按姓名反查用户」带来的重名歧义
  const pickedRef = useRef(new Map<string, string>());
  const [query, setQuery] = useState<string | null>(null);

  const candidates = useMemo(() => {
    if (query === null) return [];
    const q = query.trim();
    return users.filter((u) => !q || u.name.includes(q)).slice(0, MAX_CANDIDATES);
  }, [query, users]);

  const pickerOpen = query !== null && candidates.length > 0;

  // 通知回调放 ref 里：调用方若用内联函数，直接进依赖会导致「父组件 setState → 新函数 → 再触发」的循环
  const notifyRef = useRef(onMentionsChange);
  notifyRef.current = onMentionsChange;

  useEffect(() => {
    if (!notifyRef.current) return;
    const ids = [...pickedRef.current.entries()]
      .filter(([name]) => value.includes(`@${name}`))
      .map(([, id]) => id);
    notifyRef.current(ids);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange?.(next);
    const caret = e.target.selectionStart ?? next.length;
    setQuery(activeMentionQuery(next.slice(0, caret)));
  };

  const handlePick = (user: MentionUser) => {
    const el = areaRef.current?.resizableTextArea?.textArea;
    const caret = el?.selectionStart ?? value.length;
    const at = value.slice(0, caret).lastIndexOf('@');
    if (at === -1) { setQuery(null); return; }

    pickedRef.current.set(user.name, user.id);
    onChange?.(`${value.slice(0, at)}@${user.name} ${value.slice(caret)}`);
    setQuery(null);

    // 等受控值落到 DOM 之后再摆光标，否则 setSelectionRange 会被随后的渲染覆盖
    requestAnimationFrame(() => {
      const next = areaRef.current?.resizableTextArea?.textArea;
      if (!next) return;
      const pos = at + user.name.length + 2; // `@` + 姓名 + 一个空格
      next.focus();
      next.setSelectionRange(pos, pos);
    });
  };

  return (
    <Popover
      open={pickerOpen}
      trigger={[]}
      placement="bottomLeft"
      arrow={false}
      content={
        <div className={styles.mentionList} role="listbox" aria-label="选择要提及的成员">
          {candidates.map((u) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={false}
              className={styles.mentionOption}
              // 阻止默认行为，避免点击时焦点离开输入框（否则选完还要再点一次才能继续打字）
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePick(u)}
            >
              <span className={styles.mentionOptionName}>{u.name}</span>
              <span className={styles.mentionOptionDept}>{getDepartmentLabel(u.department)}</span>
            </button>
          ))}
        </div>
      }
    >
      <TextArea
        ref={areaRef}
        rows={rows}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{ background: token.colorBgContainer }}
      />
    </Popover>
  );
}
