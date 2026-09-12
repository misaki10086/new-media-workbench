import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXECUTABLE_STEPS,
  STEP_PROGRESS,
  canResume,
  checkVideoFile,
  classifyPlaywrightError,
  WAITING_REASON_LABEL,
} from '../src/main/publishing/publishMachine';

describe('发布状态机（publishMachine，纯函数）', () => {
  it('步骤序列按规格顺序排列，进度单调递增', () => {
    expect(EXECUTABLE_STEPS).toEqual([
      'CHECKING_BROWSER',
      'CHECKING_LOGIN',
      'OPENING_CREATOR',
      'SELECTING_VIDEO',
      'UPLOADING_VIDEO',
      'WAITING_UPLOAD',
      'FILLING_CONTENT',
      'SETTING_COVER',
    ]);
    let previous = -1;
    for (const step of EXECUTABLE_STEPS) {
      expect(STEP_PROGRESS[step]).toBeGreaterThan(previous);
      previous = STEP_PROGRESS[step];
    }
    expect(STEP_PROGRESS.SUCCESS).toBe(100);
  });

  it('仅等待/失败状态可恢复，且恢复点落在自动步骤内', () => {
    expect(canResume('waiting_user', 'CHECKING_LOGIN')).toBe(true);
    expect(canResume('waiting_user', 'WAITING_USER_CONFIRM')).toBe(true);
    expect(canResume('waiting_user', 'CREATED')).toBe(false);
    expect(canResume('running', 'CHECKING_LOGIN')).toBe(false);
    expect(canResume('failed', 'CHECKING_LOGIN')).toBe(true);
    expect(canResume('failed', null)).toBe(false);
  });

  it('取消后不自动继续（waiting 原因都有提示文案）', () => {
    expect(WAITING_REASON_LABEL.USER_CONFIRM).toContain('确认发布');
    expect(WAITING_REASON_LABEL.SECURITY_CHECK).toContain('不会自动处理');
  });
});

describe('内容文件校验', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'nmw-video-check-'));
    writeFileSync(join(dir, 'ok.mp4'), Buffer.alloc(1024));
    writeFileSync(join(dir, 'empty.mp4'), '');
    writeFileSync(join(dir, 'note.txt'), 'hello');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('合法 mp4 通过', () => {
    expect(checkVideoFile(join(dir, 'ok.mp4')).ok).toBe(true);
  });

  it('不存在的文件 → FILE_NOT_FOUND', () => {
    expect(checkVideoFile(join(dir, 'missing.mp4'))).toMatchObject({ ok: false, errorCode: 'FILE_NOT_FOUND' });
  });

  it('空文件 → EMPTY_FILE；非视频扩展名 → UNSUPPORTED_VIDEO_FORMAT', () => {
    expect(checkVideoFile(join(dir, 'empty.mp4'))).toMatchObject({ ok: false, errorCode: 'EMPTY_FILE' });
    expect(checkVideoFile(join(dir, 'note.txt'))).toMatchObject({ ok: false, errorCode: 'UNSUPPORTED_VIDEO_FORMAT' });
  });

  it('超限文件 → FILE_TOO_LARGE', () => {
    const tooBig = join(dir, 'big.mp4');
    writeFileSync(tooBig, 'x');
    expect(checkVideoFile(tooBig, 0)).toMatchObject({ ok: false, errorCode: 'FILE_TOO_LARGE' });
  });
});

describe('Playwright 异常分类', () => {
  it('超时 / 浏览器崩溃 / 网络错误分别归类', () => {
    expect(classifyPlaywrightError(new Error('page.waitForSelector: Timeout 30000ms exceeded')).code).toBe('PAGE_LOAD_TIMEOUT');
    expect(classifyPlaywrightError(new Error('Target closed')).code).toBe('BROWSER_CRASHED');
    expect(classifyPlaywrightError(new Error('net::ERR_CONNECTION_REFUSED')).code).toBe('NETWORK_ERROR');
    expect(classifyPlaywrightError(new Error('something weird')).code).toBe('UNKNOWN');
  });
});