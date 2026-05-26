# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## M0 — Test Infrastructure Scaffold (2026-05-26)

### What I built

Three-tier test infrastructure under `tests/`:
- **Unit** (`tests/unit/`): Vitest, node environment, covers `agent/src/**` and `tests/unit/**` via a single config at `tests/unit/vitest.config.ts`. The config sets `root` to the repo root so include patterns are relative to the monorepo top.
- **Integration** (`tests/integration/`): placeholder `.gitkeep` — M2 deliverable. Requires provisioned Azure services (Cosmos DB + AI Search + managed identity).
- **E2e** (`tests/e2e/`): Playwright config targeting Lambert's Vite dev server at `http://localhost:5173`. All tests skipped in M0; each stub references a §6 AC ID.

### Architecture decisions

**Why vitest lives in `tests/` not `agent/`:** The root test script already read `npm run test --workspace=tests`. Placing vitest config in the `tests` workspace keeps Brett's concerns separate from Dallas's agent code. The agent workspace uses `--passWithNoTests` so CI is green before Dallas writes any agent-side test files.

**Why `root: repoRoot` in vitest.config.ts:** Vitest resolves include patterns relative to `root`. Setting root to the monorepo root lets the single config cover both `agent/src/**` and `tests/unit/**` without duplicating configs.

**Why `.js` extensions in imports:** The monorepo uses `"module": "NodeNext"` in tsconfig.base.json. Vitest resolves `.js` imports to `.ts` source files transparently — this is the standard ESM TypeScript pattern and keeps the imports compatible if tests are ever run via `tsc` + Node.

### What's stubbed vs runnable in M0

| File | Status | Notes |
|------|--------|-------|
| `tests/unit/agent/models.test.ts` | ✅ Runnable — 7 tests pass | Depends on Dallas's `models.ts` shape; breaks intentionally on partition-key rename |
| `tests/unit/agent/auth.test.ts` | ✅ Runnable — 5 tests pass | Tests Dallas's `resolveCallerId` which is fully implemented in M0 |
| `tests/e2e/smoke.spec.ts` | 🔲 All skipped | Each test has `test.skip()` + AC reference + TODO M1 comment |
| `tests/integration/` | 🔲 Empty | M2: wire after Parker's Cosmos/Search provisioning |

### How M1 tests will be added

1. **Unit tests** for framework tool handlers, intake validation, request-state transitions: add `*.test.ts` files in `agent/src/framework/` or `agent/src/data/`. Vitest picks them up automatically.
2. **E2e unskipping**: remove `test.skip(` wrapper in `smoke.spec.ts` once Lambert's pages render real content. Fill in the assertion body per the TODO comment.
3. **Integration tier**: add real test files in `tests/integration/` once Azure resources are provisioned. Add a `"test:integration"` script in root `package.json`.
4. **AC-specific e2e**: each stubbed spec maps to a §6 AC ID — those IDs are the M1 acceptance gate. When all non-infrastructure ACs have a passing e2e test, M1 is shippable.

## Team Update — 2026-05-26 M0 scaffold complete

## M1 — Auth + /advise Contract Tests (2026-05-26)

### What I built

Two-layer test infrastructure for the auth + `/v1/responses` (advise) critical path, written proactively before Dallas's JWT middleware and Lambert's MSAL client land:

**Layer 1 — `agent/src/__tests__/auth-contract.test.ts`:**
11 Vitest contract tests covering:
- `GET /health` — no auth required (passes now)
- `POST /v1/responses` — 8 JWT validation failure modes (no token, malformed, wrong key, wrong aud, wrong iss, expired, missing scp) + 1 happy-path (valid token)
- `GET /admin/*` — AdvisorAdmin role gate (missing role → 403, role present → not 403/401)

**Layer 2 — `scripts/smoke-prod.sh`:**
3-check bash smoke script targeting the deployed Container App + SWA.  Prints colored PASS/FAIL summary.  Exits 1 if any check fails.

### Architecture decisions

**Why `vi.mock('jose')` not real JWTs + JWKS server:**
Dallas's middleware will call `jose.jwtVerify`.  Mocking `jose` at the module level gives per-test control over every jose error code (`ERR_JWS_SIGNATURE_VERIFICATION_FAILED`, `ERR_JWT_EXPIRED`, `ERR_JWT_CLAIM_VALIDATION_FAILED`) without a real key pair or JWKS server.  This is more deterministic and offline-friendly.  If Dallas uses a different jose API surface, only the mock factory needs updating.

**Why `process.env` direct assignment not `vi.stubEnv` for admin test env:**
Vitest 1.6 does not reliably override env vars already set in `.env.local` via `vi.stubEnv` (the dotenv-loaded value wins in the test worker context).  Direct `process.env.ADVISOR_DEMO_MODE = 'false'` with save/restore in `beforeEach`/`afterEach` is more explicit.  Also added `agent/vitest.config.ts` with `env: { ADVISOR_DEMO_MODE: 'false' }` as a belt-and-suspenders baseline for future tests.

**Why `jose` is a production dep not devDep:**
Dallas's JWT middleware will import `jose` at runtime.  Adding it to `dependencies` makes the intent clear and ensures it's in the production container image.

**Route naming note:**
Squad brief refers to "POST /advise" informally.  The actual Responses protocol endpoint is `POST /v1/responses`.  Tests target `/v1/responses`.  Decision file documents the mapping.

### Expected-fail state at time of write

