import { test, expect } from '@playwright/test';

/**
 * M0 e2e smoke tests — skipped by default until Lambert's pages render content (M1).
 *
 * Each test is mapped to a §6 Acceptance Criterion (AC-XX). Tests are stubs:
 * the assertion code documents the intended M1 behaviour; the test.skip() keeps CI
 * green until the feature is wired.
 *
 * AC numbering follows §6 Acceptance Criteria order (product-spec.md lines 217–245).
 *
 * To run against a live dev server:
 *   npx playwright test --config tests/e2e/playwright.config.ts
 */

// AC-01: a business user can open the advisor, complete the intake form, and request analysis
test.skip('the home page title contains Advisor', async ({ page }) => {
  // TODO M1: unskip when Lambert's pages render content
  await page.goto('/');
  await expect(page).toHaveTitle(/Advisor/);
});

// AC-01: intake form is visible on the home page
test.skip('the home page renders the intake form', async ({ page }) => {
  // TODO M1: unskip when Lambert's HomePage renders the intake form fields
  await page.goto('/');
  await expect(page.locator('form')).toBeVisible();
});

// AC-06: a signed-in user can create multiple sessions and sees only their own session list
test.skip('a signed-in user sees only their own session list', async ({ page }) => {
  // TODO M1: unskip when auth flow and session list page are wired end-to-end
  await page.goto('/');
  // Expect session list scoped to current user — no cross-user data visible
});

// AC-13: the advisor asks for explicit confirmation before persisting the Request with status New
test.skip('the submission flow requires explicit confirmation before a Request transitions to New', async ({ page }) => {
  // TODO M1: unskip when the full conversation → confirmation flow is wired
  await page.goto('/');
  // Expect a confirmation step present before final submission button
});

// AC-07: demo mode sessions are isolated from Entra-authenticated sessions
test.skip('demo mode produces a session that is isolated from Entra session lists', async ({ page }) => {
  // TODO M1: unskip when demo mode flag is surfaced in the UI and session isolation is testable
  await page.goto('/');
});

// AC-19: an admin with AdvisorAdmin role can access the Organisation Context admin page
test.skip('the admin route /admin/org-context is accessible to an AdvisorAdmin user', async ({ page }) => {
  // TODO M1: unskip when Lambert's admin layout and Entra role check are wired
  await page.goto('/admin/org-context');
  // Non-admin access should be blocked; admin access should render the OrgContext editor
});
