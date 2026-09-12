import {
  CommentOutlined,
  EyeOutlined,
  LikeOutlined,
  ReloadOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { Alert, Button, Empty, Skeleton, Statistic, Table, Tooltip, Typography, type TableProps } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useEffect, useMemo, useState } from 'react';
import { contentApi, getErrorMessage } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlatformTag } from '../components/PlatformTag';
import type { ContentItem, Platform } from '../types';
import { buildViewsChartOption, platformViews, totalMetrics } from '../utils/contentMetrics';

interface BreakdownRow {
  key: string;
  title: string;
  platform: Platform;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

function buildBreakdown(contents: ContentItem[]): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const content of contents) {
    for (const stat of content.stats) {
      const platform = stat.platformAccount?.platform;
      if (!platform) continue;
      const key = `${content.id}:${platform}`;
      const current = rows.get(key) ?? {
        key,
        title: content.title,
        platform,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      };
      current.views += stat.views;
      current.likes += stat.likes;
      current.comments += stat.comments;
      current.shares += stat.shares;
      rows.set(key, current);
    }
  }
  return [...rows.values()].sort((left, right) => right.views - left.views);
}

export function StatsPage() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStats(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setContents(await contentApi.list());
    } catch (loadError) {
      setError(getErrorMessage(loadError, '统计数据加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialStats(): Promise<void> {
      try {
        const items = await contentApi.list();
        if (active) setContents(items);
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError, '统计数据加载失败'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitialStats();
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => totalMetrics(contents), [contents]);
  const chartOption = useMemo(() => buildViewsChartOption(contents), [contents]);
  const breakdown = useMemo(() => buildBreakdown(contents), [contents]);
  const viewsByPlatform = useMemo(() => platformViews(contents), [contents]);
  const hasStats = breakdown.length > 0;

  const columns: TableProps<BreakdownRow>['columns'] = [
    { title: '内容', dataIndex: 'title', ellipsis: true },
    { title: '平台', dataIndex: 'platform', width: 160, render: (platform: Platform) => <PlatformTag platform={platform} /> },
    { title: '阅读', dataIndex: 'views', width: 110, sorter: (a, b) => a.views - b.views },
    { title: '点赞', dataIndex: 'likes', width: 100 },
    { title: '评论', dataIndex: 'comments', width: 100 },
    { title: '分享', dataIndex: 'shares', width: 100 },
  ];

  return (
    <div className="page">
      <PageHeader
        title="数据统计"
        subtitle="按内容和平台汇总发布后的模拟数据"
        extra={<Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={() => void loadStats()} aria-label="刷新统计" /></Tooltip>}
      />
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void loadStats()}>重试</Button>} /> : null}
      {loading ? <Skeleton active paragraph={{ rows: 10 }} /> : (
        <>
          <section className="metrics-strip" aria-label="数据总览">
            <div className="metric-block"><Statistic title="总阅读" value={totals.views} prefix={<EyeOutlined />} /></div>
            <div className="metric-block"><Statistic title="总点赞" value={totals.likes} prefix={<LikeOutlined />} /></div>
            <div className="metric-block"><Statistic title="总评论" value={totals.comments} prefix={<CommentOutlined />} /></div>
            <div className="metric-block"><Statistic title="总分享" value={totals.shares} prefix={<ShareAltOutlined />} /></div>
          </section>

          {!hasStats ? (
            <div className="empty-section"><Empty description="发布成功后将在这里生成模拟数据" /></div>
          ) : (
            <>
              <section className="chart-section">
                <div className="section-heading">
                  <div>
                    <Typography.Title level={3}>内容阅读量</Typography.Title>
                    <Typography.Text type="secondary">不同平台对比</Typography.Text>
                  </div>
                  <div className="platform-totals">
                    {(Object.entries(viewsByPlatform) as [Platform, number][]).map(([platform, views]) => (
                      <span key={platform}><PlatformTag platform={platform} /><strong>{views.toLocaleString()}</strong></span>
                    ))}
                  </div>
                </div>
                <ReactECharts option={chartOption} style={{ height: 390 }} notMerge lazyUpdate />
              </section>

              <section className="breakdown-section">
                <Typography.Title level={3}>平台明细</Typography.Title>
                <Table<BreakdownRow>
                  rowKey="key"
                  columns={columns}
                  dataSource={breakdown}
                  scroll={{ x: 760 }}
                  pagination={{ pageSize: 8, hideOnSinglePage: true }}
                />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
