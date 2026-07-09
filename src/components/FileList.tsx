import { DownloadOutlined } from '@ant-design/icons';
import { formatFileSize as formatSize, getFileIcon } from '../utils/helpers';
import type { Attachment } from './FileUpload';
import styles from './file-upload.module.css';

interface FileListProps {
  attachments?: Attachment[] | null;
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
