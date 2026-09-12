import { Router } from 'express';
import { createAccount, deleteAccount, listAccounts } from '../controllers/accountController.js';
import { validateBody } from '../middleware/validate.js';
import { createAccountSchema } from '../schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const accountRouter = Router();
accountRouter.get('/', asyncHandler(listAccounts));
accountRouter.post('/', validateBody(createAccountSchema), asyncHandler(createAccount));
accountRouter.delete('/:id', asyncHandler(deleteAccount));
