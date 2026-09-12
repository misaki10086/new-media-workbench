import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

export function uploadDirectory(): string {
  if (path.isAbsolute(env.UPLOAD_DIR)) return env.UPLOAD_DIR;
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  return path.resolve(serverRoot, env.UPLOAD_DIR);
}

export async function ensureUploadDirectory(): Promise<void> {
  await fs.mkdir(uploadDirectory(), { recursive: true });
}
