/**
 * 抖音创作者中心 selector 集中管理。
 * 优先级：role / aria-label > placeholder > data-testid > 稳定文本 > CSS。
 * 禁止依赖复杂、动态生成的 class；平台页面变化时只需修改此文件。
 */

export const DouyinUrls = {
  creatorCenter: 'https://creator.douyin.com/',
  /** 视频发布页：进入后按页面真实结构填写（fixture 模式下会被测试页替换）。 */
  uploadPage: 'https://creator.douyin.com/creator-micro/content/upload',
} as const;

/**
 * 登录后的稳定特征（命中任意一个即视为已登录）。
 * 注意：未登录的创作者中心落地页也包含营销文案「创作灵感洞察」「作品发布及管理」，
 * 因此不能用「创作灵感」「发布」等宽泛文本（曾导致误判已登录）。
 * 以下特征经真实页面验证：仅在登录后的创作者首页（侧边导航）出现。
 */
export const LOGGED_IN_MARKERS = [
  'button:has-text("发布")',
  'text=内容管理',
  'text=数据中心',
  'text=收益中心',
  'text=互动管理',
] as const;

/** 登录墙特征（登录页 / 二维码登录 / 短信登录）。 */
export const LOGIN_WALL_MARKERS = [
  'text=扫码登录',
  'text=验证码登录',
  'text=短信登录',
  'text=账号密码登录',
  'text=手机验证码',
  'text=二维码登录',
] as const;

/** 安全验证特征（滑块 / 验证码 / 异常登录保护）。命中后必须暂停等待人工处理。 */
export const SECURITY_CHECK_MARKERS = [
  'text=安全验证',
  'text=拖动滑块',
  'text=拖动下方滑块',
  'text=请完成验证',
  'text=异常登录',
  'iframe[title*="验证"]',
] as const;

/**
 * 用户昵称提取（best-effort，全部失败时允许省略 displayName）。
 * 优先 aria-label / 稳定容器，最后才是 class 模糊匹配。
 */
export const DISPLAY_NAME_SELECTORS = [
  '[aria-label*="账号"]',
  '[data-testid="user-name"]',
  'text=抖音号：',
] as const;

export const PAGE_LOAD_TIMEOUT_MS = 30_000;
export const LOGIN_SIGNAL_TIMEOUT_MS = 15_000;

/* ===== 发布页 selector（Phase 5）：全部集中于此，Publisher 中禁止出现裸 locator ===== */

/** 视频文件上传入口（官方页面的 file input，通过 setInputFiles 上传，不模拟系统文件窗口）。 */
export const UPLOAD_INPUT_SELECTORS = [
  'input[type="file"][accept*="video"]',
  'input[type="file"]',
] as const;

/** 标题输入框：可能是 input / textarea / contenteditable。 */
export const TITLE_INPUT_SELECTORS = [
  'input[placeholder*="标题"]',
  'textarea[placeholder*="标题"]',
  '[contenteditable="true"]',
] as const;

/** 独立文案 / 简介输入框（若页面无独立字段则由 Publisher 记录跳过）。 */
export const DESCRIPTION_INPUT_SELECTORS = [
  'textarea[placeholder*="简介"]',
  'input[placeholder*="简介"]',
  'textarea[placeholder*="描述"]',
] as const;

/** 封面上传入口（图片 file input）。 */
export const COVER_INPUT_SELECTORS = [
  'input[type="file"][accept*="image"]',
  'input[type="file"][accept*="jpeg"]',
] as const;

/** 上传进度中 / 完成 / 失败的状态标记。 */
export const UPLOADING_MARKERS = ['text=上传中', 'text=处理中', 'text=视频上传中'] as const;
export const UPLOAD_DONE_MARKERS = ['text=上传完成', 'text=处理完成', 'text=上传成功'] as const;
export const UPLOAD_FAIL_MARKERS = ['text=上传失败', 'text=处理失败'] as const;

/** 发布按钮与发布结果标记。 */
export const PUBLISH_BUTTON_SELECTORS = [
  'button:has-text("发布")',
  '[role="button"]:has-text("发布")',
] as const;
export const PUBLISH_SUCCESS_MARKERS = ['text=发布成功', 'text=已发布', 'text=作品已发布'] as const;
export const PUBLISH_FAIL_MARKERS = ['text=发布失败'] as const;

/** 上传等待参数：2 秒轮询，最长 10 分钟（可用 PUBLISH_UPLOAD_TIMEOUT_MS 覆盖，供测试）。 */
export const UPLOAD_POLL_INTERVAL_MS = 2_000;
export const DEFAULT_UPLOAD_TIMEOUT_MS = 10 * 60_000;
export const PUBLISH_RESULT_TIMEOUT_MS = 30_000;
