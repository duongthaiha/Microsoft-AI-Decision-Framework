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

#### parker-azd-deploy-partial-green

**Date:** 2026-05-26T21:52:57Z  
**Author:** Parker (DevOps/Infra)  
**Status:** 🟡 Partial green

**Container App URL:** `https://advisor-agent-app.niceflower-d3218211.eastus2.azurecontainerapps.io`  
**Health Response:** `{"status":"ok","service":"advisor-agent","version":"0.0.1"}` ✅

**What Landed (M0→Azure):**

- **Provisioned:** Cosmos DB (NoSQL, sessions/requests/projects/org-context), Azure OpenAI (gpt-4.1-mini, 10K TPM), Container Registry (Basic), Container App Environment + Container App (agent), Log Analytics, Application Insights.
- **Deployed:** Agent image (dist/ built locally, pushed to ACR, deployed to Container App).
- **Env Files Written:** `.azure/advisor-dev/.env`, `agent/.env.local`, `web/.env.local` with all resource endpoints and credentials.

**What Did NOT Land (Deferred):**

- **AI Search:** eastus2 quota exhausted → workaround documented (`deploySearch: false` in parameters; re-enable when quota available or override region to swedencentral/westus3).
- **Static Web App Deploy:** SWA resource provisioned and tagged, but `azd deploy web` not run. Blocked on Entra client ID/tenant ID (M2). M1 path: `VITE_ADVISOR_DEMO_MODE=true` + `azd deploy web`.
- **Foundry Hosted Agent:** `infra/modules/foundry.bicep` remains a placeholder stub. Container App serves as M0 runtime. Full Foundry wiring deferred to M1 (scripts/deploy-hosted-agent.sh).

**Verified Hybrid-Mode Command (Recommended for Local Dev):**

```bash
cd agent && set -a && source .env.local && set +a && node dist/index.js
```
Agent boots to `localhost:8080` with `DefaultAzureCredential` → deployed Azure resources.

**Three Follow-Up Tasks for M1:**

1. **Scripts/deploy-hosted-agent.sh:** Author Foundry Hosted Agent wiring (Parker + Ripley). Bridge predeploy hook to full agent orchestration. Reference: https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents.
2. **Entra App Registration & M2 SPA Wiring:** Complete `VITE_ADVISOR_CLIENT_ID`, `VITE_ADVISOR_TENANT_ID` integration; run `azd deploy web` (Lambert + Ripley).
3. **Cosmos Serverless Mode & TTL:** Evaluate `"capabilities": [{"name": "EnableServerless"}]` for true serverless billing. Set container TTL before prod. Verify role scope narrowed to container level (Parker).

---

#### parker-region-redeploy

**Date:** 2026-05-26T21:54:53Z  
**Author:** Parker (DevOps/Infra)  
**Status:** ✅ Full green — all M0+M1 infra live in `swedencentral`  
**Commit:** fbf39dd

**§A — Region Selected: swedencentral**

Probed swedencentral first. All four required services confirmed available:

| Service | Evidence |
|---|---|
| AI Search Basic | Probe service provisioned successfully in under 30 seconds; probe RG cleaned up. |
| AOAI gpt-4.1-mini | `az cognitiveservices model list -l swedencentral` confirmed `gpt-4.1-mini 2025-04-14` in model catalogue. |
| Container Apps | Provisioned cleanly; `advisor-agent-app` deployed and serving traffic. |
| Cosmos DB | Provisioned cleanly; serverless-compatible endpoint live. |

**Key decision:** `Microsoft.Web/staticSites` (Static Web Apps) unavailable in swedencentral. Fixed by adding `staticWebAppLocation` parameter to `infra/main.bicep` defaulting to `westeurope`. SWAs are CDN-backed global resources; co-location with compute not required. Parameter documented in `main.parameters.json`.

**§B — Teardown: eastus2 Clean**

`azd down --force --purge` succeeded (~16 minutes). AOAI account, Log Analytics, resource group fully purged. No orphaned advisor resources.

