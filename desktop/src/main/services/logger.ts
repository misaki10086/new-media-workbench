import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { appDirectories } from '../appPaths';

type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  // 同时输出到控制台与应用日志文件，便于排查平台页面变化与浏览器异常。
  console.log(line);
  try {
    const logDir = appDirectories().logs;
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, 'app.log'), `${line}\n`, 'utf8');
  } catch (error) {
    console.error('Failed to append log:', error);
  }
}

export const devLog = {
  info: (message: string): void => write('info', message),
  warn: (message: string): void => write('warn', message),
  error: (message: string): void => write('error', message),
};
