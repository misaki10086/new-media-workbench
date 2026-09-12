import {
  CommentOutlined,
  EditOutlined,
  EyeOutlined,
  LikeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  Empty,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  type TableProps,
} from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { contentApi, getErrorMessage } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlatformTag } from '../components/PlatformTag';
import { PublishStatusTag } from '../components/PublishStatusTag';
import type { ContentItem } from '../types';
import { latestPublishRecords } from '../utils/contentMetrics';

function compactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function ContentsPage() {
  const navigate = useNavigate();
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const loadContents = useCallback(async (showLoading = true): Promise<void> => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setContents(await contentApi.list());
    } catch (loadError) {
      setError(getErrorMessage(loadError, '内容列表加载失败'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadContents(); }, [loadContents]);

  const hasPending = useMemo(
    () => contents.some((content) => content.publishRecords.some((record) => record.status === 'pending')),
    [contents],
  );
  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = window.setInterval(() => void loadContents(false), 3_000);
    return () => window.clearInterval(timer);
  }, [hasPending, loadContents]);

  async function handlePublish(content: ContentItem): Promise<void> {
    setPublishingId(content.id);
    try {
      const result = await contentApi.publish(content.id);
      messageApi.success(result.message);
      await loadContents(false);
    } catch (publishError) {
      messageApi.error(getErrorMessage(publishError, '发布任务创建失败'));
    } finally {
      setPublishingId(null);
    }
  }

  const columns: TableProps<ContentItem>['columns'] = [
    {
      title: '内容',
      dataIndex: 'title',
      width: 300,
      render: (_, content) => (
        <div className="content-title-cell">
          <Avatar shape="square" size={54} src={content.coverUrl || undefined} icon={!content.coverUrl ? <EditOutlined /> : undefined} />
          <div className="content-title-copy">
            <Typography.Text strong ellipsis={{ tooltip: content.title }}>{content.title}</Typography.Text>
            <Typography.Text type="secondary" ellipsis>{content.tags.length ? content.tags.join(' · ') : '暂无标签'}</Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 110,
      render: (_, content) => (
        <Tag color={content.status === 'published' ? 'success' : content.scheduledAt ? 'warning' : 'default'}>
          {content.status === 'published' ? '已发布' : content.scheduledAt ? '待定时' : '草稿'}
        </Tag>
      ),
    },
    {
      title: '发布时间',
      dataIndex: 'scheduledAt',
      width: 168,
      render: (value: string | null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '立即发布',
    },
    {
      title: '平台与发布状态',
      key: 'targets',
      width: 310,
      render: (_, content) => {
        const latest = latestPublishRecords(content.publishRecords);
        if (!content.targets.length) return <Typography.Text type="secondary">未选择账号</Typography.Text>;
        return (
          <div className="target-list">
            {content.targets.map((account) => (
              <div key={account.id} className="target-row">
                <PlatformTag platform={account.platform} />
                <Typography.Text ellipsis>{account.accountName}</Typography.Text>
                <PublishStatusTag record={latest.get(account.id)} />
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: '数据汇总',
      key: 'totals',
      width: 220,
      render: (_, content) => (
        <Space size={12} className="metric-inline">
          <Tooltip title="阅读"><span><EyeOutlined /> {compactNumber(content.totals.views)}</span></Tooltip>
          <Tooltip title="点赞"><span><LikeOutlined /> {compactNumber(content.totals.likes)}</span></Tooltip>
          <Tooltip title="评论"><span><CommentOutlined /> {compactNumber(content.totals.comments)}</span></Tooltip>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 132,
      render: (_, content) => {
        const pending = content.publishRecords.some((record) => record.status === 'pending');
        return (
          <Space size={4}>
            <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} onClick={() => navigate(`/contents/${content.id}/edit`)} aria-label={`编辑${content.title}`} /></Tooltip>
            <Popconfirm
              title="确认发布？"
              description={content.scheduledAt ? '任务将按设定时间执行。' : '任务将立即进入发布队列。'}
              onConfirm={() => void handlePublish(content)}
              disabled={!content.targets.length || pending}
            >
              <Tooltip title={pending ? '发布任务处理中' : content.targets.length ? '发布到所选账号' : '请先选择目标账号'}>
                <Button
                  type="text"
                  icon={<SendOutlined />}
                  loading={publishingId === content.id}
                  disabled={!content.targets.length || pending}
                  aria-label={`发布${content.title}`}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div className="page">
      {contextHolder}
      <PageHeader
        title="内容管理"
        subtitle="创建内容并跟踪各平台发布结果"
        extra={[
          <Tooltip title="刷新" key="refresh"><Button icon={<ReloadOutlined />} onClick={() => void loadContents()} aria-label="刷新内容" /></Tooltip>,
          <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/contents/new')}>新建内容</Button>,
        ]}
      />
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void loadContents()}>重试</Button>} /> : null}
      <div className="table-section">
        <Table<ContentItem>
          rowKey="id"
          columns={columns}
          dataSource={contents}
          loading={loading}
          scroll={{ x: 1240 }}
          pagination={{ pageSize: 8, showSizeChanger: false, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="还没有内容草稿" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </div>
    </div>
  );
}
