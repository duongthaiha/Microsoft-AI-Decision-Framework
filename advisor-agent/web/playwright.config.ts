/**
 * Playwright configuration for advisor-agent SPA smoke tests.
 *
 * Two modes of operation:
 *
 * LOCAL (default) — no SPA_BASE_URL set:
 *   Builds the SPA with VITE_ADVISOR_DEMO_MODE=true (bypasses MSAL popup),
 *   starts `vite preview` at localhost:4173, and mocks all /api/* responses
 *   in the test fixtures. No Azure credentials required.
 *
 * CI / DEPLOYED — SPA_BASE_URL points to the deployed SWA:
 *   Playwright visits the live SPA. Global setup acquires an SP token via
 *   client-credentials flow and tests inject it via page.route() into every
 *   outbound /api/* request (route-fixture approach).
 *   Requires: E2E_SP_CLIENT_ID, E2E_SP_CLIENT_SECRET, E2E_SP_TENANT_ID,
 *             SPA_BASE_URL, API_BASE_URL.
 *
 * Run locally:  npm run test:e2e
 * Run in CI:    SPA_BASE_URL=... E2E_SP_CLIENT_ID=... npm run test:e2e
 */

import { defineConfig, devices } from '@playwright/test';

const SPA_BASE_URL = process.env.SPA_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: SPA_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Local mode: build with demo-mode flag then serve via vite preview (port 4173).
  // Skipped when SPA_BASE_URL is set (CI/deployed mode — server already running).
  webServer: process.env.SPA_BASE_URL
    ? undefined
    : {
        command: 'VITE_ADVISOR_DEMO_MODE=true npm run build && npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  globalSetup: './e2e/global-setup.ts',
});
