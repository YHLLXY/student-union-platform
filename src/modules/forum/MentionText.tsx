import type { Components } from 'react-markdown';
import { MENTION_LINK_HREF, splitMentionSegments } from './mention';
import styles from './forum.module.css';

/**
 * 纯文本里的提及高亮（回复正文用；帖子正文是 Markdown，走下面的 mentionComponents）。
 * names = 成员名册，只有名册里的姓名才会被高亮 —— 理由见 mention.ts 顶部注释。
 */
export default function MentionText({ text, names }: { text: string; names: readonly string[] }) {
  const segments = splitMentionSegments(text, names);
  if (segments.length === 1 && !segments[0].isMention) return <>{text}</>;

  return (
    <>
      {segments.map((s, i) => (
        s.isMention
          ? <span key={i} className={styles.mention}>{s.text}</span>
          : <span key={i}>{s.text}</span>
      ))}
    </>
  );
}

/**
 * ReactMarkdown 的 components 覆盖：把提及改写的 `[@姓名](#mention)` 渲染成高亮 span，
 * 而不是真的当链接（点击会触发 HashRouter 路由跳转，那不是我们要的行为）。
 * 其余链接保持默认渲染 —— 没有引入 rehype-raw，用户输入不会被当 HTML 解析。
 */
export const mentionComponents: Components = {
  a: ({ href, children }) => (
    href === MENTION_LINK_HREF
      ? <span className={styles.mention}>{children}</span>
      : <a href={href}>{children}</a>
  ),
};
