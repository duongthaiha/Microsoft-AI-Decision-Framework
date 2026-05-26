# M0 Implementation Plan — AI Project Advisor Agent

> **Author:** Ripley (Lead/Architect) · **Date:** 2026-05-26  
> **Status:** Locked for this session  
> **Source of truth:** `advisor-agent/product-spec.md` (606 lines)

---

## §17 Open-Question Defaults — Review

The coordinator's defaults are **endorsed with one refinement**.

| # | Verdict | Note |
|---|---------|------|
| 1 | ✅ Endorsed | Custom web app (React + Vite + TS) is the right call — no Teams review cycle, one `azd up`. |
| 2 | ✅ Endorsed | TypeScript / Node.js + `@github/copilot-sdk`, Azure BYOM via Foundry. **Note:** the history file says "Python" for the SDK — the spec says TS/Node.js (§3 line 111). We follow the spec. Dallas must scaffold in TypeScript. |
| 3 | ✅ Endorsed | Responses protocol. |
| 4 | ✅ Endorsed | Dallas owns the Search schema. `text-embedding-3-small` (1536 dims) is fine for MVP. |
| 5 | ✅ Endorsed | Two roles: `AdvisorUser`, `AdvisorAdmin`. Cosmos data-plane RBAC per the spec. |
| 6 | ✅ Endorsed | 90-day non-submitted TTL, indefinite for confirmed. No TTL automation in M0. |
| 7 | ✅ Endorsed | Change Feed contract + sample consumer in docs. No prod consumer. |
| 8 | ✅ Endorsed | Embedded admin under `/admin/*` in the same web app. |
| 9 | ✅ Endorsed | No conversation turns on admin screens. Matches §348 and §16. |
| 10 | ✅ Endorsed | Single profile, `orgId = "default"`. Schema reserves multi-profile fields. |
| 11 | ✅ Endorsed | Dallas curates from `docs/technologies.md` + `docs/capability-model.md`. |
| 12 | ✅ Endorsed | Public networking for MVP. Spec-confirmed. |

**One refinement (not a default change):** Default #2 says "No GitHub token in MVP." Agreed — but if the Copilot SDK *requires* one during M1 integration, it becomes a Key Vault-backed secret exception. Dallas should stub the credential path with a `getModelCredential()` that returns `ManagedIdentityCredential` and has a documented fallback path. This is already in the spec (§3 line 114); I'm calling it out so nobody forgets.

---

## M0 Scope

### What we scaffold this session

A **cohesive, runnable skeleton** — every workspace installs, type-checks, lints, and has a passing (possibly empty) test suite. No feature logic yet. Think of M0 as the skeleton before the muscles:

- Monorepo structure with `agent/`, `web/`, `infra/`, `docs/`, `tests/` workspaces
- Package manifests (`package.json`, `tsconfig.json`) in each workspace
- Bicep skeleton with all required resources stubbed
- `azure.yaml` for AZD
- Cosmos DB data-model TypeScript types (all four containers)
- Agent entry point with a stubbed Responses adapter
- Web app scaffold (Vite + React + TS) with stubbed pages and router
- Test scaffolds (Vitest for agent/web, Playwright config for e2e)
- Docs skeleton (README, architecture, deployment, runbook placeholders)
- Linting (ESLint + Prettier) and CI-ready scripts

### What we defer

| Milestone | Deferred items |
|-----------|---------------|
| **M1** | Copilot SDK session wiring, framework flow logic, Cosmos DB CRUD operations, AI Search queries, intake form logic, admin CRUD, brief generation, Entra auth integration |
| **M2** | Azure deployment, real Cosmos DB + Search, Entra sign-in, admin org-context editing, pilot users |
| **M3** | Auth hardening, RBAC review, runbook completion, cost alerts, production readiness |

---

## Repository Layout

