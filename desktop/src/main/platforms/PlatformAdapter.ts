import type { Page } from 'playwright';
import type { LoginCheckReason, LoginStatus, Platform } from '@shared/types/domain';

/** 一次登录检测的完整回执。 */
export interface LoginCheckOutcome {
  login: LoginStatus;
  /** 检测过程步骤记录（开发调试面板展示）。 */
  steps: string[];
  finalUrl: string;
  durationMs: number;
}

/**
 * 平台适配器统一接口。
 * 所有平台特定逻辑（URL、selector、登录判定）都必须封装在 Adapter 内，
 * React / Service 层不允许出现任何平台细节。
 *
 * 实现清单：DouyinAdapter（已完成）；Xiaohongshu / Bilibili / WeChatVideoAdapter 预留。
 */
export interface PlatformAdapter {
  platformId: Platform;
  /** 在该页面打开创作者中心（登录入口）。 */
  openCreatorCenter(page: Page): Promise<void>;
  /** 检测当前浏览器是否处于已登录状态。 */
  checkLogin(page: Page): Promise<LoginCheckOutcome>;
}

export type { LoginCheckReason, LoginStatus };
