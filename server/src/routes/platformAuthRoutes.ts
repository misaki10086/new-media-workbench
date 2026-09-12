import { Router } from 'express';
import {
  authorizePlatform,
  connectWechat,
  getPlatformAuthStatus,
  platformAuthCallback,
} from '../controllers/platformAuthController.js';
import { validateBody } from '../middleware/validate.js';
import { wechatConnectSchema } from '../schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const platformAuthRouter = Router();
platformAuthRouter.get('/status', asyncHandler(getPlatformAuthStatus));
platformAuthRouter.post('/wechat/connect', validateBody(wechatConnectSchema), asyncHandler(connectWechat));
platformAuthRouter.get('/:platform/authorize', asyncHandler(authorizePlatform));
platformAuthRouter.get('/:platform/callback', asyncHandler(platformAuthCallback));