```
advisor-agent/
├── azure.yaml                          # AZD project definition
├── IMPLEMENTATION_PLAN.md              # This file
├── product-spec.md                     # PRD (source of truth)
├── package.json                        # Root workspace config (npm workspaces)
├── tsconfig.base.json                  # Shared TS compiler options
├── .eslintrc.cjs                       # Shared lint rules
├── .prettierrc                         # Formatting
├── Dockerfile                          # Agent container image
│
├── agent/                              # Backend: Copilot SDK advisor + Hosted Agent adapter
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                    # Entry point (starts the Responses server)
│       ├── adapter/
│       │   └── responses.ts            # Hosted Agent Responses protocol adapter (stub)
│       ├── framework/
│       │   ├── intake.ts               # Intake filter types + stub
│       │   ├── phase1-bxt.ts           # BXT scoring types + stub
│       │   ├── step1b-reuse.ts         # Reuse Gate types + stub
│       │   ├── phase2-groupings.ts     # Technology Groupings types + stub
│       │   └── phase3-selection.ts     # Scenario Selection types + stub
│       ├── data/
│       │   ├── cosmos-client.ts        # Cosmos client factory (ManagedIdentityCredential)
│       │   ├── models.ts               # Canonical TS types: Session, Request, Project, OrgContext
│       │   ├── session-store.ts        # Session CRUD interface + stub
│       │   ├── request-store.ts        # Request CRUD interface + stub
│       │   ├── project-store.ts        # Project read interface + stub
│       │   └── org-context-store.ts    # OrgContext read interface + stub
│       ├── search/
│       │   └── project-index.ts        # AI Search client + stub
│       ├── auth/
│       │   └── identity.ts             # getModelCredential() + caller identity resolver
│       └── admin/
│           └── admin-api.ts            # Admin API routes (stub)
│
├── web/                                # Frontend: React + Vite + TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                    # App entry
│       ├── App.tsx                     # Router shell
│       ├── pages/
│       │   ├── HomePage.tsx            # Session list / new session
│       │   ├── SessionPage.tsx         # Advisor conversation + intake form
│       │   ├── BriefPage.tsx           # Readiness brief view
│       │   ├── admin/
│       │   │   ├── AdminLayout.tsx     # Admin shell with role gate
│       │   │   ├── OrgContextPage.tsx  # Org context editor (stub)
│       │   │   ├── RequestsPage.tsx    # Requests browse (stub)
│       │   │   └── ProjectsPage.tsx    # Projects browse (stub)
│       ├── components/                 # Shared UI components (stub)
│       │   └── .gitkeep
│       ├── hooks/                      # React hooks (auth, sessions, etc.)
│       │   └── .gitkeep
│       ├── api/                        # API client layer (stub)
│       │   └── client.ts
│       └── types/                      # Shared frontend types
│           └── index.ts
│
├── infra/                              # Bicep IaC
│   ├── main.bicep                      # Orchestrator template
│   ├── main.parameters.json            # Default parameters
│   └── modules/
│       ├── cosmos.bicep                # Cosmos DB account + 4 containers
│       ├── search.bicep                # Azure AI Search
│       ├── container-registry.bicep    # ACR
│       ├── monitoring.bicep            # App Insights + Log Analytics
│       ├── identity.bicep              # Managed identities + role assignments
│       └── foundry.bicep               # Foundry project / Hosted Agent (stub/docs)
│
├── docs/                               # Feature documentation
│   ├── architecture.md                 # Architecture overview
│   ├── deployment.md                   # AZD deployment guide
│   ├── data-model.md                   # Cosmos DB data model contract
│   ├── runbook.md                      # Operational runbook (placeholder)
│   ├── admin-guide.md                  # Admin backend user guide (placeholder)
│   └── change-feed-consumer.md         # Sample downstream consumer guidance
│
└── tests/                              # Test scaffolds
    ├── unit/
    │   ├── vitest.config.ts
    │   └── agent/
    │       └── models.test.ts          # Data model type smoke tests
    ├── integration/
    │   └── .gitkeep
    └── e2e/
        ├── playwright.config.ts
        └── .gitkeep
```

