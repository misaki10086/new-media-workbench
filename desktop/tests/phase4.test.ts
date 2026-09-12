import { describe, expect, it } from 'vitest';
import { mapLoginStatus } from '../src/main/platforms/loginStatus';
import { createAccountSchema } from '../src/shared/validators/account';
import { createProfileSchema } from '../src/shared/validators/browserProfile';
import type { LoginStatus } from '../src/shared/types/domain';

function login(partial: Partial<LoginStatus>): LoginStatus {
  return { loggedIn: false, checkedAt: new Date().toISOString(), ...partial };
}

describe('mapLoginStatus（登录检测 → 账号缓存状态）', () => {
  it('已登录映射为 logged_in', () => {
    expect(mapLoginStatus(login({ loggedIn: true, displayName: '张三' }))).toEqual({
      status: 'logged_in',
      errorCode: null,
    });
  });

  it('登录页映射为 logged_out', () => {
    expect(mapLoginStatus(login({ reason: 'LOGIN_REQUIRED' }))).toEqual({
      status: 'logged_out',
      errorCode: null,
    });
  });

  it('安全验证映射为 security_check（绝不自动绕过）', () => {
    expect(mapLoginStatus(login({ reason: 'SECURITY_CHECK_REQUIRED' }))).toEqual({
      status: 'security_check',
      errorCode: null,
    });
  });

  it('超时 / 网络 / 未知映射为 unknown 并保留原因码', () => {
    for (const reason of ['PAGE_LOAD_TIMEOUT', 'NETWORK_ERROR', 'UNKNOWN', undefined] as const) {
      expect(mapLoginStatus(login({ reason }))).toEqual({ status: 'unknown', errorCode: reason ?? 'UNKNOWN' });
    }
  });
});

describe('账号 / Profile 入参校验', () => {
  it('创建账号需要平台 + 名称 + 已存在 Profile', () => {
    const parsed = createAccountSchema.parse({ platform: 'douyin', name: '主账号', profileId: 3 });
    expect(parsed).toEqual({ platform: 'douyin', name: '主账号', profileId: 3 });
  });

  it('拒绝空名称与非法平台标识', () => {
    // 平台标识放开为字符串（自定义平台接口），但格式仍受限：大写 / 特殊字符 / 空白不合法
    expect(() => createAccountSchema.parse({ platform: 'WEIBO', name: 'x', profileId: 1 })).toThrow();
    expect(() => createAccountSchema.parse({ platform: 'weibo x', name: 'x', profileId: 1 })).toThrow();
    expect(createAccountSchema.parse({ platform: 'weibo', name: 'x', profileId: 1 }).platform).toBe('weibo');
    expect(() => createAccountSchema.parse({ platform: 'douyin', name: '  ', profileId: 1 })).toThrow();
    expect(() => createAccountSchema.parse({ platform: 'douyin', name: 'x', profileId: 0 })).toThrow();
  });

  it('Profile 名称拒绝路径分隔符与空名', () => {
    expect(createProfileSchema.parse({ platform: 'douyin', name: '我的抖音主账号' }).name).toBe('我的抖音主账号');
    expect(() => createProfileSchema.parse({ platform: 'douyin', name: 'a/b' })).toThrow();
    expect(() => createProfileSchema.parse({ platform: 'douyin', name: '' })).toThrow();
  });
});
