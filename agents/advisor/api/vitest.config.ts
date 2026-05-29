import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Point vitest at shared TypeScript source so no pre-build is needed for tests
      '@advisor/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    reporters: ['verbose'],
  },
});
