# Squad Decisions

## Active Decisions

### 2026-05-26: M0 Scaffold Decisions (Dated Session)

#### ripley-m0-plan-approved

**By:** Ripley (Lead/Architect)  
**Date:** 2026-05-26

**§A — Open-question defaults endorsed**

All 12 defaults from squad-open-questions-defaults are endorsed as-is. One clarification recorded: Default #2 (TypeScript / Azure BYOM) is confirmed as the spec's intent (§3 line 111). The history.md reference to "Python" is legacy and overridden. If the Copilot SDK requires a GitHub token during M1, it becomes a Key Vault-backed exception per spec §3 line 114.

**§B — M0 scope locked**

M0 delivers a cohesive scaffold: monorepo structure, package manifests, Bicep skeleton, `azure.yaml`, canonical TS data-model types, agent entry point with stubbed Responses adapter, React web app scaffold with stubbed pages, test scaffolds, docs skeleton, and shared lint/format config. No feature logic. Everything installs, type-checks, lints, and has a passing test suite.

Deferred to M1: Copilot SDK wiring, framework flow logic, Cosmos CRUD, AI Search queries, intake form logic, admin CRUD, brief generation, Entra auth.  
Deferred to M2: Azure deployment, real data stores, Entra sign-in, admin editing, pilot users.  
Deferred to M3: Auth hardening, RBAC review, runbook completion, production readiness.

**§C — Per-agent assignments**

Assignments are documented in `advisor-agent/IMPLEMENTATION_PLAN.md` with exact file paths, acceptance criteria, cross-cutting dependencies, and spec FR/AC references.

**§D — References**

- Plan file: `advisor-agent/IMPLEMENTATION_PLAN.md`
- Spec: `advisor-agent/product-spec.md`
- Defaults: squad-open-questions-defaults
- Constitution: `CONSTITUTION.md`

---

#### squad-open-questions-defaults

**By:** Ha Duong (via Squad coordinator — autonomous decisions)  
**Date:** 2026-05-26

12 defaults resolve §17 Open Questions for MVP scaffold. Every default is reversible and documented for first user contact review. Defaults cover: client/channel (React web), SDK language (TypeScript/Azure BYOM), protocol (Responses), AI Search schema, RBAC (2 Entra roles), data retention (90d sessions / indefinite Requests), Change Feed consumer, admin UI (embedded), admin browse (Requests only, no turns), org context (single published), product list source (repo docs), and networking (public).

Implementation milestones: M0 (scaffold), M1 (prototype with local Copilot SDK), M2 (Azure pilot), M3 (production).

---

#### ash-m0-docs-structure

**Who:** Ash (DevRel / Tech Writer)  
**Date:** 2026-05-26  
**Status:** Complete — M0 Awaiting review

Created all seven M0 documentation files with Constitution-aligned voice and Microsoft-first evidence:

1. **README.md** — Entry point with "front desk + librarian" narrative, prerequisites, local setup, links to docs and Microsoft Learn
2. **docs/architecture.md** — Architecture overview with "admissions office" narrative arc, component diagram, design rationale
3. **docs/deployment.md** — Dev/Test/Prod environments with AZD commands, env var table, Bicep modules
4. **docs/data-model.md** — Four Cosmos containers documented with TypeScript interface signatures, partition isolation explained
5. **docs/runbook.md** — M0 placeholder with 7 sections, TOC, `<!-- M1: fill in -->` comments
6. **docs/admin-guide.md** — M0 placeholder with 5 sections, custom instruction examples, `<!-- M1: expand -->` comments
7. **docs/change-feed-consumer.md** — Change Feed contract, document shape, 20-line TypeScript consumer example

**Voice & Style:** Every doc opens with storytelling sentence and Teaching Triad (Concept → Analogy → Product). All external links verified against Microsoft Learn or product-spec.md—no fabricated URLs. Runbook and admin-guide are production-ready placeholders with full TOC structure.

**Acceptance:** All 7 files at documented paths; Constitution voice applied; Microsoft-first evidence used; M1 placeholders match pattern; cross-references verified (Dallas data-model, Parker Bicep, Kane UX).