---

## Per-Agent Assignments

### Dallas — Backend & Agent Dev

**Files owned:**
- `agent/src/data/models.ts` — canonical TS types (Session, Request, Project, OrgContext, AlignmentNote)
- `agent/src/data/cosmos-client.ts` — Cosmos client factory
- `agent/src/data/session-store.ts` — Session CRUD interface
- `agent/src/data/request-store.ts` — Request CRUD interface
- `agent/src/data/project-store.ts` — Project read interface
- `agent/src/data/org-context-store.ts` — OrgContext read interface
- `agent/src/search/project-index.ts` — AI Search client stub
- `agent/src/auth/identity.ts` — credential + identity resolver
- `agent/src/framework/intake.ts` — intake types
- `agent/src/framework/phase1-bxt.ts` — BXT types
- `agent/src/framework/step1b-reuse.ts` — Reuse Gate types
- `agent/src/framework/phase2-groupings.ts` — Technology Groupings types
- `agent/src/framework/phase3-selection.ts` — Scenario Selection types
- `agent/src/adapter/responses.ts` — Responses protocol adapter stub
- `agent/src/admin/admin-api.ts` — Admin API routes stub
- `agent/src/index.ts` — Entry point
- `agent/package.json` — Package manifest
- `agent/tsconfig.json` — TS config

**M0 acceptance criteria:**
1. `cd agent && npm install && npm run build` succeeds with zero errors.
2. `npm run lint` passes.
3. `models.ts` exports typed interfaces for all four Cosmos containers matching the spec §7 Backend model.
4. `cosmos-client.ts` exports a `createCosmosClient()` that uses `ManagedIdentityCredential` with `DefaultAzureCredential` fallback (FR-016).
5. Every store file exports a typed interface (e.g. `ISessionStore`) and a stub class that throws `NotImplementedError`.
6. `responses.ts` exports a minimal HTTP handler that returns `200 OK` with a health-check JSON body.
7. `identity.ts` exports `getModelCredential()` returning `ManagedIdentityCredential` and `resolveCallerId(req)` returning `string`.
8. All framework files export input/output type interfaces and a stub `run*` function.

**Cross-cutting:** Lambert consumes `models.ts` types. Brett writes tests against Dallas's interfaces. Parker's Bicep must match the container names and partition keys Dallas defines.

**Spec refs:** FR-002, FR-004, FR-007, FR-008, FR-016, FR-018, FR-019, FR-020, FR-022, FR-023, FR-024.

---

### Lambert — Frontend Dev

**Files owned:**
- `web/` — entire directory
- `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`
- `web/src/main.tsx`, `web/src/App.tsx`
- `web/src/pages/HomePage.tsx`
- `web/src/pages/SessionPage.tsx`
- `web/src/pages/BriefPage.tsx`
- `web/src/pages/admin/AdminLayout.tsx`
- `web/src/pages/admin/OrgContextPage.tsx`
- `web/src/pages/admin/RequestsPage.tsx`
- `web/src/pages/admin/ProjectsPage.tsx`
- `web/src/api/client.ts`
- `web/src/types/index.ts`

**M0 acceptance criteria:**
1. `cd web && npm install && npm run build` succeeds.
2. `npm run dev` starts Vite dev server; opening `http://localhost:5173` shows the app shell.
3. Router has routes for `/`, `/session/:id`, `/brief/:id`, `/admin`, `/admin/org-context`, `/admin/requests`, `/admin/projects`.
4. Each page component renders a placeholder with the page name.
5. `AdminLayout.tsx` wraps admin routes and renders a "requires AdvisorAdmin role" placeholder.
6. `web/src/types/index.ts` re-exports types from `agent/src/data/models.ts` (or duplicates the interfaces with a TODO to unify).
7. `npm run lint` passes.

