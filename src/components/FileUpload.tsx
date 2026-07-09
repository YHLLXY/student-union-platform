import { useState } from 'react';
import { Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps, UploadFile } from 'antd';
import supabase from '../supabaseClient';
import { formatFileSize as formatSize, getFileIcon } from '../utils/helpers';
import styles from './file-upload.module.css';

const { Dragger } = Upload;

// ---- 类型 ----

export interface Attachment {
  name: string;
  url: string;
  path: string;
  size: number;
  type: string;
}

interface FileUploadProps {
  module: string; // 'tasks' | 'forum' | 'notices'
  value?: Attachment[];
  onChange?: (attachments: Attachment[]) => void;
  maxCount?: number;
}

// ---- 常量 ----

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
];

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.tar', '.gz',
];

// ---- 组件 ----

export default function FileUpload({ module, value = [], onChange, maxCount = 5 }: FileUploadProps) {
  const [innerFileList, setInnerFileList] = useState<UploadFile[]>(
    value.map(attachmentToUploadFile),
  );

  // 同步外部 value → 内部 fileList（仅在外部变化时）
  const syncToParent = (list: UploadFile[]) => {
    const attachments: Attachment[] = list
      .filter((f) => f.status === 'done' && f.response)
      .map((f) => f.response as Attachment);
    onChange?.(attachments);
  };

  const customRequest: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options;
    const uploadFile = file as File;

    // 类型校验
    const ext = '.' + uploadFile.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(uploadFile.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      message.error(`不支持的文件类型: ${uploadFile.name}`);
      onError?.(new Error('unsupported type'));
      return;
    }

    // 大小校验
    if (uploadFile.size > MAX_SIZE) {
      message.error(`文件过大 (${formatSize(uploadFile.size)})，单文件限制 10MB`);
      onError?.(new Error('file too large'));
      return;
    }

    const timestamp = Date.now();
    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._一-鿿-]/g, '_');
    const path = `${module}/${timestamp}_${safeName}`;

    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(path, uploadFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      message.error(`上传失败: ${error.message}`);
      onError?.(error);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(data.path);

    const attachment: Attachment = {
      name: uploadFile.name,
      url: urlData.publicUrl,
      path: data.path,
      size: uploadFile.size,
      type: uploadFile.type || ext,
    };

    onSuccess?.(attachment);
    message.success(`${uploadFile.name} 上传成功`);
  };

  const handleChange: UploadProps['onChange'] = (info) => {
    setInnerFileList(info.fileList);
    syncToParent(info.fileList);
  };

  const handleRemove: UploadProps['onRemove'] = async (file) => {
    const attachment = file.response as Attachment | undefined;
    if (attachment?.path) {
      // 火后不理：删除失败不影响前端体验
      supabase.storage.from('attachments').remove([attachment.path]).catch(() => {});
    }
  };

  return (
    <div className={styles.uploadContainer}>
      <Dragger
        customRequest={customRequest}
        fileList={innerFileList}
        onChange={handleChange}
        onRemove={handleRemove}
        maxCount={maxCount}
        accept={ALLOWED_TYPES.join(',') + ',' + ALLOWED_EXTENSIONS.join(',')}
        multiple
        showUploadList={{
          showPreviewIcon: true,
          showRemoveIcon: true,
        }}
        itemRender={(_originNode, file) => {
          const att = file.response as Attachment | undefined;
          return (
            <div className={styles.uploadFileItem}>
              <span className={styles.fileIcon}>
                {getFileIcon(att?.type ?? file.type ?? '')}
              </span>
              <span className={styles.fileName}>{file.name}</span>
              {att?.size !== undefined && (
                <span className={styles.fileSize}>{formatSize(att.size)}</span>
              )}
              {file.status === 'uploading' && <span className={styles.fileStatus}>上传中…</span>}
            </div>
          );
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
        <p className="ant-upload-hint">
          支持图片、PDF、Word、Excel、PPT、压缩包，单文件不超过 10MB
        </p>
      </Dragger>
    </div>
  );
}

/** Attachment → antd UploadFile（用于受控回显） */
export function attachmentToUploadFile(a: Attachment): UploadFile {
  return {
    uid: a.path,
    name: a.name,
    status: 'done',
    url: a.url,
    response: a,
    size: a.size,
    type: a.type,
  };
}
