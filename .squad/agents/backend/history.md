# Tank — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework — AI Framework Advisor Agent POC.
- **Stack:** Node.js + TypeScript, GitHub Copilot SDK, Express, Cosmos DB, Azure AI Search.
- **Output root:** `agents/advisor/` (all code under `agents/`). Framework skill: `.agents/skills/microsoft-ai-decision-framework`.
- **Headless-first:** Prove the agent loop via CLI before any UI depends on it.
- **User:** Ha Duong.

## Learnings

### Wave 2: Headless Agent Runtime (2025-05-29)

**What worked:**
1. **Strict TypeScript with `exactOptionalPropertyTypes: true`:**
   - Caught real bugs: Cannot assign `undefined` to optional properties.
   - Fix: Conditionally set properties only when they have values.
   - Pattern: Create object, then `if (value) obj.optionalProp = value;` instead of `optionalProp: value ?? undefined`.

2. **ESM module setup with `"type": "module"` in package.json:**
   - Enables `import.meta.url` for path resolution.
   - All imports must use `.js` extensions (not `.ts`) with `"moduleResolution": "Node16"`.
   - SKILL_PATH resolved via `../../../../.agents/skills/microsoft-ai-decision-framework` from `api/dist/`.

3. **In-memory adapters with seed data for headless development:**
   - MockCopilotSessionService (deterministic, no LLM needed) + RealCopilotSessionService (GitHub Copilot SDK).
   - InMemoryGuidanceStore seeded with NFU custom instructions.
   - InMemoryProjectSearch with 3 seed projects.
   - InMemoryFrameworkRetrieval reads from skill `references/` with embedded fallback.
   - Enabled complete Phase 1→2→3 testing without any external dependencies.

4. **Three-phase agent orchestration with custom instruction pre-answer gate:**
   - Phase 1 (BXT) → Phase 2 (9 Questions) → Phase 3 (Scenario Selection).
   - Before asking Phase 2/3 questions, agent checks `guidance.instructions` and pre-answers.
   - Records which instruction was used, skips redundant questions.
   - **Result:** 3 custom instructions eliminated 6 redundant questions in NFU flow.

5. **CLI dynamic imports from `../../api/dist/` (sibling workspace):**
   - TypeScript can't enforce type compatibility between `src` and `dist` during compile.
   - Solution: Use `as any` for dynamic imports to avoid `unknown` method call errors.
   - CLI exercises complete flow: intake → Phase 1 → Phase 2 → Phase 3 → recommendation → similar projects.

6. **Composition root with `ADVISOR_AGENT_MODE` environment variable:**
   - `mock` mode (default): No Azure, no GitHub token, fully deterministic.
   - `copilot` mode: Swaps in RealCopilotSessionService with GitHub Copilot SDK.
   - Single flag controls entire adapter selection.

**What didn't work / needed adjustment:**
1. **`"type": "module"` required in all three package.json files:**
   - Initially only added to api + cli, forgot shared.
   - Build failed with module resolution errors until all three had ESM mode.

2. **Type guard `isNoMatchFound` initially missing from shared package:**
   - Exported in barrel but function body was missing.
   - Fixed by adding type guard: `return !Array.isArray(result) && result.noMatchFound === true;`

3. **IntakeSubmission._intake convention is temporary:**
   - Used session extension `session as AdvisorSession & { _intake?: IntakeSubmission }` to store intake.
   - Wave 3 should replace with explicit field in AdvisorSession type.

**Architecture decisions validated:**
- **Headless-first development model:** CLI harness proves Phase 1→2→3 flow works before any UI exists.
- **Dependency injection via composition root:** All adapters instantiated in one place, easy to swap mock/real.
- **Custom instructions as pre-answer gate:** Reduces redundant questions, records influence on recommendation.
- **Framework skill path resolution:** Deterministic fallback strategy (read from references/ or use embedded summary).

**Next steps:**
- Wave 3: Persistent stores (Cosmos DB for conversations, Azure AI Search for projects).
- Wave 4: Express API endpoints integration test (HTTP client test).
- Wave 5: Real Copilot SDK validation (requires GITHUB_TOKEN or COPILOT_TOKEN).
- Wave 6: Web UI that consumes the HTTP API.

### Wave 4: Live API Demo Script (2026-06-03)

**Context:** Built and validated `agents/advisor/examples/run-advisor-demo.mjs` (Node.js) and `run-advisor-demo.ps1` (PowerShell) as zero-dependency end-to-end demo scripts against the live Azure Container Apps deployment.

**Working intake payload shape (confirmed live):**
- POST `/sessions` body: `{ customerOrganizationId: "org-nfum", userId: "..." }`
- POST `/sessions/:id/intake` body: `{ intake: { submittedAt, formTitle, respondent, answers, validationState } }`
- `answers` is a flat `Record<string, string | string[]>` keyed by question IDs from the form schema
- Multi-select/multi-text questions use `string[]`; all others use `string`

**Turns to recommendation (live run against org-nfum with `instr-nfum-claims-001`):**
- **3 user turns** to reach recommendation delivery (total 4 loop iterations)
- Phase 1: 1 question answered
- Phase 2: 3 questions pre-answered by custom instructions + 1 POC-scope question answered
- Phase 3: "proceed" trigger → recommendation delivered inline
- Custom instruction `instr-nfum-claims-001` eliminated 3 questions entirely

**Recommendation produced (session-282bf386, 2026-06-03T15:35:31Z):**
- **Primary:** Microsoft Copilot Studio + Azure AI Search + Azure OpenAI/Foundry
- **Pattern:** Teams-first human-in-the-loop guidance assistant, grounded RAG retrieval
- **Confidence:** Medium-High
- **Similar projects matched:** 3 (top score 0.972 — "Rural Claims Advisor Agent — NFU Mutual")

**Cold-start behaviour observed:**
- `min-replicas=0` → container cold starts in ~5–15s (warmer on subsequent calls within same window)
- Script uses 6-attempt × 15s health retry loop (90s total budget) — sufficient in all test runs
- After `azd deploy`, ACA creates new revision but old revision may continue serving for 1–2 minutes

**API bug found and fixed — `buildRecommendationOutput` crash when Search index missing:**
- Root cause: `similarProjects()` call in `buildRecommendationOutput` was not wrapped in try/catch
- When AI Search index didn't exist, `RestError` propagated through Phase 3 "proceed" handler AND GET /recommendation, returning 500 INTERNAL_ERROR on both
- Fix: wrapped `projectSearch.similarProjects()` in try/catch, returning `{ noMatchFound: true, reason: '...' }` on failure
- File: `api/src/agent/AgentOrchestrator.ts`, method `buildRecommendationOutput`
- Note: `AzureAiSearchFrameworkRetrieval.retrieve()` already had its own try/catch fallback — no change needed there

**Known pre-existing issue (not fixed here):**
- `processMessage` returns `readinessState` from `evaluateReadiness()` (computed) rather than from `session.conversationCapture.readinessState` (stored)
- Result: returned `readinessState` shows `phase1InProgress` even after Phase 3 recommendation delivery
- GET `/recommendation` works correctly (reads stored state) — demo script recovers by detecting `recommendation` messageType
- Fix: update `processMessage` to return `session.conversationCapture.readinessState` instead of computed value (Wave 5 cleanup)

**Live demo command:**
```bash
node agents/advisor/examples/run-advisor-demo.mjs
# or on Windows:
.\agents\advisor\examples\run-advisor-demo.ps1
```