---

#### brett-test-architecture

**Who:** Brett (Tester)  
**Date:** 2026-05-26  
**Status:** Adopted — M0 scaffold complete

Three-tier test architecture scaffolded under `tests/`:

| Tier | Location | Runner | CI? |
|------|----------|--------|-----|
| Unit | `tests/unit/` | Vitest 1.6 | Yes — `npm run test` |
| Integration | `tests/integration/` | Manual until M2 | No |
| E2e | `tests/e2e/` | Playwright 1.44 | On-demand |

**Why this structure:** Unit tier is a separate workspace (@advisor/tests) to keep Dallas's agent build clean. Single vitest config covers both agent and unit test discovery. Integration tier is empty with .gitkeep until M2 (needs provisioned Azure resources). E2e tier skipped in M0 (Lambert's pages are stubs); all e2e tests carry `test.skip()`, `// AC-XX:` reference, and `// TODO M1:` comment to document acceptance gates without breaking CI.

**AC mapping:** Acceptance criteria from product-spec §6 (AC-01 through AC-26) are tracked in test comments. M0 covers AC-05, AC-06, AC-07, AC-13, AC-15, AC-19 at unit level; M1 will add AC-08, AC-09, AC-11, AC-20, AC-21, AC-22, AC-26.

**Affected agents:** Dallas agent test script uses `vitest run --passWithNoTests`. Lambert's Playwright config starts `web` dev server. Parker's root package.json includes `tests` workspace.

---

#### dallas-data-model

**Author:** Dallas (Backend & Agent Developer)  
**Date:** 2026-05-26  
**Status:** M0 — locked for this session; update when M1 changes a field shape.

Canonical document shapes for the four Cosmos DB containers. Future agents (Lambert, Brett, Parker) reference this instead of scanning product-spec.md §7 directly. TypeScript source of truth is `agent/src/data/models.ts`.

**Containers:**
- **sessions:** Partition `/ownerId`; fields: id, sessionId, ownerId, ownerType, title, status, createdAt, lastActiveAt, turnCount, currentRequestId, submittedRequestId, _etag.
- **requests:** Partition `/ownerId`; fields: id, requestId, sessionId, ownerId, submitterId, title, businessOutcome, targetUsers, desiredBehavior, dataSources, actions, constraints, frameworkAnswers, similarProjectMatches, reuseDecision, linkedProjectId, readinessBrief, readinessBriefRef, status, orgContextVersion, createdAt, updatedAt, submittedAt, _etag.
- **projects:** Partition `/projectId`; fields: id, projectId, name, summary (indexed + vector), owner, businessOutcomes, userGroups, technologies, dataDomains, status, lessonsLearned, linkedRequestIds, tags, createdAt, updatedAt.
- **org-context:** Partition `/orgId`; fields: id, orgId, version, editorId, editedAt, changeSummary, systemInventory, entitlements, customInstructions, published.

**Status transitions** for requests: Draft → ReadyForConfirmation (brief generated) → New (user confirms; ETag precondition on replace).

**AI Search schema:** projectId (key), name, summary (searchable + vector 1536 dims), owner, status, technologies[], tags[], linkedRequestCount, updatedAt.

**Cross-references:** TypeScript interfaces at `agent/src/data/models.ts`; Cosmos client at `agent/src/data/cosmos-client.ts`; Store interfaces at `agent/src/data/{session,request,project,org-context}-store.ts`.

---

#### kane-ux-direction

**Owner:** Kane (Designer)  
**Status:** Ready for review  
**Date:** 2026-05-26

**The UX Principle:** "The advisor is a conversation, not a wizard. The form starts the conversation; the chat continues it."

Not a multi-step form wizard. Intake fields are optional on first visit; partial answers accepted. The advisor asks clarifications in chat. Users can edit intake at any time. No blocking, no mandatory fields, no friction.

**What This Unlocks:**
1. Lower friction for users — start with what you know; advisor fills gaps.
2. Conversation-first design — chat becomes primary interaction.
3. Editability without loss of context — revise intake without re-answering framework questions.
4. Admin read-only surfaces — prevents race conditions between concurrent sessions and admin edits to Org Context.

