import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

let rawDb: Database.Database | null = null;
let db: AppDatabase | null = null;

function migrationsFolder(): string {
  // 候选顺序：开发模式（out/main 相对项目根）→ vitest 直跑源码 → 打包后的 extraResources。
  const candidates = [
    resolve(__dirname, '../../src/main/database/migrations'),
    resolve(__dirname, 'migrations'),
    join(process.resourcesPath ?? '', 'migrations'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Migrations folder not found');
}

/** 打开（或复用）SQLite 连接：WAL + 外键约束，并执行 Drizzle 迁移。 */
export function initDatabase(dbPath: string): AppDatabase {
  if (db) return db;
  rawDb = new Database(dbPath);
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');
  db = drizzle(rawDb, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}

export function getDatabase(): AppDatabase {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function databaseFilePath(dataDir: string): string {
  return join(dataDir, 'app.db');
}

export function closeDatabase(): void {
  rawDb?.close();
  rawDb = null;
  db = null;
}
