/**
 * @提及的纯函数层（不依赖 React，便于单测）。
 *
 * 为什么「提及名册」要作为参数传进来，而不是简单地把所有 `@xxx` 都当提及：
 * 帖子正文是 Markdown，里面出现 `@` 的地方远不止提及——邮箱（`a@b.com`）、
 * 代码片段、随手打的一个 @ 都会被误判。所以只有**确实点选过**的成员姓名才认，
 * 名册由 `fetchMentionUsers()` 提供。代价是成员离职（role=removed）后旧帖里的 @ 不再高亮，
 * 这是可接受的：高亮只是视觉提示，判断谁是提及对象以数据库里的通知为准。
 */

/** 邮箱本地部分 / 单词内部的常见字符：`@` 前若紧邻这些字符，就不是提及 */
const EMAIL_LOCAL_CHARS = /[A-Za-z0-9._%+-]/;

/** 提及链接的 href 标记：渲染层据此把它换成高亮 span，而不是真的当链接跳转 */
export const MENTION_LINK_HREF = '#mention';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MentionMatch {
  /** 匹配到的 `@姓名` 在原文中的起止下标（start 指向 `@`） */
  start: number;
  end: number;
  name: string;
}

/**
 * 在文本中找出所有「点选过的成员姓名」构成的提及。
 * 长名优先：姓名互为前缀时（张三 / 张三丰）先匹配长的，避免把长名切成短名。
 */
export function findMentions(text: string, names: readonly string[]): MentionMatch[] {
  if (!text || names.length === 0) return [];
  const alt = [...names].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const re = new RegExp(`@(${alt})`, 'g');
  const out: MentionMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    if (start > 0 && EMAIL_LOCAL_CHARS.test(text[start - 1])) continue;
    out.push({ start, end: start + m[0].length, name: m[1] });
  }
  return out;
}

/**
 * Markdown 正文 → 把提及改写成 `[@姓名](#mention)` 链接。
 * 交给 ReactMarkdown 渲染后，由渲染层的 `components.a` 把该 href 换成高亮 span
 * （不引入 rehype-raw，也就不会把用户输入当 HTML 解析，避免注入面）。
 */
export function markMentionLinks(content: string, names: readonly string[]): string {
  const matches = findMentions(content, names);
  if (matches.length === 0) return content;
  let out = '';
  let cursor = 0;
  for (const m of matches) {
    out += content.slice(cursor, m.start) + `[@${m.name}](${MENTION_LINK_HREF})`;
    cursor = m.end;
  }
  return out + content.slice(cursor);
}

export interface MentionSegment {
  text: string;
  isMention: boolean;
}

/** 纯文本（回复正文）按提及切段，供渲染层逐段套样式 */
export function splitMentionSegments(text: string, names: readonly string[]): MentionSegment[] {
  const matches = findMentions(text, names);
  if (matches.length === 0) return [{ text, isMention: false }];
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) segments.push({ text: text.slice(cursor, m.start), isMention: false });
    segments.push({ text: text.slice(m.start, m.end), isMention: true });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isMention: false });
  return segments;
}

/**
 * 光标前若正处在一个「还没输完的提及」里，返回 `@` 之后已输入的部分（可能是空串）；
 * 不在提及语境返回 null。输入框据此决定要不要弹成员候选面板。
 */
export function activeMentionQuery(textBeforeCaret: string): string | null {
  const m = /@([^\s@]{0,20})$/.exec(textBeforeCaret);
  if (!m) return null;
  const at = m.index;
  if (at > 0 && EMAIL_LOCAL_CHARS.test(textBeforeCaret[at - 1])) return null;
  return m[1];
}
