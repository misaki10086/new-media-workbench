import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { aiTitleSchema } from '../schemas.js';
import { generateTitles } from '../services/aiService.js';

type AiTitleInput = z.infer<typeof aiTitleSchema>;

export async function generateTitleSuggestions(request: Request, response: Response): Promise<void> {
  const { topic } = request.body as AiTitleInput;
  const titles = await generateTitles(topic);
  response.json({ data: { titles } });
}
