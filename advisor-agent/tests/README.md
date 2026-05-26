# Tests — AI Project Advisor Agent

Three test tiers, one clear escalation path: unit tests catch shape regressions in CI; integration tests validate the data layer against real Azure services; e2e tests drive the full user flow through the browser.

---

## Tier 1 — Unit Tests (Vitest)

**Location:** `tests/unit/`  
**Runner:** [Vitest](https://vitest.dev/) v1.6+  
**Run:** `npm run test` (from repo root)  
**CI:** yes — runs on every push

Unit tests cover two source trees:

| Source tree | What it tests |
|-------------|---------------|
| `agent/src/**` | Data model shapes, auth identity resolution, framework tool handlers, Cosmos DB document construction, request-state transitions |
| `tests/unit/**` | Cross-cutting smoke tests and shared test helpers |

### Adding unit tests

Write test files as `*.test.ts` in either `agent/src/` (alongside the code under test) or `tests/unit/` (for cross-cutting concerns). Vitest picks them up automatically via `tests/unit/vitest.config.ts`.

Test names should read like sentences. `"a session created without an ownerId is rejected"` is better than `"test1"` or `"should fail"`.

---

## Tier 2 — Integration Tests (manual until M2)

**Location:** `tests/integration/`  
**Runner:** manual or CI with Azure service access  
**Run:** (no automated runner yet — M2 deliverable)

Integration tests validate the data layer against real Azure services: Cosmos DB partition-key filtering, AI Search query quality, managed-identity auth in a deployed environment, and admin CRUD on `org-context` with `AdvisorAdmin` role enforcement.

These are not run in standard CI because they require provisioned Azure resources. Parker's `azd up` output is the prerequisite. Add test files here in M2 once the service scaffolding is stable.

### Spec §14 mapping

| §14 row | Integration test target |
|---------|------------------------|
| Hosted Agent protocol endpoint | `agent/src/adapter/**` |
| Cosmos DB session/Request/Project/OrgContext CRUD with managed identity | `agent/src/data/**` |
| Cosmos DB partition-key filtering (per-user isolation) | `agent/src/data/session-store.ts`, `request-store.ts` |
| Admin CRUD on `org-context` with `AdvisorAdmin` role | `agent/src/admin/**` |

---

## Tier 3 — End-to-End Tests (Playwright)

**Location:** `tests/e2e/`  
**Runner:** [Playwright](https://playwright.dev/) v1.44+  
**Run:** `npm run test:e2e` (from repo root)  
**CI:** on demand (requires Lambert's dev server)

E2e tests drive a real browser against Lambert's Vite dev server (`http://localhost:5173`). The Playwright config starts the dev server automatically when it is not already running.

**M0 status:** all tests in `smoke.spec.ts` are skipped with `test.skip()`. Each stub carries a `// TODO M1:` comment and a `// AC-XX:` reference documenting the acceptance criterion it will validate.

### Unskipping a test in M1

1. Confirm the feature is wired (Lambert's page renders real content).
2. Remove the `test.skip(` wrapper and replace with `test(`.
3. Fill in the assertions — the TODO comment describes the target behaviour.
4. Run `npm run test:e2e` locally against the dev server.

### Spec §14 mapping

| §14 row | e2e test target |
|---------|----------------|
| User completes intake, starts multiple sessions, resumes a prior session | `smoke.spec.ts` AC-01, AC-06 |
| User confirms, Request appears in Cosmos DB with `status: New` | `smoke.spec.ts` AC-13 |
| Admin edits OrgContext, publishes new version; subsequent recommendation reflects it | `smoke.spec.ts` AC-19 (M1+) |

---

## Commands reference

| Command | What it does |
|---------|-------------|
| `npm run test` | Run unit tests (Vitest) — safe to run locally and in CI |
| `npm run test:e2e` | Run e2e tests (Playwright) — requires dev server or CI with browser deps |
| `npx playwright install chromium` | Install Playwright browser binaries (first-time setup) |
| `vitest --config tests/unit/vitest.config.ts` | Run unit tests in watch mode during development |

---

## Acceptance Criteria mapping (§6)

Tests in this suite reference spec §6 acceptance criteria using `// AC-XX:` comments. The numbering follows the checklist order in `product-spec.md` lines 217–245:

| AC | Criterion (abbreviated) | Test file |
|----|------------------------|-----------|
| AC-05 | Advisor captures framework answers against a Request in Cosmos DB | `tests/unit/agent/models.test.ts` |
| AC-06 | Signed-in user sees only their own sessions (structural partition isolation) | `tests/unit/agent/models.test.ts`, `tests/e2e/smoke.spec.ts` |
| AC-07 | Entra oid is the ownership key; demo sessions are isolated | `tests/unit/agent/auth.test.ts`, `tests/e2e/smoke.spec.ts` |
| AC-13 | Advisor asks for confirmation before Request transitions to `New` | `tests/e2e/smoke.spec.ts` |
| AC-15 | Entra sign-in enabled by default; demo flag is the only override | `tests/unit/agent/auth.test.ts` |
| AC-19 | Admin with `AdvisorAdmin` role can CRUD Organisation Context | `tests/e2e/smoke.spec.ts` |