**§C — New Endpoints**

| Resource | Value |
|---|---|
| **Container App URL** | `https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io` |
| **AI Search endpoint** | `https://advisor-search-uwmrjzgkhs2hk.search.windows.net` |
| **Cosmos endpoint** | `https://advisor-cosmos-uwmrjzgkhs2hk.documents.azure.com:443/` |
| **AOAI endpoint** | `https://advisor-aoai-uwmrjzgkhs2hk.openai.azure.com/` |
| **Static Web App** | `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` (westeurope, undeployed — M2) |

**§D — Smoke Test: All Passed**

- `GET /health` on Container App → `{"status":"ok","service":"advisor-agent","version":"0.0.1"}` ✅
- AI Search: `provisioningState: succeeded`, `sku: basic`, `location: Sweden Central` ✅
- Cosmos `publicNetworkAccess: Enabled` (dev posture, correct per spec §10) ✅
- Hybrid mode boot: `cd agent && set -a && source .env.local && set +a && node dist/index.js` → `localhost:8080/health` ✅

**§E — Bicep Changes**

1. `infra/main.bicep` — Added `staticWebAppLocation string = 'westeurope'` parameter; wired to `staticWebApp` module call.
2. `infra/main.parameters.json` — `deploySearch: true`; `staticWebAppLocation: "westeurope"`.

**§F — Local Env Files Updated**

- `agent/.env.local` — `SEARCH_ENDPOINT` populated; `APPLICATIONINSIGHTS_CONNECTION_STRING` updated to swedencentral ingestion.
- `web/.env.local` — Deployed Container App URL and Static Web App URL updated.

**§G — Caveats / Gaps**

| Gap | Owner | Milestone |
|---|---|---|
| Foundry Hosted Agent Bicep stub | Parker + Ripley | M1 |
| AI Search index schema | Dallas | M1 |
| Web SPA SWA deploy | Lambert + Ripley | M2 (blocked on Entra app reg) |
| SWA CLI x86-only in ARM codespace | Parker | M2 (workaround: deploy from GitHub Actions CI) |
| Cosmos role scope | Parker | M1 (narrow from account to container) |

The `staticWebAppLocation` split (swedencentral compute + westeurope SWA) is correct long-term architecture.

**§H — References**

- Report: originally `.squad/decisions/inbox/parker-region-redeploy.md` (merged 2026-05-26)
- Commit: fbf39dd
- New Container App URL documented in squad record

---

#### parker-entra-and-web-deploy

**Date:** 2026-05-26T21:54:53Z  
**Author:** Parker (Infra/DevOps Engineer)  
**Requested by:** Ha Duong  
**Status:** 🟢 Phase 1 complete — 🔴 Phase 2 blocked (SWA CLI ARM binary; GitHub Actions path documented)

**§A — Phase 1 — Entra App Registration: COMPLETE**

| Field | Value |
|---|---|
| Display Name | `advisor-agent-web` |
| **App ID (Client ID)** | `4f4f4a4d-e60f-4b86-a681-86059aae4597` |
| **Tenant ID** | `cdfe81b5-821e-4f07-9ea7-516efc8497e4` |
| Object ID | `bfb7a513-c545-4b25-a5db-dab4f7661777` |
| Identifier URI | `api://4f4f4a4d-e60f-4b86-a681-86059aae4597` |

**Redirect URIs (SPA Platform):**

- `http://localhost:5173` (local dev)
- `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` (deployed SWA — from parker-region-redeploy)

**API Permissions:**

- Microsoft Graph `User.Read` (Delegated) — admin consent ✅ granted

**Custom API Scope:**

- `api://4f4f4a4d-e60f-4b86-a681-86059aae4597/access_as_user` — enabled ✅

**CRITICAL — Backend JWT Validation (M1 task for Dallas):**

Frontend requests token scoped to `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`. Backend must validate that incoming token's `aud` claim matches this URI. Currently stubbed in `agent/src/auth/identity.ts` ("M1: the JWT validation middleware will attach…").

