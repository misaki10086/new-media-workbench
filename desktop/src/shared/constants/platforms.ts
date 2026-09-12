import type {
  AccountLoginStatus,
  ContentStatus,
  Platform,
  PublishStep,
  PublishTaskStatus,
  PublishConfirmMode,
  WaitingReason,
} from '@shared/types/domain';

export const PLATFORMS: { id: Platform; label: string; /** 登录检测适配器是否已实现 */ adapterReady: boolean }[] = [
  { id: 'douyin', label: '抖音', adapterReady: true },
  { id: 'xiaohongshu', label: '小红书', adapterReady: true },
  { id: 'bilibili', label: 'B站', adapterReady: true },
  { id: 'wechat_channels', label: '视频号', adapterReady: true },
];

export const PLATFORM_LABEL: Record<Platform, string> = Object.fromEntries(
  PLATFORMS.map((item) => [item.id, item.label]),
) as Record<Platform, string>;

export const ACCOUNT_LOGIN_STATUS_META: Record<
  AccountLoginStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'idle' }
> = {
  unknown: { label: '未知', tone: 'idle' },
  logged_in: { label: '已登录', tone: 'success' },
  logged_out: { label: '未登录', tone: 'danger' },
  security_check: { label: '需要人工验证', tone: 'warning' },
};

export const PUBLISH_TASK_STATUS_META: Record<
  PublishTaskStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'accent' | 'idle' }
> = {
  pending: { label: '等待执行', tone: 'idle' },
  scheduled: { label: '定时待发', tone: 'accent' },
  paused: { label: '已暂停', tone: 'idle' },
  running: { label: '发布中', tone: 'accent' },
  waiting_user: { label: '待人工确认', tone: 'warning' },
  success: { label: '发布成功', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'idle' },
};

export const CONTENT_STATUS_META: Record<
  ContentStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'accent' | 'idle' }
> = {
  draft: { label: '草稿', tone: 'idle' },
  pending: { label: '待发布', tone: 'accent' },
  publishing: { label: '发布中', tone: 'warning' },
  published: { label: '已发布', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'idle' },
};

export const PUBLISH_CONFIRM_MODE_META: Record<
  PublishConfirmMode,
  { label: string; description: string }
> = {
  manual_confirm: {
    label: '手动确认（推荐）',
    description: '自动完成上传与内容填写，停在发布页，等你点「确认发布」后才真正发布。',
  },
  auto_publish: {
    label: '自动发布',
    description: '准备工作完成后直接点击发布按钮。适合内容成熟后的批量场景，请谨慎使用。',
  },
  save_draft: {
    label: '仅保存草稿',
    description: '自动完成上传与填写后保存到平台草稿箱，不执行发布。',
  },
};

/** 发布任务步骤（UI 时间线展示用，顺序即执行顺序）。 */
export const PUBLISH_STEPS_IN_ORDER: { step: PublishStep; label: string }[] = [
  { step: 'CHECKING_BROWSER', label: '检查浏览器' },
  { step: 'CHECKING_LOGIN', label: '检查登录' },
  { step: 'OPENING_CREATOR', label: '打开创作者中心' },
  { step: 'SELECTING_VIDEO', label: '选择视频' },
  { step: 'UPLOADING_VIDEO', label: '开始上传' },
  { step: 'WAITING_UPLOAD', label: '等待上传完成' },
  { step: 'FILLING_CONTENT', label: '填写标题 / 文案 / 话题' },
  { step: 'SETTING_COVER', label: '设置封面' },
  { step: 'READY_FOR_REVIEW', label: '准备完成' },
  { step: 'WAITING_USER_CONFIRM', label: '等待人工确认' },
  { step: 'PUBLISHING', label: '发布中' },
];

export const PUBLISH_STEP_LABEL: Partial<Record<PublishStep, string>> = Object.fromEntries(
  PUBLISH_STEPS_IN_ORDER.map((item) => [item.step, item.label]),
) as Partial<Record<PublishStep, string>>;

export const TASK_PRIORITY_META: Record<'HIGH' | 'NORMAL' | 'LOW', { label: string; tone: 'warning' | 'idle' | 'success' }> = {
  HIGH: { label: '高', tone: 'warning' },
  NORMAL: { label: '普通', tone: 'idle' },
  LOW: { label: '低', tone: 'success' },
};

export const WAITING_REASON_META: Record<WaitingReason, { label: string; tone: 'warning' | 'danger' | 'accent' }> = {
  LOGIN_REQUIRED: { label: '需要登录抖音', tone: 'warning' },
  SECURITY_CHECK: { label: '需要人工完成安全验证', tone: 'danger' },
  USER_CONFIRM: { label: '等待发布确认', tone: 'accent' },
  PAUSED_BY_USER: { label: '已暂停', tone: 'warning' },
};

/** 素材分类（素材库页签）。 */
export const ASSET_TYPE_META: Record<'video' | 'image' | 'audio' | 'font', { label: string }> = {
  video: { label: '视频' },
  image: { label: '图片' },
  audio: { label: '音频' },
  font: { label: '字体' },
};
