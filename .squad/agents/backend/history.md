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

