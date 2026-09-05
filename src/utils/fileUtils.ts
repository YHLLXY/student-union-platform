/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 根据 MIME 类型返回文件图标的语义色（供 FileOutlined 着色） */
export function getFileIconColor(type: string): string {
  if (type.startsWith('image/')) return '#8e44ad';
  if (type.includes('pdf')) return '#e74c3c';
  if (type.includes('word') || type.includes('document')) return '#3498db';
  if (type.includes('excel') || type.includes('sheet')) return '#27ae60';
  if (type.includes('powerpoint') || type.includes('presentation')) return '#e67e22';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z') || type.includes('tar') || type.includes('gzip')) return '#f39c12';
  return '#7f8c8d';
}
