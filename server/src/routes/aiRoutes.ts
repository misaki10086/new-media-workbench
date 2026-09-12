import { Router } from 'express';
import { generateTitleSuggestions } from '../controllers/aiController.js';
import { validateBody } from '../middleware/validate.js';
import { aiTitleSchema } from '../schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const aiRouter = Router();
aiRouter.post('/generate-titles', validateBody(aiTitleSchema), asyncHandler(generateTitleSuggestions));
