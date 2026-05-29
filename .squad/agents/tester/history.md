# Apoc — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework — AI Framework Advisor Agent POC.
- **Primary success measure:** recommendation quality and rationale.
- **First test path:** CLI harness running the NFU Mutual sample intake end-to-end before any UI.
- **Output root:** `agents/advisor/` (CLI + tests + eval cases).
- **User:** Ha Duong.

## Learnings

### Sprint 1 — Test infrastructure build-out (2026-05-29)

**What was built:**

- **Unit/integration tests (Deliverable A):** 53 vitest tests across 7 files in `api/src/__tests__/` covering readiness gates, Phase 1–3 orchestration, feedback capture, and API-safe error handling.
- **NFU Mutual regression (Deliverable B):** `regression.nfum.test.ts` (8-step vitest) + `cli/src/regression.ts` standalone script (32 assertions, exits 0/1). Both pass clean.
- **Eval cases (Deliverable C):** `eval/` workspace with 4 representative cases (NFU Mutual, custom-instruction gate, no-similar-match, healthcare pro-code). 20 vitest tests, all passing. Scoring rubric: 25 pts × 4 dimensions, pass ≥ 75.
- **Feedback capture (Deliverable D):** `submitFeedback`/`loadFeedback` added to `IConversationStore` interface and implemented in `InMemoryConversationStore`.
- **Deployment validation (Deliverable E):** `agents/advisor/docs/deployment-validation.md` — post-`azd up` checklist covering API health, Cosmos DB, AI Search, App Insights, and smoke test.

**How to run:**

```bash
cd agents/advisor
npm install
npm run build:shared

# All vitest tests (api + eval)
npm run test --workspace=api
npm run test --workspace=eval

# CLI regression script (32 assertions, exit 0/1)
npm run build --workspace=api
npm run build --workspace=cli
npm run regression --workspace=cli
```

**Architecture decisions:**

- Tests use `ADVISOR_AGENT_MODE=mock` (default) with in-memory adapters — deterministic, no Azure required.
- `api/vitest.config.ts` resolves `@advisor/shared` from source — no pre-build needed to run tests.
- `eval/` is a separate workspace with its own vitest config; it imports directly from `../api/src/` via relative paths.
- `NoMatchProjectSearch` class in `eval/evalFactory.ts` forces a no-match result for the IoT eval case (exposes InMemoryProjectSearch defect — see decisions inbox).

**Readiness gate fix (bug found and fixed):**

`readinessGates.ts` had two bugs:
1. `phase2Ready` incorrectly resolved to `true` from `customInstructionAnswersUsed` alone (before any user Phase 2 answer) — removed that path; user answer required.
2. `phase3Ready` used `turns.some(t => t.messageType === 'summary')` which matched the intake system turn as well as the Phase 3 scenario summary — simplified to `phase3Turns.length > 0`.

Combined effect: with NFU Mutual (3 custom instructions), after Phase 1 answer → Phase 2 question generated, state was incorrectly jumping to `readyForRecommendation` instead of `phase2InProgress`.

**Flags for Tank:**

See `.squad/decisions/inbox/tester-eval-and-regression.md` for defects and gaps raised.

---

## Cross-Agent Note — Dozer Deployment Validation (2026-05-29T17:44:22Z)

**From:** Scribe (orchestration summary)  
**Status:** Live deployment validated in swedencentral  
**Live URL:** https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io  

Apoc: Regression suite now has live endpoint for integration testing. Cold-start only (min-replicas=0); set to 1 for smoother test runs.

**Known gap:** AI Search indexes not seeded yet (Wave 3). GET /similar-projects returns 500 until seed job runs.