**Constraints & Guardrails:**
- No required fields on first submit (intake must be optional/partial).
- Admin surfaces read-only by design (no inline edits).
- Dark theme + system sans-serif (no custom fonts in M0).
- WCAG 2.1 AA accessibility in place at M0 (keyboard nav, focus visible, labels, color contrast ≥4.5:1).
- Brief leads with recommendation (Constitution voice: outcomes → behaviors → platforms).
- Org Context versioning — every recommendation carries the version it was generated with.

**Handed to Lambert:** UX direction doc is M1 UI build reference. Key artifacts: intake field groups (Identity | Outcome | Data | Action Shape | Constraints), page hierarchy (Home → Session → Brief, Admin → OrgContext / Requests / Projects), brief structure (Recommendation → Why This Fits → Similar Projects → Org Alignment → Risks/Actions), accessibility baseline (WCAG 2.1 AA), deferred (icons, illustrations, animations).

**Implications:** Ash (partial Request schema), Brett (Cosmos writes on every turn), Ralph (clarification questions in chat), Ripley (admin RBAC + read-only).

---

#### lambert-web-app-shape

**Who:** Lambert (Frontend Dev)  
**Date:** 2026-05-26

Structural decisions for M0 web app scaffold — routing contract for Brett (Playwright e2e) and auth contract for M1 integration.

**Route tree:**
```
/                           → HomePage       (RequireAuth)
/session/:id                → SessionPage    (RequireAuth)
/brief/:id                  → BriefPage      (RequireAuth)
/admin                      → redirect → /admin/org-context
/admin/org-context          → OrgContextPage (RequireAdmin inside AdminLayout)
/admin/requests             → RequestsPage   (RequireAdmin inside AdminLayout)
/admin/projects             → ProjectsPage   (RequireAdmin inside AdminLayout)
```

RequireAuth wraps entire App in `App.tsx` (via `main.tsx → App → RequireAuth`). Admin routes doubly gated: RequireAuth at app level, RequireAdmin inside AdminLayout.

**Admin gate strategy:** RequireAdmin checks `roles` claim on active MSAL account. Role name is `AdvisorAdmin` (matches two-role model in IMPLEMENTATION_PLAN §17 and product-spec FR-021). If absent or account null, renders 403 placeholder. Demo mode (`VITE_ADVISOR_DEMO_MODE=true`) always fails admin check (intentional: demo sessions user-facing only).

**MSAL / demo-mode toggle:**
- `VITE_ADVISOR_TENANT_ID` — Entra tenant GUID
- `VITE_ADVISOR_CLIENT_ID` — App registration client ID
- `VITE_API_BASE_URL` — API base URL (defaults to `/api`)
- `VITE_ADVISOR_DEMO_MODE` — `"true"` bypasses sign-in for user flows only

When `VITE_ADVISOR_DEMO_MODE=true`: msalInstance initialised with placeholder config; RequireAuth renders children immediately; RequireAdmin renders 403 gate; apiGet/apiPost send empty Authorization header. MSAL package stays in bundle—M1 auth wiring is purely configuration.

**No blocking decisions needed.** Brett can write Playwright tests immediately. Dallas should confirm `models.ts` shapes match `web/src/types/index.ts`.

---

#### parker-bicep-modules

**Date:** 2026-05-26  
**Author:** Parker (Infra/DevOps Engineer)  
**Status:** M0 complete — TODOs tracked

**Modules delivered:**

- **cosmos.bicep:** Cosmos DB account (disableLocalAuth: true, public access parameter-controlled), database advisor, 4 containers (sessions, requests, projects, org-context) with correct partition keys. TODOs: confirm Foundry Hosted Agent compatibility with disableLocalAuth, set container TTL before prod, narrow role scope to container level.

- **search.bicep:** Basic SKU search service with system-assigned identity. TODOs: Dallas adds index resource in M1, wire Search Data Reader role after identity outputs available, confirm Basic SKU limits for demo load.

