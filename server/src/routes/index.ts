import { Router } from 'express';
import { accountRouter } from './accountRoutes.js';
import { aiRouter } from './aiRoutes.js';
import { contentRouter } from './contentRoutes.js';
import { platformAuthRouter } from './platformAuthRoutes.js';

export const apiRouter = Router();
apiRouter.get('/health', (_request, response) => {
  response.json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
});
apiRouter.use('/accounts', accountRouter);
apiRouter.use('/contents', contentRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/platform-auth', platformAuthRouter);
