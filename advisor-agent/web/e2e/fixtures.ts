/**
 * Playwright test fixtures for the advisor-agent SPA smoke suite.
 *
 * authPage fixture:
 *   - Reads the SP token written by global-setup.
 *   - Mock mode (token.live === false):
 *       Intercepts all /api/* calls and returns pre-canned JSON responses so
 *       the SPA renders without a running backend. The SPA must be built with
 *       VITE_ADVISOR_DEMO_MODE=true so RequireAuth passes through immediately.
 *   - Live mode (token.live === true):
 *       Injects the SP Bearer token into every outbound /api/* request header.
 *       The real API is called; no mock data is served.
 *       Note: The SPA must be configured to point at the deployed API
 *       (VITE_API_BASE_URL set at build time or via SPA_BASE_URL env).
 */

import { test as base, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { TokenStore } from './global-setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Mock API data — used in mock mode (no SP credentials)
// ---------------------------------------------------------------------------

const MOCK_SESSION_ID = 'smoke-session-abc123';

const MOCK_SESSION = {
  id: MOCK_SESSION_ID,
  sessionId: MOCK_SESSION_ID,
  ownerId: 'demo-user',
  ownerType: 'demo',
  title: 'Smoke test session',
  status: 'active',
  createdAt: new Date(0).toISOString(),
  lastActiveAt: new Date(0).toISOString(),
  turnCount: 0,
};

// Hosted Agent Responses protocol shape (matches Dallas's contract)
const MOCK_RESPONSE = {
  object: 'response',
  status: 'completed',
  sessionId: MOCK_SESSION_ID,
  output: [
    {
      content: [{ text: 'Smoke test: advisor recommendation placeholder.' }],
    },
  ],
};

function mockApiRoute(route: Route): Promise<void> {
  const url = route.request().url();
  const method = route.request().method();

  if (method === 'GET' && url.includes('/api/sessions')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  }

  if (method === 'POST' && url.includes('/api/sessions')) {
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION) });
  }

  if (method === 'POST' && url.includes('/v1/responses')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_RESPONSE) });
  }

  // Default: pass through unrecognised routes (static assets etc.)
  return route.continue();
}

// ---------------------------------------------------------------------------
// Fixture definition
// ---------------------------------------------------------------------------

interface AuthFixtures {
  authPage: Page;
  tokenStore: TokenStore;
}

export const test = base.extend<AuthFixtures>({
  tokenStore: async ({}, use) => {
    const tokenPath = path.join(__dirname, '.auth', 'token.json');
    let store: TokenStore;
    try {
      store = JSON.parse(readFileSync(tokenPath, 'utf-8')) as TokenStore;
    } catch {
      // global-setup hasn't written the file (e.g. running tests directly) — default to mock mode
      store = { accessToken: '', expiresOn: null, live: false };
    }
    await use(store);
  },

  authPage: async ({ page, tokenStore }, use) => {
    if (tokenStore.live) {
      // Live mode: inject Bearer token into every outbound /api/* request.
      await page.route('**\/api\/**', async (route) => {
        const headers = {
          ...route.request().headers(),
          Authorization: `Bearer ${tokenStore.accessToken}`,
        };
        await route.continue({ headers });
      });
    } else {
      // Mock mode: intercept all /api/* calls with pre-canned responses.
      await page.route('**\/api\/**', mockApiRoute);
    }
    await use(page);
  },
});

export { expect };
