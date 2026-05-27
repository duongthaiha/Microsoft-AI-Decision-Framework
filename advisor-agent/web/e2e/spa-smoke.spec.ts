/**
 * M2 SPA Smoke Tests — advisor-agent
 *
 * Author: Brett (Tester)
 * Written: 2026-05-27T10:45:28Z
 *
 * Acceptance-criterion coverage (product-spec.md §6):
 *   SMOKE-01  AC §6 row 1   — SPA loads; user sees authenticated state
 *   SMOKE-02  AC §6 row 6   — /sessions list renders without 401
 *   SMOKE-03  AC §6 row 1   — New session → POST /v1/responses receives a response
 *   SMOKE-04  AC §6 row 6   — Open existing session → intake form renders
 *   SMOKE-05  AC §6 row 19  — Admin route gated; non-admin/demo user sees 403 gate
 *
 * AUTH STRATEGY (route-fixture approach — documented in brett-playwright-spa-smoke.md):
 *
 *   Mock mode (no E2E_SP_* env vars):
 *     SPA is built with VITE_ADVISOR_DEMO_MODE=true.
 *     RequireAuth renders children immediately; AppHeader is hidden.
 *     Playwright page.route() intercepts all /api/* calls and returns
 *     mock JSON — no running backend required.
 *
 *   Live mode (E2E_SP_* vars set, SPA_BASE_URL points to deployed SWA):
 *     global-setup.ts acquires a client-credentials SP token.
 *     page.route() injects the Bearer token into every outgoing /api/* request.
 *     The real deployed API is called; no mock data is served.
 *
 * Run locally (mock mode):
 *   cd advisor-agent/web && npm run test:e2e
 *
 * Run against deployed stack (live mode):
 *   SPA_BASE_URL=https://polite-mushroom-0a09fa803.7.azurestaticapps.net \
 *   API_BASE_URL=https://advisor-agent-app.delightfulsea-3191f7a0.swedencentral.azurecontainerapps.io \
 *   E2E_SP_CLIENT_ID=<sp-client-id> \
 *   E2E_SP_CLIENT_SECRET=<secret> \
 *   E2E_SP_TENANT_ID=cdfe81b5-821e-4f07-9ea7-516efc8497e4 \
 *   npm run test:e2e
 */

import { test, expect } from './fixtures.js';

// ---------------------------------------------------------------------------
// SMOKE-01 — SPA loads; user sees authenticated state
//
// AC §6 row 1: "A business user can open the advisor..."
// In demo mode: RequireAuth renders children immediately (no sign-in button).
// In live mode: MSAL cache injection / SP token presence keeps the session.
//
// Verifies: the SPA root renders the main heading without a sign-in prompt.
// ---------------------------------------------------------------------------
test('SMOKE-01 — SPA loads in authenticated state without sign-in button', async ({ authPage }) => {
  await authPage.goto('/');

  // Main heading must be visible
  await expect(authPage.locator('h1')).toContainText('AI Project Advisor');

  // No "Sign in" button should be visible (user is already authenticated)
  await expect(authPage.getByRole('button', { name: /sign in/i })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// SMOKE-02 — /sessions list renders without 401
//
// AC §6 row 6: "A signed-in user can create multiple sessions, see only their
// own session list..."
//
// Verifies: the sessions section heading is visible; error state referencing
// a 401 is NOT present; either empty-state copy or a sessions list renders.
// ---------------------------------------------------------------------------
test('SMOKE-02 — sessions list renders without 401', async ({ authPage }) => {
  await authPage.goto('/');

  // Sessions section must be present
  await expect(authPage.getByRole('heading', { name: /your sessions/i })).toBeVisible();

  // Must not show a 401 error
  await expect(authPage.locator('text=401')).not.toBeVisible();

  // Either empty-state copy or a session list renders (not the loading spinner)
  await expect(authPage.locator('.empty-state, .sessions-list__items')).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// SMOKE-03 — Create new session → POST /v1/responses receives a response
//
// AC §6 row 1: "...complete the intake form, and request analysis."
//
// Verifies: clicking "Start a new session" navigates to the session page;
// the intake form is present; submitting the form produces an advisor reply.
// ---------------------------------------------------------------------------
test('SMOKE-03 — create new session and receive advisor response', async ({ authPage }) => {
  await authPage.goto('/');

  // Click the CTA to start a new session
  await authPage.getByRole('button', { name: /start a new session/i }).click();

  // Must navigate to a session page (URL contains /session/)
  await expect(authPage).toHaveURL(/\/session\//);

  // Intake form must be present
  await expect(authPage.getByRole('textbox', { name: /project name/i })).toBeVisible();

  // Fill in required intake fields and submit
  await authPage.getByRole('textbox', { name: /project name/i }).fill('Smoke Test Project');
  await authPage.getByRole('textbox', { name: /business outcome/i }).fill('Verify the advisor responds');

  await authPage.getByRole('button', { name: /start analysis/i }).click();

  // Advisor turn must appear (either the streaming bubble or a completed turn)
  await expect(
    authPage.locator('.chat-turn--assistant, [aria-label="Advisor thinking"], [aria-label="Advisor message"]'),
  ).toBeVisible({ timeout: 30_000 });
});

// ---------------------------------------------------------------------------
// SMOKE-04 — Open existing session → intake form renders
//
// AC §6 row 6: "...resume any of their own sessions..."
//
// Verifies: navigating directly to a session URL renders the intake form.
// (Uses the mock session ID from global-setup / fixture.)
// ---------------------------------------------------------------------------
test('SMOKE-04 — open existing session renders intake form', async ({ authPage }) => {
  await authPage.goto('/session/smoke-session-abc123');

  // Session page renders the intake form
  await expect(authPage.getByRole('textbox', { name: /project name/i })).toBeVisible();
  await expect(authPage.getByRole('button', { name: /start analysis/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// SMOKE-05 — Admin route gated; non-admin user sees 403 gate
//
// AC §6 row 19: "An admin with the AdvisorAdmin Entra app role can sign in...
// Non-admin users are denied with no information leakage."
//
// Verifies: navigating to /admin/org-context without the AdvisorAdmin role
// renders the 403 error gate (no admin content leaks).
//
// In demo mode: RequireAdmin always renders 403 (no roles on demo account).
// In live mode: the SP test user must NOT have AdvisorAdmin role.
// ---------------------------------------------------------------------------
test('SMOKE-05 — admin route shows 403 gate for non-admin user', async ({ authPage }) => {
  await authPage.goto('/admin/org-context');

  // 403 admin gate must be shown
  await expect(authPage.getByRole('heading', { name: /403/i })).toBeVisible();
  await expect(authPage.locator('text=admin role required')).toBeVisible();

  // No admin content must leak through
  await expect(authPage.locator('text=Organisation Context')).not.toBeVisible();
  await expect(authPage.locator('text=System inventory')).not.toBeVisible();
});
