import { Tag, Tooltip } from 'antd';
import type { PublishRecord, PublishStatus } from '../types';

const statusMeta: Record<PublishStatus, { color: string; label: string }> = {
  pending: { color: 'processing', label: '发布中' },
  success: { color: 'success', label: '成功' },
  failed: { color: 'error', label: '失败' },
};

export function PublishStatusTag({ record }: { record?: PublishRecord }) {
  if (!record) return <Tag>未发布</Tag>;
  const tag = <Tag color={statusMeta[record.status].color}>{statusMeta[record.status].label}</Tag>;
  return record.errorMessage ? <Tooltip title={record.errorMessage}>{tag}</Tooltip> : tag;
}
