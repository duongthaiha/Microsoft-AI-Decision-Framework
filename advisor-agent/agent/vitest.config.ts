/**
 * Vitest configuration for the agent workspace.
 *
 * Provides a clean test environment that does not inherit ADVISOR_DEMO_MODE
 * from agent/.env.local (which defaults to 'true' for local dev).
 *
 * Individual tests that need demo mode can stub it with vi.stubEnv or
 * direct process.env assignment, as auth.test.ts already does.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Set a stable baseline for all agent tests.  .env.local sets
    // ADVISOR_DEMO_MODE=true for local dev convenience; tests that exercise
    // the production (non-demo) auth path need 'false' as the default.
    env: {
      ADVISOR_DEMO_MODE: 'false',
    },
  },
});