**Cross-cutting:** Lambert depends on Dallas's `models.ts` for shared types. Kane provides UX direction (M0: just placeholder layout). Brett adds Playwright e2e stubs against Lambert's routes.

**Spec refs:** FR-001, FR-018, FR-021, FR-027, FR-028, FR-029.

---

### Parker — Infra/DevOps Engineer

**Files owned:**
- `azure.yaml`
- `Dockerfile`
- `infra/main.bicep`
- `infra/main.parameters.json`
- `infra/modules/cosmos.bicep`
- `infra/modules/search.bicep`
- `infra/modules/container-registry.bicep`
- `infra/modules/monitoring.bicep`
- `infra/modules/identity.bicep`
- `infra/modules/foundry.bicep`
- Root `package.json` (workspaces config)
- `tsconfig.base.json`
- `.eslintrc.cjs`
- `.prettierrc`

**M0 acceptance criteria:**
1. `azure.yaml` defines the advisor-agent project with services for `agent` and `web`.
2. `Dockerfile` is a multi-stage Node.js build that produces the agent container image.
3. `main.bicep` compiles without errors (`az bicep build -f infra/main.bicep`).
4. `cosmos.bicep` declares the account, database, and four containers (`sessions /ownerId`, `requests /ownerId`, `projects /projectId`, `org-context /orgId`).
5. `search.bicep` declares an AI Search service with a placeholder index.
6. `identity.bicep` stubs managed identity and role assignment resources.
7. `monitoring.bicep` declares App Insights + Log Analytics workspace.
8. Root `package.json` uses npm workspaces referencing `agent` and `web`.
9. `npm install` from the repo root succeeds and hoists shared deps.
10. Shared `tsconfig.base.json` sets strict mode, ES2022 target, Node module resolution.
11. ESLint + Prettier configs are present and `npm run lint` works at root level.

**Cross-cutting:** Parker's Cosmos container names and partition keys must match Dallas's `models.ts`. Parker's `azure.yaml` service names must match the build outputs from Dallas (agent) and Lambert (web).

**Spec refs:** FR-003, FR-016, FR-017, §9 Azure Deployment Requirements.

---

### Brett — Tester

**Files owned:**
- `tests/unit/vitest.config.ts`
- `tests/unit/agent/models.test.ts`
- `tests/e2e/playwright.config.ts`
- `tests/integration/.gitkeep`
- `tests/e2e/.gitkeep`

**M0 acceptance criteria:**
1. `vitest.config.ts` is configured to find tests under `tests/unit/`.
2. `models.test.ts` contains at least one smoke test that imports Dallas's `models.ts` types and validates a sample document shape (compile-time type check + runtime shape assertion).
3. `playwright.config.ts` points to Lambert's dev server URL and defines a basic project.
4. `npm run test` (root script) runs Vitest and reports a passing result.
5. A `tests/README.md` explains the test structure and how to run each tier.

**Cross-cutting:** Brett depends on Dallas's exported types and Lambert's dev server. Brett does NOT write feature tests in M0 — only scaffold and smoke.

**Spec refs:** §14 Testing Strategy.

---

### Kane — Designer

