import type { Request, Response } from 'express';
import type { z } from 'zod';
import { PlatformAccount } from '../models/index.js';
import type { createAccountSchema } from '../schemas.js';
import { accountView } from '../utils/accountView.js';
import { ApiError } from '../utils/ApiError.js';
import { DEFAULT_USER_ID, parseId } from '../utils/params.js';

type CreateAccountInput = z.infer<typeof createAccountSchema>;

export async function listAccounts(request: Request, response: Response): Promise<void> {
  const userId = DEFAULT_USER_ID;
  const accounts = await PlatformAccount.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
  response.json({ data: { accounts: accounts.map(accountView) } });
}

export async function createAccount(request: Request, response: Response): Promise<void> {
  const userId = DEFAULT_USER_ID;
  const input = request.body as CreateAccountInput;
  const account = await PlatformAccount.create({ ...input, userId });
  response.status(201).json({ data: { account: accountView(account) } });
}

export async function deleteAccount(request: Request, response: Response): Promise<void> {
  const userId = DEFAULT_USER_ID;
  const id = parseId(request.params.id);
  const deleted = await PlatformAccount.destroy({ where: { id, userId } });
  if (!deleted) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', '平台账号不存在');
  response.status(204).send();
}