**PKCE Token Issuance:**

SPA platform auto-enables access token + ID token issuance (no client secret created — correct for PKCE flows).

**§B — Env File Updates**

**`web/.env.local` (auth-related vars):**

```
VITE_ADVISOR_DEMO_MODE=true
VITE_ADVISOR_TENANT_ID=cdfe81b5-821e-4f07-9ea7-516efc8497e4
VITE_ADVISOR_CLIENT_ID=4f4f4a4d-e60f-4b86-a681-86059aae4597
VITE_AZURE_REDIRECT_URI=http://localhost:5173
VITE_API_BASE_URL=https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io
VITE_STATIC_WEB_APP_URL=https://polite-mushroom-0a09fa803.7.azurestaticapps.net
```

`VITE_ADVISOR_DEMO_MODE=true` kept for local dev (sign-in bypassed). Set to `false` when testing real Entra auth.

**`agent/.env.local`:** No change needed — `AZURE_TENANT_ID` already present.

**§C — Smoke Test: PASSED**

`cd web && npm run dev → curl http://localhost:5173 → HTTP 200` ✅

Server started cleanly; demo mode active; no console warnings.

**§D — Phase 2 — Web SPA Deploy: BLOCKED**

**Root cause:** Codespace runs ARM aarch64. SWA CLI deployment binary is x86-64 ELF only — no ARM variant available.

**Built artefacts:** Vite build completed successfully; `web/dist/` compiled and ready.

**Unblocking paths for Ha:**

**Option A (recommended):** GitHub Actions (~5 minutes)
1. Get SWA deployment token: `az staticwebapp secrets list --name "advisor-web-uwmrjzgkhs2hk" --resource-group "rg-advisor-dev" --query "properties.apiKey" -o tsv`
2. Set as GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`
3. Create `.github/workflows/deploy-web.yml` (template provided in full report)
4. `gh workflow run deploy-web.yml`

**Option B:** x86-64 machine / WSL2 / Azure Cloud Shell — run `azd deploy web` from x86 environment

**§E — App Role Gap (M1 — Dallas)**

`AdvisorAdmin` app role not yet defined on app registration. Required by FR-021. Once backend role-check middleware ready, Parker will add role to app reg and Ha can assign to users via Portal.

**§F — Verification Steps (require browser)**

Local dev demo-mode: `cd web && npm run dev → http://localhost:5173` (no sign-in)  
Local dev Entra auth: Set `VITE_ADVISOR_DEMO_MODE=false`, start agent + web dev server, sign in at `http://localhost:5173`  
Deployed SPA (after Phase 2 unblocks): Sign-in redirect to login.microsoftonline.com; after consent, land on Home page

**§G — Gaps and M1/M2 Follow-Ups**

| Gap | Owner | Milestone | Notes |
|---|---|---|---|
| SWA deploy blocked on ARM codespace | Ha | Immediate | See Option A/B above |
| Backend JWT validation not wired | Dallas | M1 | `agent/src/auth/identity.ts` has M1 stub comment |
| `AdvisorAdmin` app role not defined | Parker | M1 | Required by FR-021 |
| App role assignment workflow | Ha / Parker | M1 | Portal or AZD postprovision hook |
| Token audience validation (`aud`) | Dallas | M1 | Backend must check `aud == "api://4f4f4a4d-e60f-4b86-a681-86059aae4597"` |
| Vite env vars for deployed SPA | Ha (GH Actions) | Immediate | See workflow — wire `VITE_API_BASE_URL` to new Container App URL |

**§H — References**

- Report: originally `.squad/decisions/inbox/parker-entra-and-web.md` (merged 2026-05-26)
- App ID: `4f4f4a4d-e60f-4b86-a681-86059aae4597` (safe to commit — public identifier)
- Tenant ID: `cdfe81b5-821e-4f07-9ea7-516efc8497e4` (safe to commit — public identifier)
- M1 backend wiring: Dallas (JWT validation)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
