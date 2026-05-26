import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config lives at tests/unit/vitest.config.ts; repo root is two levels up.
const repoRoot = path.resolve(__dirname, '../..');

/**
 * Vitest configuration for the AI Project Advisor Agent unit test suite.
 *
 * Covers two source trees:
 *   - agent/src/**  — Dallas's backend logic (data models, auth, framework tools)
 *   - tests/unit/** — Brett's test helpers and cross-cutting smoke tests
 *
 * Environment: node (no browser globals needed for backend unit tests).
 * Run: npm run test (from repo root) or npm run test (from tests/ workspace).
 */
export default defineConfig({
  root: repoRoot,
  test: {
    environment: 'node',
    include: [
      'agent/src/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
  },
});
