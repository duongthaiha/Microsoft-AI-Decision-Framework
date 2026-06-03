# Squad Decisions

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

---

# Decision: Backend Agent Runtime Architecture

**Status:** Implemented (Wave 2 — 2025-05-29)  
**Context:** AI Framework Advisor Agent POC — Headless agent orchestration runtime  
**Decider:** Tank (Backend/Agent Engineer)  
**Stakeholders:** Ha Duong (User/Tech Lead), Echo (Researcher)

---

## Problem Statement

The AI Framework Advisor Agent needs a **headless, testable, and deterministic agent orchestration runtime** that:
1. Implements the three-phase decision methodology (BXT → 9 Questions → Scenario Selection).
2. Can run in **mock mode** (no Azure, no LLM, no credentials) for local development and CI/CD.
3. Supports **custom instructions** as a pre-answer gate to eliminate redundant questions.
4. Provides a **CLI test harness** to prove the Phase 1→2→3 flow before any UI exists.
5. Allows **adapter swapping** (mock vs. real) via a single environment variable.

**Key constraints:**
- Must support **strict TypeScript** (`exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`).
- Must use **ESM modules** (`"type": "module"`) for `import.meta.url` path resolution.
- Must work **offline and deterministically** by default (no external API calls in mock mode).

---

## Decision

**Chosen architecture:**

### 1. **Composition Root with Mode Switching**
- **File:** `agents/advisor/api/src/composition.ts`
- **Mechanism:** `ADVISOR_AGENT_MODE` environment variable controls adapter selection.
  - `mock` mode (default): In-memory adapters + MockCopilotSessionService (deterministic, no LLM).
  - `copilot` mode: RealCopilotSessionService (GitHub Copilot SDK) + runtime guards.
- **Benefit:** Single flag swaps entire adapter layer. No code changes needed.

### 2. **In-Memory Adapters with Seed Data**
- **Purpose:** Enable complete Phase 1→2→3 testing without any external dependencies.
- **Implementations:**
   - `MockCopilotSessionService`: Deterministic responses (no LLM).
   - `InMemoryConversationStore`: In-memory session storage.
   - `InMemoryGuidanceStore`: Seeded with NFU custom instructions.
   - `InMemoryProjectSearch`: 3 seed projects for similar-project lookup.
   - `InMemoryFrameworkRetrieval`: Reads from skill `references/` or uses embedded fallback.
- **Benefit:** Instant feedback loop for developers. No Azure credentials needed.

### 3. **Three-Phase Agent Orchestration**
- **File:** `agents/advisor/api/src/agent/AgentOrchestrator.ts` (542 lines)
- **Phase 1:** BXT (Business, Desirability, Technology Feasibility) assessment.
- **Phase 2:** 9 Critical Questions with custom instruction pre-answer gate.
- **Phase 3:** Scenario-specific selection and recommendation synthesis.
- **Custom Instruction Pre-Answer Gate:**
   - Before asking Phase 2/3 questions, agent checks `guidance.instructions`.
   - If an instruction has `appliesToFrameworkQuestions`, agent pre-answers and records influence.
   - Skips redundant questions. **Result:** 3 custom instructions eliminated 6 redundant questions in NFU flow.
- **Benefit:** Reduces conversation length, records decision provenance, respects org-specific policies.

### 4. **CLI Test Harness (Headless-First Validation)**
- **File:** `agents/advisor/cli/src/index.ts` (206 lines)
- **Flow:** Intake → Phase 1 BXT → Phase 2 Nine Questions → Phase 3 Recommendation → Similar Projects.
- **Dynamic imports:** Loads `../../api/dist/composition.js` and `../../api/dist/app.js` at runtime.
- **Type safety workaround:** Uses `as any` for dynamic imports since TypeScript can't enforce compatibility between `src` and `dist`.
- **Benefit:** Proves agent loop works before any HTTP API or UI exists. Instant validation.

