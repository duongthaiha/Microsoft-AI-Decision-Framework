# Trinity — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework
- **Build:** AI Framework Advisor Agent POC (headless-first customer-facing advisor).
- **Stack:** Node.js + TypeScript, GitHub Copilot SDK runtime, Express API, Cosmos DB, Azure AI Search, Bicep + azd, Azure Container Apps.
- **Output root:** All advisor code/artifacts under `agents/` (e.g. `agents/advisor/`). Framework skill stays at `.agents/skills/microsoft-ai-decision-framework`.
- **User:** Ha Duong.
- **Methodology:** Three-Phase Decision Methodology (Phase 1 BXT, Phase 2 Technology Groupings / 9 questions, Phase 3 Scenario Selection).

## Learnings

### Wave 1 — Foundation Scaffold (2026-05-29)

**Project structure established under `agents/advisor/`:**

```
agents/advisor/
├── package.json          # npm workspaces root: shared, api, cli, web
├── tsconfig.base.json    # Shared strict TypeScript config (target ES2022, module Node16)
├── .gitignore / .editorconfig
├── README.md
├── shared/               # @advisor/shared — all contracts + Zod validators
│   └── src/types/        # intake.ts, framework.ts, recommendation.ts,
│                         # similar-projects.ts, guidance.ts, conversation.ts,
│                         # project-case.ts, api.ts, validators.intake.ts, validators.api.ts
├── api/                  # @advisor/api stub (Tank owns)
├── cli/                  # @advisor/cli stub (Tank + Apoc own)
├── web/                  # @advisor/web placeholder (Mouse owns)
└── docs/                 # poc-scope.md, architecture-decisions.md, contracts.md
```

**Key file paths:**
- Shared barrel export: `agents/advisor/shared/src/index.ts`
- All TypeScript types: `agents/advisor/shared/src/types/*.ts`
- Architecture decisions (human-readable): `agents/advisor/docs/architecture-decisions.md`
- Architecture decisions (squad inbox): `.squad/decisions/inbox/lead-architecture-foundation.md`
- POC scope + non-goals: `agents/advisor/docs/poc-scope.md`
- Contract guide + DB split: `agents/advisor/docs/contracts.md`

**Contract design decisions:**
1. `organizationContext` sits at the SAME level as `instructions[]` in `CustomerGuidanceDocument` (matches sample-project-data-nfum.json — backlog requirement).
2. `SimilarProjectResult` is a union type (`SimilarProjectMatch[] | NoMatchFound`) — never a silent empty array.
3. `EvidenceSource` is a string union on every critical question answer — enables full auditability of where each recommendation fact came from.
4. `IntakeSubmission.answers` is a flat `Record<string, AnswerValue>` keyed by question ID — stable contract even as form sections and labels evolve.
5. `ProjectCase` includes a `projectKnowledgeDocument` field that is the Azure AI Search projection — Cosmos DB and AI Search responsibilities are non-overlapping.
6. External dependencies (Copilot SDK, Cosmos DB, Azure AI Search) are NOT in `@advisor/shared` — they are abstracted behind interfaces that Tank defines in `@advisor/api`.

**Verified build commands (run from `agents/advisor/`):**
```bash
npm install          # Installs all workspaces; 96 packages, 0 vulnerabilities
npm run build        # Builds shared → api → cli; all pass tsc --build with strict mode
npm run build:shared # Builds shared only
npm run typecheck    # Type-checks without emitting (no tsbuildinfo needed)
npm run clean        # rimraf dist tsconfig.tsbuildinfo per workspace (explicit, not glob — Windows rimraf glob fails)
```

**Node.js version confirmed:** v22.22.0 (≥ 20 requirement met)
**TypeScript version:** 5.5.4

**What Tank needs to know:**
- `@advisor/api` stub is at `agents/advisor/api/src/index.ts` — imports from `@advisor/shared` already wired and compiling.
- Define `ICopilotSessionService`, `IConversationStore`, `IGuidanceStore`, `IProjectSearchService` interfaces in `@advisor/api/src/interfaces/` — do not add Azure SDK packages to `@advisor/shared`.
- All 7 API endpoint DTOs are defined in `@advisor/shared/src/types/api.ts` — use these shapes for Express route handlers.
- Zod validators for intake and API DTOs are in `validators.intake.ts` and `validators.api.ts`.

**What Switch needs to know:**
- Cosmos DB document shapes: `AdvisorSession` (conversation.ts) and `CustomerGuidanceDocument` (guidance.ts).
- Azure AI Search document shape: `ProjectKnowledgeDocument` (similar-projects.ts).
- `CustomerGuidanceDocument` partition key: `customerOrganizationId`.
- `AdvisorSession` TTL: `ttlSeconds` field (nullable — null = no expiry).
- Search result union type: `SimilarProjectMatch[] | NoMatchFound` — implement `isNoMatchFound()` type guard (exported from `@advisor/shared`).

### Wave 5 — Demo & Handoff (2026-05-29)

Produced the Epic 8 handoff package under `agents\advisor\docs\handoff\`:
- `demo-script.md` — CLI-only mock fast path, full UI walkthrough, NFU Mutual sample flow, admin instruction update, and redeploy/config behavior.
- `architecture-handoff.md` — endpoint inventory from `app.ts`, intake/session/three-phase/recommendation data flow, infra Mermaid diagram, identity model, and POC-vs-production gaps.
- `next-phase-backlog.md` — production hardening backlog separated from completed POC criteria.
- `known-limitations.md` — honest POC limitations, including D1 in-memory no-match limitation and G1 Q8/team-skills mock limitation.

Recorded cross-cutting handoff decisions in `.squad\decisions\inbox\trinity-wave5-handoff.md`. No source code or deployments were changed in this wave.
