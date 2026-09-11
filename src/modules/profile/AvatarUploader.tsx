import { useState } from 'react';
import { Avatar, Upload, message } from 'antd';
import { PlusOutlined, UserOutlined, LoadingOutlined } from '@ant-design/icons';
import supabase from '@/supabaseClient';
import { logger } from '@/diagnostics';
import styles from './profile.module.css';

const log = logger.for('profile/AvatarUploader');

/** 头像只接受图片，且比附件苛刻一些（5MB 足够一张头像用） */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

interface AvatarUploaderProps {
  /** 当前头像 URL（null = 用默认头像） */
  value: string | null;
  onChange: (url: string | null) => void;
  userId: string;
}

/**
 * 头像上传。
 *
 * 复用现有 attachments 公开 bucket 与第十部分建好的策略（登录用户可上传、仅上传者本人可删），
 * **不新建 bucket、不新增策略**；路径按 `avatars/{用户id}/` 分目录，与论坛/任务的附件分开存放。
 * 换头像时顺手删掉上一张（火后不理，失败不影响新头像生效）。
 */
export default function AvatarUploader({ value, onChange, userId }: AvatarUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      message.error('头像仅支持 JPG / PNG / WebP / GIF 图片');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      message.error('头像不能超过 5MB');
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `avatars/${userId}/${Date.now()}_${safeName}`;

    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) {
      setUploading(false);
      log.error('头像上传失败', error);
      message.error(`头像上传失败：${error.message}`);
      return;
    }

    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(data.path);
    const previous = value;
    onChange(urlData.publicUrl);
    setUploading(false);
    message.success('头像已上传，记得点保存');

    // 旧头像同为 attachments bucket 且属于本人时才删得掉（策略限制 owner），失败就算了
    if (previous && previous.includes('/attachments/avatars/')) {
      const oldPath = previous.split('/attachments/').pop();
      if (oldPath) {
        supabase.storage.from('attachments').remove([oldPath]).catch(() => {});
      }
    }
  };

  return (
    <div className={styles.avatarUploader}>
      <Upload
        listType="picture-circle"
        showUploadList={false}
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        beforeUpload={(file) => { void upload(file); return false; }}
      >
        {value ? (
          <Avatar size={80} src={value} alt="当前头像" />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {uploading ? <LoadingOutlined /> : <PlusOutlined />}
            <span className={styles.avatarPlaceholderText}>
              {uploading ? '上传中' : '上传头像'}
            </span>
          </div>
        )}
      </Upload>
      <div className={styles.avatarHint}>
        <UserOutlined style={{ marginRight: 4 }} />
        支持 JPG / PNG / WebP / GIF，不超过 5MB
      </div>
    </div>
  );
}
