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

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.