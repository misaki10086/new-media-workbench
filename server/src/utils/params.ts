import { ApiError } from './ApiError.js';

export function parseId(value: string | string[] | undefined): number {
  const normalized = Array.isArray(value) ? value[0] : value;
  const id = Number(normalized);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, 'INVALID_ID', '资源 ID 不合法');
  return id;
}

// 登录验证已移除：所有数据归属 db:init 种子的管理员用户（users 表 id=1）。
export const DEFAULT_USER_ID = 1;
