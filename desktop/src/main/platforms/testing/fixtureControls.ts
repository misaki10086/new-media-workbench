import { DouyinUrls } from '../douyin/DouyinSelectors';

/**
 * 测试钩子：--publish-smoke 冒烟测试时把抖音 URL 替换为本地 fixture 页，
 * 从而在不登录真实抖音的情况下端到端验证发布状态机的每个步骤。
 * 生产/日常运行时该值恒为 null，不影响任何逻辑。
 */
let fixtureBaseUrl: string | null = null;

export function setDouyinFixtureUrl(url: string | null): void {
  fixtureBaseUrl = url;
}

export function getDouyinFixtureUrl(): string | null {
  return fixtureBaseUrl;
}

export function getCreatorPageUrl(): string {
  return fixtureBaseUrl ?? DouyinUrls.creatorCenter;
}

export function getUploadPageUrl(): string {
  return fixtureBaseUrl ?? DouyinUrls.uploadPage;
}