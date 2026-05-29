# AI Framework Advisor Agent POC

**Team root:** `agents/advisor/`
**Framework skill:** `.agents/skills/microsoft-ai-decision-framework`
_Wave 1 — Foundation scaffold_

---

## What this is

A **headless-first, customer-facing advisor agent** that follows the [Microsoft AI Decision Framework](https://chrismckee1.github.io/microsoft-ai-decision-tree/) Three-Phase Decision Methodology to recommend the right Microsoft AI technology stack for a customer's use case.

The agent:
1. Receives a structured intake form submission as its opening context.
2. Loads per-organization custom instructions + organization context from Cosmos DB.
3. Moves the customer through Phase 1 (BXT), Phase 2 (9 Critical Questions), and Phase 3 (Scenario Selection) — using the `.agents/skills/microsoft-ai-decision-framework` skill as the source-of-truth methodology.
4. Skips questions already answered by intake or custom instructions.
5. Checks an Azure AI Search–backed project portfolio for similar prior work.
6. Returns a structured, grounded recommendation with rationale, trade-offs, and follow-up questions.

---

## Headless-first approach

**Build the agent path before the UI.** This means:

- Tank implements `@advisor/api` (Express + Copilot SDK + Cosmos DB + AI Search adapters).
- Apoc validates the agent from the `@advisor/cli` harness using `agents\backlog\sample-intake-form-nfum.json`.
- Mouse builds the web UI (`@advisor/web`) on top of the proven API.

At every stage, the API is the single source of truth. The UI consumes only the API — no direct data-service calls from the browser.

---

## Workspace structure

```
agents/advisor/
├── package.json          # npm workspaces root (api, cli, shared, web)
├── tsconfig.base.json    # Shared TypeScript compiler options (strict)
├── .gitignore
├── .editorconfig
├── README.md             # This file
│
├── shared/               # @advisor/shared — ALL shared contracts and validators
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts      # Public barrel — import everything from here
│       └── types/
│           ├── intake.ts           # IntakeForm, IntakeSubmission
│           ├── framework.ts        # Phase 1/2/3 types, EvidenceSource, CriticalQuestionId
│           ├── recommendation.ts   # RecommendationOutput
│           ├── similar-projects.ts # ProjectKnowledgeDocument, SimilarProjectMatch
│           ├── guidance.ts         # CustomerGuidanceDocument, OrganizationContext
│           ├── conversation.ts     # ConversationTurn, AdvisorSession
│           ├── project-case.ts     # ProjectCase (full end-to-end record)
│           ├── api.ts              # Request/response DTOs, ApiError
│           ├── validators.intake.ts  # Zod validators for intake
│           └── validators.api.ts     # Zod validators for API DTOs
│
├── api/                  # @advisor/api — Express API (Tank owns)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts      # Stub — awaiting Tank implementation
│
├── cli/                  # @advisor/cli — CLI test harness (Tank + Apoc own)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts      # Stub — awaiting Tank/Apoc implementation
│
├── web/                  # @advisor/web — Web front end (Mouse owns)
│   ├── package.json
│   └── src/README.md     # Placeholder — awaiting Mouse implementation
│
└── docs/
    ├── poc-scope.md              # Success criteria and non-goals
    ├── architecture-decisions.md # 10 architecture decisions (AD-01 to AD-10)
    └── contracts.md              # Contract guide + Cosmos DB vs AI Search split
```

---

## Build commands

From `agents/advisor/`:

```bash
# Install all workspaces
npm install

# Build shared first, then api and cli
npm run build

# Build shared only (fastest, what Tank should run after contract changes)
npm run build:shared

# Type-check without emitting
npm run typecheck

# Clean all dist/ and *.tsbuildinfo
npm run clean
```

### Prerequisites

- Node.js 20+
- npm 10+
- TypeScript 5.5+ (installed as workspace devDependency)

---

## Who owns what

| Workspace | Owner | Status |
|---|---|---|
| `shared/` | Trinity (Lead) | ✅ Wave 1 complete — builds clean |
| `api/` | Tank (Backend) | 🔲 Stub — awaiting Wave 2 |
| `cli/` | Tank + Apoc | 🔲 Stub — awaiting Wave 2 |
| `web/` | Mouse (Frontend) | 🔲 Placeholder — awaiting Wave 3 |
| `docs/` | Trinity | ✅ Wave 1 complete |

---

## External dependencies behind interfaces

Per the architecture decision (AD-08), all external dependencies are **abstracted behind interfaces** so the POC compiles and runs locally without live Azure:

| Dependency | Interface (Tank to define) | Real adapter |
|---|---|---|
| GitHub Copilot SDK | `ICopilotSessionService` | `CopilotSdkSessionService` |
| Cosmos DB | `IConversationStore` + `IGuidanceStore` | Azure Cosmos DB SDK adapter |
| Azure AI Search | `IProjectSearchService` | Azure AI Search SDK adapter |

Mock/in-memory implementations enable local dev and CLI testing without Azure credentials.

---

## Key references

- Backlog: `agents/backlog/ai-framework-advisor-agent-poc-backlog.md`
- Sample intake: `agents/backlog/sample-intake-form-nfum.json`
- Sample project case: `agents/backlog/sample-project-data-nfum.json`
- Framework skill: `.agents/skills/microsoft-ai-decision-framework/SKILL.md`
- Architecture decisions: `agents/advisor/docs/architecture-decisions.md`
- Contract guide: `agents/advisor/docs/contracts.md`
- POC scope: `agents/advisor/docs/poc-scope.md`