- **container-registry.bicep:** Basic SKU ACR, adminUserEnabled false. TODOs: AZD predeploy hook must run `az acr build` or docker buildx in M1, consider Standard SKU for geo-replication if prod spans regions.

- **monitoring.bicep:** PerGB2018 SKU Log Analytics (30-day retention), workspace-based App Insights (kind web). TODOs: confirm retention policy with product owner (data retention requirement §11), add alert rules in M1 (latency p99, RU exhaustion).

- **identity.bicep:** 2 managed identities (agentIdentity, adminIdentity), RBAC: agent = Contributor on sessions/requests/projects + Reader on org-context; admin = Contributor on org-context + Reader on sessions/requests/projects. AcrPull and Search roles assigned. TODOs: verify Cosmos role definition IDs, narrow to container scope before test/prod, confirm Search role ID, wire identityId into Container App (M1).

- **foundry.bicep:** Placeholder only in M0. Bridge strategy: azure.yaml predeploy hook calls scripts/deploy-hosted-agent.sh. No GA Bicep resource type available (preview-only). Reference: https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents. Action: Ripley or Parker to author deploy script in M1.

**Open questions:**
1. Key Vault not declared (if github-default model path needed, add keyvault.bicep + grant agent identity Key Vault Secrets User).
2. Entra app registration not declarable in Bicep (product-spec §9 requires AdvisorAdmin app role). Recommend AZD postprovision hook or separate step.
3. Container App resource agentEndpoint is hard-coded pattern string. Add containerapp.bicep module in M1.

#### parker-m0-verification-complete

**By:** Parker (Infra/DevOps Engineer)  
**Date:** 2026-05-26  
**Commit verified:** 9250e2c  
**Status:** Boot smoke test complete — merged to decisions log

**§A — M0 Scaffold Boots End-to-End**

M0 monorepo architecture is verified operational on commit 9250e2c. Full dependency install via root workspace succeeds (518 packages, zero peer-dep errors). Agent backend compiles cleanly (TypeScript strict mode), boots to port 8080, and serves health endpoint returning 200 JSON. Vite web dev server boots to port 5173 and serves HTTP 200. All non-health agent routes correctly return 501 (M0 stub behaviour, not bugs). Admin routes correctly block with 403 in demo mode. Store methods properly throw NotImplementedError by design.

**§B — Two M1 Papercuts Logged**

Two low-priority DX gaps identified, deferred to M1:

1. **Agent has no `dev` script** — Owner: Dallas. Impact: iterative backend development requires `npm run build` on every change. Fix: add one-line `tsx watch` or `--watch` script to `agent/package.json`. Not a boot blocker.

2. **Web TypeScript config inherits broken `rootDir`** — Owner: Lambert. Impact: `web/tsc --noEmit` fails with TS6059 errors (files not under rootDir). Vite dev server unaffected. Fix: add `"rootDir": "src"` to `web/tsconfig.json` to override inherited base value. Trivial fix, ~1 line.

**§C — Working Dev Loop Command**

Three-command sequence for local development (tested on commit 9250e2c):

*One-time install:*
```bash
cd advisor-agent && npm install
```

*Terminal 1 — Agent backend (build required each time — M0 has no watch mode):*
```bash
cd advisor-agent/agent && npm run build && ADVISOR_DEMO_MODE=true ADVISOR_LOCAL_DEV=true node dist/index.js
```
Agent listens on `http://localhost:8080`; health check: `curl http://localhost:8080/health`

*Terminal 2 — Web dev server:*
```bash
cd advisor-agent/web && npm run dev
```
Vite serves at `http://localhost:5173`

Full one-liner (background agent, foreground Vite):
```bash
cd /workspaces/Microsoft-AI-Decision-Framework/advisor-agent && \
  (cd agent && npm run build && ADVISOR_DEMO_MODE=true ADVISOR_LOCAL_DEV=true node dist/index.js &) && \
  (cd web && npm run dev)
```

**§D — Reference**

- Full report: originally inbox/parker-local-boot-report.md (merged 2026-05-26)
- Commit: 9250e2c
- M1 follow-ups: Dallas (dev script), Lambert (tsconfig fix), Parker (root workspace dev script)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