### 5. **Strict TypeScript Compliance**
- **Config:** `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
- **Key learnings:**
   - Cannot assign `undefined` to optional properties. Must conditionally set: `if (value) obj.optionalProp = value;`
   - Array/map access returns `T | undefined`. Always guard with `?? null` or nullish checks.
- **Benefit:** Catches real bugs at compile time.

### 6. **ESM Module Setup**
- **Config:** `"type": "module"` in all three package.json files (shared, api, cli).
- **Module resolution:** `"module": "Node16"`, `"moduleResolution": "Node16"`.
- **Import extensions:** All imports use `.js` (not `.ts`) per Node16 ESM rules.
- **SKILL_PATH resolution:** Resolves to `../../../../.agents/skills/microsoft-ai-decision-framework` from `api/dist/`.
- **Benefit:** Enables `import.meta.url` for dynamic path resolution.

---

## Alternatives Considered

### ❌ Single TypeScript project (no monorepo)
- **Rejected:** Would force CLI to bundle all API code. No clean dependency boundaries.

### ❌ HTTP API first, CLI later
- **Rejected:** Requires spinning up Express server for every test. Slow feedback loop.

### ❌ Real GitHub Copilot SDK from day one
- **Rejected:** Requires GitHub token. Nondeterministic. Slow. Expensive. Can't run in CI/CD without secrets.

### ❌ Hard-coded dependencies (no DI)
- **Rejected:** Can't swap mock/real adapters without code changes. No testability.

---

## Implementation Artifacts

**Created files (23 total):**
- **Interfaces (6 files):** `agents/advisor/shared/src/interfaces/` — All service contracts.
- **Adapters (6 files):** `agents/advisor/api/src/adapters/inmemory/` — All in-memory implementations.
- **Tools (2 files):** `agents/advisor/api/src/tools/` — Framework retrieval + similar project lookup.
- **Agent (3 files):** `agents/advisor/api/src/agent/` — Instructions, readiness gates, orchestrator.
- **Core (3 files):** `agents/advisor/api/src/` — Logger, composition, app.
- **CLI (1 file):** `agents/advisor/cli/src/index.ts` — Full test harness.
- **Updated configs:** package.json files (api, cli, shared) — Added dependencies + ESM mode.

**Build output:**
- ✅ All TypeScript builds successfully.
- ✅ CLI harness completes Phase 1→2→3 flow.
- ✅ Recommendation output includes: primary technologies, rationale, custom instruction influence, similar projects, trade-offs.

---

## Validation

**Success metrics:**
- ✅ Build passes with strict TypeScript (`exactOptionalPropertyTypes: true`).
- ✅ CLI harness exercises complete Phase 1→2→3 flow without external dependencies.
- ✅ Custom instructions pre-answer 6 questions in NFU flow.
- ✅ Similar project lookup returns 1 match (Policy Guidance Assistant for Commercial Insurance).
- ✅ Recommendation output includes all required fields (status, confidence, rationale, trade-offs, sources).
- ✅ Logger redacts sensitive content (intake answers, user messages).
- ✅ No Azure credentials or GitHub tokens required in mock mode.

---

## Consequences

**Benefits:**
- ✅ **Instant local development:** No Azure, no credentials, fully deterministic.
- ✅ **Headless-first validation:** Proves agent loop works before any UI exists.
- ✅ **Custom instructions reduce redundancy:** 3 instructions eliminated 6 questions.
- ✅ **Type safety:** Strict TypeScript catches bugs at compile time.
- ✅ **Clean adapter swapping:** Single environment variable switches mock/real mode.

**Risks:**
- ⚠️ **Real Copilot SDK not yet validated:** RealCopilotSessionService compiles but untested.
- ⚠️ **Temporary `_intake` convention:** Session extension used instead of explicit field.
- ⚠️ **Dynamic import type safety:** CLI uses `as any` to avoid `unknown` errors.

**Next steps:**
- **Wave 3:** Persistent stores (Cosmos DB, Azure AI Search).
- **Wave 4:** Express API integration tests (HTTP client).
- **Wave 5:** Real Copilot SDK validation (requires GitHub token).
- **Wave 6:** Web UI consuming the HTTP API.

---

**Decision Date:** 2025-05-29  
**Status:** ✅ Implemented and validated via CLI harness  
**Next Review:** After Wave 3 (persistent stores) implementation

---
