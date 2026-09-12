import type { AccountLoginStatus, LoginCheckReason, LoginStatus } from '@shared/types/domain';

/**
 * 把适配器返回的 LoginStatus 映射为账号表里的登录状态缓存（纯函数，可单测）。
 * loggedIn → logged_in；LOGIN_REQUIRED → logged_out；
 * SECURITY_CHECK_REQUIRED → security_check；其余（超时/网络/未知）→ unknown 并保留原因码。
 */
export function mapLoginStatus(
  login: LoginStatus,
): { status: AccountLoginStatus; errorCode: LoginCheckReason | null } {
  if (login.loggedIn) return { status: 'logged_in', errorCode: null };
  switch (login.reason) {
    case 'LOGIN_REQUIRED':
      return { status: 'logged_out', errorCode: null };
    case 'SECURITY_CHECK_REQUIRED':
      return { status: 'security_check', errorCode: null };
    default:
      return { status: 'unknown', errorCode: login.reason ?? 'UNKNOWN' };
  }
}
