import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // 与 tsconfig 保持一致的路径别名
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      // 单测环境将 electron 替换为轻量桩（仅测试生效，不影响应用构建与运行）。
      electron: resolve(__dirname, 'tests/mocks/electronStub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
