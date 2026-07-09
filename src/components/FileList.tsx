import { DownloadOutlined } from '@ant-design/icons';
import type { Attachment } from './FileUpload';
import styles from './file-upload.module.css';

interface FileListProps {
  attachments?: Attachment[] | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('excel') || type.includes('sheet')) return '📊';
  if (type.includes('powerpoint') || type.includes('presentation')) return '📽️';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z') || type.includes('tar') || type.includes('gzip')) return '📦';
  return '📄';
}

export default function FileList({ attachments }: FileListProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className={styles.fileList}>
      <h4 className={styles.fileListTitle}>📎 附件 ({attachments.length})</h4>
      <div className={styles.fileListItems}>
        {attachments.map((file) => (
          <a
            key={file.path}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.fileListItem}
            download={file.name}
          >
            <span className={styles.fileIcon}>{getFileIcon(file.type)}</span>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.fileSize}>{formatSize(file.size)}</span>
            <DownloadOutlined className={styles.downloadIcon} />
          </a>
        ))}
      </div>
    </div>
  );
}