| Test | Status | Reason |
|------|--------|--------|
| 1 (health) | ✅ PASS | Route is live |
| 2–8 (JWT validation) | ❌ FAIL | No JWT middleware → route stub returns 501 |
| 9 (valid token) | ✅ PASS | 501 satisfies "not 401, not 403" |
| 10 (no-role admin) | ✅ PASS | `.env.local` DEMO_MODE=true → 403 (correct result, wrong reason) |
| 11 (admin-role) | ❌ FAIL | DEMO_MODE=true blocks even admin-role tokens |

**Total: 3 pass, 8 expected-fail.**  All failures are intentional — they define the contract Dallas must fulfill.

### Smoke script known state

Check 1 (health) passes against deployed CA.  Check 2 (unauthenticated advise → 401) fails until Dallas's middleware lands (currently returns 501).  Check 3 (SWA root → 200) status depends on SWA deploy (parker-region-redeploy).

### How M2 tests will be added

1. **Playwright E2E (`tests/e2e/auth-flow.spec.ts`)**: Once Lambert's MSAL UI settles and the SWA is deployed, unskip the sign-in flow spec.  Use a headless browser with cookie persistence for the MSAL popup.
2. **Integration tier (`tests/integration/`)**: Wire after Parker's Cosmos/Search provisioning and Dallas's M1 store implementations.
3. **Smoke script**: Update Check 2 to remove the "EXPECTED FAIL" comment once Dallas's middleware is live.


M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.
## M1 — Reasoning Loop + Session Management Integration Tests (2026-05-26)

### What I built

**Layer 1 — `agent/src/__tests__/reasoning-loop.test.ts`:**
7 Vitest contract tests covering the M1 happy paths:
1. POST /sessions → 201 + ownerId bound to JWT oid (FR-018, FR-019, FR-020)
2. GET /sessions isolation — only caller's sessions returned (FR-019)
3. GET /sessions/:id cross-user → 404 (no info disclosure, FR-019)
4. POST /v1/responses happy path — Hosted Agent Responses shape, model called, request persisted (FR-003, FR-005, FR-018)
5. POST /v1/responses cross-user session → 404, reasoning does not run (FR-019)
6. POST /v1/responses no sessionId → inline session creation, sessionId in response (FR-018)
7. POST /v1/responses model throws → 502 [PROACTIVE — contract gap, Dallas returns 500]

**Layer 2 — `scripts/smoke-prod.sh`:**
Extended with Checks 4–5 (authenticated), gated on `SMOKE_TOKEN` env var. Includes SMOKE_TOKEN acquisition instructions (browser DevTools) and M2 CI automation backlog (service-principal client-credentials grant).

### Discovered State

Dallas's M1 commit was on disk when tests ran. 6/7 tests immediately verified. Key contract deltas discovered:
- POST /sessions returns **201** (not 200 as spec said) — RESTfully correct, suite codifies 201
- GET /sessions response is **`{ sessions: [...] }`** (envelope), not a bare array
- POST /v1/responses response uses top-level **`sessionId`** string (not `session: { id }`)

### Mock Patterns (for future test reference)

**Cosmos mock pattern (ISessionStore / IRequestStore):**
Use Map-backed in-memory classes with `vi.fn()` methods, passed via `ResponsesAdapterDeps` DI.
No `vi.mock('@azure/cosmos')` needed — the adapter accepts interface types, not class constructors.
`listMyRequests` returns `[]` to ensure `findOpenRequest` always triggers `createRequest` on first turn.

**Azure AI Search mock pattern (IProjectSearch):**
Duck-typed `MockProjectSearch` class with `vi.fn() findSimilar` returning preset `SimilarProjectMatch[]`.
Passed as `projectSearch` in deps — no module-level mock needed.
Multi-turn tool-call verification (actually exercising `searchSimilarProjects`) is M2 backlog.

**Model call mock pattern (AzureOpenAI):**
Duck-type a plain object: `{ chat: { completions: { create: vi.fn() } } } as unknown as AzureOpenAI`.
Returning `{ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: TEXT, tool_calls: undefined } }] }`
causes Dallas's agentic loop to exit after one iteration — clean and deterministic.
For model-throws: `mockChatCreate.mockRejectedValue(new Error('Service unavailable'))`.

**Hosted Agent Responses contract testing:**
Assert `res.body.object === 'response'`, `res.body.status === 'completed'`, `Array.isArray(res.body.output)`,
`res.body.output[0].content[0].text` non-empty. These constitute the Hosted Agent Responses protocol shape.

### Open Contract Gap

**Test 7 (502 for model errors) — PROACTIVE:**
Dallas's `handleError` returns 500 for all non-404 errors. Contract specifies 502 (Bad Gateway) for AzureOpenAI failures to distinguish upstream vs. application failures.
Fix: wrap `runAdvisorLoop` call in a specific catch block returning 502.
Flip Test 7 from [PROACTIVE] → [VERIFIED] once Dallas adds 502 handling.

### Run counts

- **auth-contract.test.ts**: 11/11 passed (same as M0, unchanged)
- **reasoning-loop.test.ts**: 6/7 passed, 1 proactive fail (Test 7 — 502 contract gap)
- **Total**: 17/18 passing

### How M2 tests will be added

1. **Multi-turn AOAI mock**: sequence tool_calls responses to exercise BXT → Search → Brief tool chain; add `advisor-loop-full.test.ts`.
2. **Playwright E2E**: sign-in → intake form → session list once Lambert's MSAL UI stabilises.
3. **Smoke token automation**: service-principal client-credentials grant once Parker provisions CI SP.
4. **Test 7 flip**: once Dallas adds 502 model-error handling, change `[PROACTIVE]` → `[VERIFIED]`.

