import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e configuration for the AI Project Advisor Agent.
 * Targets Lambert's Vite dev server (http://localhost:5173).
 *
 * Run: npm run test:e2e (from repo root)
 *      npx playwright test --config tests/e2e/playwright.config.ts (direct)
 *
 * M0 status: all e2e tests are skipped (see smoke.spec.ts).
 * M1: unskip as Lambert wires real page content and the auth flow.
 */
export default defineConfig({
  testDir: './',
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cd ../web && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
