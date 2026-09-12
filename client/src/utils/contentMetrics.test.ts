import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../types';
import { latestPublishRecords, totalMetrics } from './contentMetrics';

describe('content metrics', () => {
  it('selects the newest publish record for each account', () => {
    const records = [
      { id: 1, contentId: 1, platformAccountId: 8, status: 'failed' as const, errorMessage: 'x', publishedAt: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, contentId: 1, platformAccountId: 8, status: 'success' as const, errorMessage: null, publishedAt: '2026-01-02T00:00:00Z', createdAt: '2026-01-02T00:00:00Z' },
    ];
    expect(latestPublishRecords(records).get(8)?.status).toBe('success');
  });

  it('totals metrics across content rows', () => {
    const contents = [
      { totals: { views: 10, likes: 2, comments: 1, shares: 0 } },
      { totals: { views: 7, likes: 3, comments: 0, shares: 2 } },
    ] as ContentItem[];
    expect(totalMetrics(contents)).toEqual({ views: 17, likes: 5, comments: 1, shares: 2 });
  });
});
