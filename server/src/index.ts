import type { Server } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { closeRedis } from './config/redis.js';
import { sequelize } from './models/index.js';
import { closePublishQueue } from './services/publishQueue.js';
import { ensureUploadDirectory } from './services/storage.js';

let server: Server | undefined;

async function start(): Promise<void> {
  await ensureUploadDirectory();
  await sequelize.authenticate();
  server = app.listen(env.PORT, () => {
    console.log(`API listening at http://localhost:${env.PORT}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down API`);
  await new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await Promise.allSettled([closePublishQueue(), closeRedis(), sequelize.close()]);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void (async () => {
      try {
        await shutdown(signal);
      } finally {
        process.exit(0);
      }
    })();
  });
}

async function bootstrap(): Promise<void> {
  try {
    await start();
  } catch (error) {
    console.error('Failed to start API:', error);
    process.exitCode = 1;
  }
}

void bootstrap();
