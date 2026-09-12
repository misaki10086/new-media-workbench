import type { EChartsOption } from 'echarts';
import type { ContentItem, ContentTotals, Platform, PublishRecord } from '../types';
import { platformMeta, platforms } from '../types';

export function latestPublishRecords(records: PublishRecord[]): Map<number, PublishRecord> {
  const latest = new Map<number, PublishRecord>();
  for (const record of records) {
    const current = latest.get(record.platformAccountId);
    const recordTime = record.createdAt ? Date.parse(record.createdAt) : record.id;
    const currentTime = current?.createdAt ? Date.parse(current.createdAt) : (current?.id ?? -1);
    if (!current || recordTime > currentTime) latest.set(record.platformAccountId, record);
  }
  return latest;
}

export function totalMetrics(contents: ContentItem[]): ContentTotals {
  return contents.reduce(
    (total, content) => ({
      views: total.views + content.totals.views,
      likes: total.likes + content.totals.likes,
      comments: total.comments + content.totals.comments,
      shares: total.shares + content.totals.shares,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0 },
  );
}

export function buildViewsChartOption(contents: ContentItem[]): EChartsOption {
  const values = new Map<string, number>();
  for (const content of contents) {
    for (const stat of content.stats) {
      const platform = stat.platformAccount?.platform;
      if (!platform) continue;
      const key = `${content.id}:${platform}`;
      values.set(key, (values.get(key) ?? 0) + stat.views);
    }
  }

  return {
    color: platforms.map((platform) => platformMeta[platform].color),
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid: { left: 24, right: 18, top: 48, bottom: 18, containLabel: true },
    xAxis: {
      type: 'category',
      data: contents.map((content) => content.title),
      axisLabel: { width: 112, overflow: 'truncate', interval: 0 },
    },
    yAxis: { type: 'value', name: '阅读量', minInterval: 1 },
    series: platforms.map((platform) => ({
      name: platformMeta[platform].label,
      type: 'bar' as const,
      barMaxWidth: 28,
      data: contents.map((content) => values.get(`${content.id}:${platform}`) ?? 0),
      emphasis: { focus: 'series' as const },
    })),
  };
}

export function platformViews(contents: ContentItem[]): Record<Platform, number> {
  const totals: Record<Platform, number> = { wechat: 0, douyin: 0, xiaohongshu: 0 };
  for (const content of contents) {
    for (const stat of content.stats) {
      if (stat.platformAccount) totals[stat.platformAccount.platform] += stat.views;
    }
  }
  return totals;
}