**Files owned:**
- `web/src/components/.gitkeep` (placeholder — Kane's M1 deliverables will live here)
- No files created in M0 beyond providing UX direction

**M0 acceptance criteria:**
1. Write a `docs/ux-direction.md` (max 80 lines) that captures:
   - The intake form field list (from spec §4 and §7)
   - Page hierarchy: Home → Session → Brief, Admin → OrgContext / Requests / Projects
   - Key UX principle: "the advisor is a conversation, not a wizard — the form starts the conversation, the chat continues it"
   - Accessibility baseline: WCAG 2.1 AA target
   - Color / typography note: follow the repo's existing dark-theme convention where applicable
2. This document is Lambert's reference for M1 UI build.

**Cross-cutting:** Kane's UX doc informs Lambert's page structure. Ash references Kane's doc in the admin guide.

**Spec refs:** FR-001, FR-021, FR-027.

---

### Ash — DevRel / Tech Writer

**Files owned:**
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/data-model.md`
- `docs/runbook.md`
- `docs/admin-guide.md`
- `docs/change-feed-consumer.md`
- `advisor-agent/README.md`

**M0 acceptance criteria:**
1. `README.md` includes: project name, one-paragraph summary (storytelling voice), prerequisites, local setup (`npm install`, `npm run build`, `npm run dev`), project structure overview, link to `product-spec.md`, and a "Status: M0 Scaffold" badge or note.
2. `docs/architecture.md` contains the architecture overview from spec §8 (rewritten in the Constitution's storytelling voice — "the intake desk plus the librarian" analogy).
3. `docs/deployment.md` has AZD commands (`azd up`, `azd provision`, `azd deploy`) with placeholder environment setup steps.
4. `docs/data-model.md` documents the four Cosmos containers, their partition keys, and document shapes (reference Dallas's `models.ts`).
5. `docs/runbook.md`, `docs/admin-guide.md`, `docs/change-feed-consumer.md` are placeholder files with TOC and section headers only — content deferred to M1+.
6. All docs pass the Constitution's "coffee test" — no dry feature lists. Microsoft Learn URLs in code comments/docs for Cosmos DB, AI Search, Foundry, Copilot SDK, Entra, and Bicep.

**Cross-cutting:** Ash references Dallas's `models.ts` in the data-model doc. Ash references Parker's Bicep structure in deployment.md. Ash references Kane's UX doc in admin-guide.md.

**Spec refs:** §13 Documentation Requirements, Constitution Articles I, VI, IX.

---

## Data Model Summary

Four Cosmos DB containers. Dallas produces the canonical TypeScript types in `agent/src/data/models.ts`.

### `sessions` — partition key `/ownerId`

```
Session {
  id: string               // sessionId (UUID)
  ownerId: string           // Entra oid or demo id
  ownerType: "entra" | "demo"
  title: string
  status: "active" | "submitted" | "archived"
  createdAt: string         // ISO 8601
  lastActiveAt: string
  turnCount: number
  currentRequestId?: string
  submittedRequestId?: string
}
```

### `requests` — partition key `/ownerId`

```
Request {
  id: string               // requestId (UUID)
  sessionId: string
  ownerId: string
  submitterId?: string
  title: string
  businessOutcome: string
  targetUsers: string
  desiredBehavior: string
  dataSources: string[]
  actions: string[]
  constraints: string[]
  frameworkAnswers: Record<string, FrameworkAnswer>
  bxtScore?: BxtScore
  similarProjectMatches: SimilarMatch[]
  reuseDecision?: ReuseDecision
  linkedProjectId?: string
  readinessBrief?: ReadinessBrief
  orgContextVersion?: string
  alignmentNotes: AlignmentNote[]
  status: "Draft" | "ReadyForConfirmation" | "New"
  createdAt: string
  updatedAt: string
  submittedAt?: string
}
```

### `projects` — partition key `/projectId`

```
Project {
  id: string               // projectId (UUID)
  name: string
  summary: string
  owner: string
  businessOutcomes: string[]
  userGroups: string[]
  technologies: string[]
  dataDomains: string[]
  status: string
  lessonsLearned: string[]
  linkedRequestIds: string[]
  createdAt: string
  updatedAt: string
}
```

### `org-context` — partition key `/orgId`

```
OrgContext {
  id: string               // version id (UUID)
  orgId: string             // "default" in MVP
  version: number
  editorId: string
  editedAt: string
  changeSummary: string
  systemInventory: SystemEntry[]
  entitlements: Entitlement[]
  customInstructions: CustomInstruction[]
  published: boolean
}
```

Supporting types: `SystemEntry`, `Entitlement` (`available | available-with-restrictions | unavailable`), `CustomInstruction` (`preference | hard-constraint | context-note`), `AlignmentNote` (`followed | partially-followed | not-followed`), `BxtScore`, `SimilarMatch`, `ReuseDecision`, `ReadinessBrief`, `FrameworkAnswer`.

---

## Coordination Rules

### Shared file ownership

| File | Owner | Others may… |
|------|-------|-------------|
| `agent/src/data/models.ts` | Dallas | Import only. Propose changes via decision inbox. |
| Root `package.json`, `tsconfig.base.json` | Parker | All agents can add deps to their own workspace `package.json`. |
| `azure.yaml`, `infra/*` | Parker | Dallas/Lambert note resource needs; Parker implements. |
| `docs/*` | Ash | Other agents may draft; Ash is reviewer for voice/accuracy. |

### Collision avoidance

1. **No two agents edit the same file.** If you need a change in another agent's file, write a request to `.squad/decisions/inbox/` with the proposed change.
2. **Workspace boundaries are hard.** Dallas owns `agent/`, Lambert owns `web/`, Parker owns `infra/` + root config, Brett owns `tests/`, Kane owns UX docs, Ash owns `docs/` + README.
3. **Types flow one way:** `agent/src/data/models.ts` → consumers. Never duplicate types — import or re-export.

### Decision inbox protocol

- File name: `{agent}-{topic}.md` (e.g. `dallas-add-field-to-session.md`)
- Required fields: **Who**, **What**, **Why**, **Affected agents**, **Proposed resolution**
- Ripley reviews and resolves within the session.

---

## Constitution Alignment Notes

### Where the storytelling voice matters

1. **Readiness briefs** (Phase 3 output) — these are the agent's deliverable to the user. They must read like a senior architect's recommendation, not a JSON dump. Constitution Article IX: "If it's boring, rewrite it."
2. **Error messages** — when the agent can't find similar projects, or Cosmos fails, the message should be clear and human. "I couldn't check the project shelf right now" > "AI Search query failed with 503."
3. **Docs** — every file in `docs/` must pass the coffee test. Ash is accountable. The "intake desk plus librarian" analogy from spec §8 is the anchor metaphor.
4. **README** — first impression. Storytelling voice, not boilerplate.

### Where Microsoft-first evidence applies

All technical references to Azure services, Copilot SDK, or Foundry must include a Microsoft Learn URL in code comments and docs. Minimum set:

| Topic | Required citation |
|-------|-------------------|
| Copilot SDK | `https://github.com/github/copilot-sdk` |
| Foundry Hosted Agents | `https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents` |
| Cosmos DB NoSQL | `https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/` |
| Cosmos DB RBAC | `https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/security/how-to-grant-data-plane-role-based-access` |
| AI Search RBAC | `https://learn.microsoft.com/en-us/azure/search/search-security-rbac` |
| Entra app roles | `https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps` |
| Bicep | `https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview` |
| AZD | `https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/overview` |
| Passwordless connections | `https://learn.microsoft.com/azure/developer/intro/passwordless-overview` |

Constitution Article I: "Cite the Specs, Own the Story." Technical claims must be verifiable. Analogies and mental models are ours.

---

## Framework Spine (Locked)

The advisor's conversational flow follows this sequence. Every framework file in `agent/src/framework/` maps to one step:

```
Intake → Phase 1 BXT → Step 1b Reuse Gate → Phase 2 Technology Groupings
  → Phase 3 Scenario Selection → Brief → Confirm → status: New
```

This is the skeleton. Dallas stubs each step as a typed function with input/output interfaces. The logic comes in M1.

---

*This plan is the house bible. Follow it, and we ship a clean scaffold that M1 can build on without rework. Deviate from it, and file a decision drop explaining why.*
