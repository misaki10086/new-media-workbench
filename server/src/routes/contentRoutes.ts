import { Router } from 'express';
import { createContent, listContents, publishContent, updateContent } from '../controllers/contentController.js';
import { validateBody } from '../middleware/validate.js';
import { createContentSchema, publishSchema, updateContentSchema } from '../schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const contentRouter = Router();
contentRouter.get('/', asyncHandler(listContents));
contentRouter.post('/', validateBody(createContentSchema), asyncHandler(createContent));
contentRouter.put('/:id', validateBody(updateContentSchema), asyncHandler(updateContent));
contentRouter.post('/:id/publish', validateBody(publishSchema), asyncHandler(publishContent));
