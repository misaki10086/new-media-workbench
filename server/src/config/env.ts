import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(moduleDirectory, '../../.env') });
// A root .env is also accepted for convenient monorepo development; server/.env wins when both exist.
dotenv.config({ path: path.resolve(moduleDirectory, '../../../.env') });

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().default('new_media_workbench'),
  DB_USER: z.string().default('new_media'),
  DB_PASSWORD: z.string().default('new_media_password'),
  DB_LOGGING: booleanString.default(false),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  WECHAT_APP_ID: z.string().trim().min(1).optional(),
  WECHAT_APP_SECRET: z.string().trim().min(1).optional(),
  DOUYIN_CLIENT_KEY: z.string().trim().min(1).optional(),
  DOUYIN_CLIENT_SECRET: z.string().trim().min(1).optional(),
  DOUYIN_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/platform-auth/douyin/callback'),
  XHS_APP_KEY: z.string().trim().min(1).optional(),
  XHS_APP_SECRET: z.string().trim().min(1).optional(),
  XHS_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/platform-auth/xiaohongshu/callback'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  UPLOAD_DIR: z.string().default('uploads'),
  PUBLISH_SUCCESS_RATE: z.coerce.number().min(0).max(1).default(0.8),
  PUBLISH_DELAY_MIN_MS: z.coerce.number().int().nonnegative().default(1000),
  PUBLISH_DELAY_MAX_MS: z.coerce.number().int().nonnegative().default(3000),
  PUBLISH_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(3),
});

export const env = schema.parse(process.env);

if (env.PUBLISH_DELAY_MIN_MS > env.PUBLISH_DELAY_MAX_MS) {
  throw new Error('PUBLISH_DELAY_MIN_MS must be less than or equal to PUBLISH_DELAY_MAX_MS');
}
