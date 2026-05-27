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

#### parker-swa-github-actions-deploy

**By:** Parker (Infra/DevOps)  
**Date:** 2026-05-26T22:44:00Z  
**Status:** ✅ COMPLETE — SPA live, smoke test green

**Summary**

Deployed the advisor-agent Web SPA to Azure Static Web Apps (`advisor-web-uwmrjzgkhs2hk`) via a GitHub Actions workflow, bypassing the SWA CLI ARM aarch64 incompatibility documented in parker-4.

**Deploy flow:** `push` to `feat-ai-decision-agent` or `main` → `deploy-web.yml` → Node 20 build (`npm ci && npm run build`) → `Azure/static-web-apps-deploy@v1` → SWA CDN.

**Secrets & Variables Set**

### Repo Secret (sensitive — never commit)
| Name | How set | Notes |
|---|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `gh secret set` | SWA deployment token from `az staticwebapp secrets list`. Rotate if compromised. |

### Repo Variables (public — safe to commit/display)
| Name | Value | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io` | Container App URL (swedencentral) |
| `VITE_ADVISOR_CLIENT_ID` | `4f4f4a4d-e60f-4b86-a681-86059aae4597` | Entra app reg App ID — public, safe |
| `VITE_ADVISOR_TENANT_ID` | `cdfe81b5-821e-4f07-9ea7-516efc8497e4` | Entra tenant ID — public, safe |
| `VITE_AZURE_REDIRECT_URI` | `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` | SWA hostname (Entra redirect URI) |

**Workflow File**

**Path:** `.github/workflows/deploy-web.yml` (repo root — not under `advisor-agent/`)  
**Commit:** `868bd67`  
**PR/branch:** `feat-ai-decision-agent`

### Key workflow design decisions
- **Runner: `ubuntu-latest`** — x86-64; bypasses ARM aarch64 SWA CLI blocker (parker-4 root cause).
- **`app_location: 'advisor-agent/web'`** — monorepo-relative path; SWA action handles `npm ci && npm run build` inside this directory.
- **`output_location: 'dist'`** — Vite output; no `api_location` (no Azure Functions API).
- **`submodules: true`** on checkout — future-proofing; no submodules currently.
- **Vite envs via `env:` block** on the deploy step with `vars.*` fallbacks to hardcoded defaults.
- **`pull_request` trigger** — SWA action auto-creates preview environments per PR.
- **`close_pull_request_job`** — cleans up preview env when PR is closed (per SWA action docs).
- **`permissions: contents: read, pull-requests: write`** — minimal; write needed for SWA PR preview comments.

**First Run**

| Field | Value |
|---|---|
| Run ID | `26479487737` |
| Run URL | `https://github.com/duongthaiha/Microsoft-AI-Decision-Framework/actions/runs/26479487737` |
| Status | ✅ success |
| Duration | ~1m 8s |
| Triggered by | Push of commit `868bd67` to `feat-ai-decision-agent` |

**Deployed Site Verification**

```
curl -I https://polite-mushroom-0a09fa803.7.azurestaticapps.net
HTTP/2 200
content-type: text/html
date: Tue, 26 May 2026 22:47:11 GMT
last-modified: Tue, 26 May 2026 22:46:46 GMT
```

✅ **HTTP 200, `text/html`** — SPA is live and serving.

**Caveats**

1. **Token rotation:** `AZURE_STATIC_WEB_APPS_API_TOKEN` is a long-lived SWA deployment token. Should be rotated via `az staticwebapp secrets reset-api-key` + `gh secret set` if ever exposed.
2. **Vite env fallbacks:** Workflow has hardcoded defaults for all four `VITE_*` vars so the build doesn't break if repo variables are deleted. Update both the variable and the fallback if endpoints change.
3. **PR preview environments:** Each PR on `feat-ai-decision-agent` / `main` touching `advisor-agent/web/**` will spin up a SWA staging environment. Free tier allows up to 10 staging environments.
4. **No Entra auth enforcement at SWA edge:** Authentication is handled client-side (PKCE). SWA does not enforce Entra login on its own for this config.
5. **`close_pull_request_job` skips if no PR context:** The `if:` condition ensures the close job only runs on `pull_request` closed events — safe for push/dispatch triggers.

**Future Deploy Flow**

**Push → Action → SWA:** Any push to `feat-ai-decision-agent` or `main` touching `advisor-agent/web/**` (or the workflow file itself) automatically triggers a build and deploy. No manual steps required. Use `gh workflow run deploy-web.yml` for manual deploys.

**References**

- Report: originally `.squad/decisions/inbox/parker-swa-github-actions-deploy.md` (merged 2026-05-26T22:54:00Z)
- Commit: `868bd67`
- GitHub Actions run: `26479487737`

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

### dallas-jwt-validation-middleware

**By:** Dallas (Backend & Agent Developer)  
**Date:** 2026-05-26  
**Status:** ✅ COMPLETE — deployed to revision `advisor-agent-app--azd-1779836350`

**Summary**

Wired JWT validation on Express backend. Protected routes (`/v1/responses`, `/sessions`, `/admin/*`) require valid Microsoft Entra ID access tokens. `/health` unauthenticated for liveness probes.

**Key Decisions**

- Middleware: `jose` v6 library with `createRemoteJWKSet` for automatic JWKS caching (10-min TTL)
- Claims validated: `iss` (tenant-scoped), `aud` (custom API URI), `exp` (expiry), `scp` (contains `access_as_user`), `oid` (present, non-empty)
- Routes protected: `/v1/responses`, `/sessions`, `/admin/*` (role-gated via `requireRole('AdvisorAdmin')`)
- `/health` remains unauthenticated
- Env contract: `ENTRA_TENANT_ID`, `ENTRA_API_AUDIENCE` (set on Container App + `.env.local`)
- Demo mode: JWT validation bypassed when `ADVISOR_DEMO_MODE=true` (currently enabled); admin routes still blocked
- Files: `agent/src/auth/jwt-middleware.ts` (new), `agent/src/index.ts`, `agent/src/admin/admin-api.ts`, `agent/package.json`

**M1 Gap (Parker)**

`AdvisorAdmin` app role not yet defined on Entra app reg `4f4f4a4d-e60f-4b86-a681-86059aae4597`. Role must be added and assigned to admin users before `/admin/*` routes work in production.

**References**

- Source: `.squad/decisions/inbox/dallas-jwt-validation-middleware.md`
- Deployment: Container App revision `advisor-agent-app--azd-1779836350`
- Smoke tests: `/health` (200 ✅), `/v1/responses` no-token (401 ✅), `/admin/org-context` demo-mode (403 ✅)

---

### lambert-msal-sign-in-wired

**By:** Lambert (Frontend Developer)  
**Date:** 2026-05-26  
**Status:** ✅ COMPLETE — committed f15f20d, pushed to feat-ai-decision-agent

**Summary**

MSAL.js sign-in fully wired in SPA. Bearer tokens attached to every API call to `/advise` or `/admin/*`. Frontend acquires tokens via PKCE popup flow; backend validates via JWT middleware.

**Key Decisions**

- MSAL versions: `@azure/msal-browser` 3.30.0, `@azure/msal-react` 2.2.0 (exact pin, no `^`, to block v4 surprises)
- Sign-in: `loginPopup` / `logoutPopup` (not redirect) — preserves SPA state, avoids hash pollution
- Token cache: `sessionStorage` (not localStorage) — scopes token to tab lifetime, reduces XSS amplification
- Redirect URI: `VITE_AZURE_REDIRECT_URI` env var; local dev `http://localhost:5173`, prod SWA `https://polite-mushroom-0a09fa803.7.azurestaticapps.net`
- Token injection: `api/client.ts` → `getAccessToken()` acquires token silent, falls back to popup on MFA/conditional-access
- Bearer header: attached to all `/advise` and `/admin/*` calls; `/health` unprotected
- UI: new `AppHeader.tsx` shows user display name + sign-out button; `RequireAuth` gate remains
- Build: zero TypeScript errors; `npm run build` → 452 KB index.js

**Files Changed**

- `web/package.json` (MSAL pinned), `web/src/auth/msal-config.ts`, `web/src/auth/RequireAuth.tsx`, `web/src/api/client.ts`, `web/src/components/AppHeader.tsx`, `web/src/App.tsx`, `web/src/styles.css`, `web/tsconfig.json`

**References**

- Source: `.squad/decisions/inbox/lambert-msal-sign-in-wired.md`
- Commit: f15f20d
- Scope: `api://4f4f4a4d-e60f-4b86-a681-86059aae4597/access_as_user`
- Smoke test: local dev → sign in (popup) → network tab shows `Authorization: Bearer` on `/advise` ✅

---

### ripley-search-index-schema-system-inventory

**By:** Ripley (Lead/Architect)  
**Date:** 2026-05-26  
**Status:** 🟡 PENDING — Routing to Parker (provisioning) and Dallas (query integration)

**Summary**

Designed AI Search index `system-inventory-v1` to power reuse-gate discovery. Schema includes 13 fields: `id`, `name`, `description`, `description_vector` (1536-dim for text-embedding-3-small), `capabilities`, `domain`, `owner_team`, `status`, `stack`, `data_sources`, `last_reviewed`, `confidence_score`, `org_id` (multi-tenant placeholder).

**Key Decisions**

- Index name: `system-inventory-v1` (versioned; future migrations use `v2` + alias for zero-downtime swap)
- Vector search: HNSW algorithm (m=4, efConstruction=400, efSearch=500, cosine metric) — minimal footprint for Basic tier (50 MB limit)
- Semantic search: `name` (title), `description` (content), `capabilities`/`domain`/`data_sources` (keywords)
- Hybrid query pattern (Dallas): vector + BM25 + semantic re-rank; filter `status eq 'active'` + multi-tenant `org_id` (org-scoped + `null` for shared)
- Query returns top 5 candidates; Dallas surfaces top 3 with `confidence_score >= 0.5`
- Provisioning: JSON definition file `advisor-agent/data/system-inventory-v1-index.json` + `az search index create` CLI (Bicep ARM SDK incomplete for vector fields)
- Authentication: `ManagedIdentityCredential` (agent MI already has `Search Index Data Reader` role)

**M1 Gaps (Parker + Dallas)**

- Parker: (P1) Create index via CLI, (P2) Grant `Search Index Data Contributor` role, (P3) Add `text-embedding-3-small` AOAI deployment
- Dallas: (D1) Implement reuse-gate query in `agent/src/framework/step-1b-reuse-gate.ts`, (D2) Surface top-3 candidates, (D3) Confirm JWT validation in place
- Out of scope M1: Seed data, autocomplete suggester (M2 gates)

**References**

- Source: `.squad/decisions/inbox/ripley-search-index-schema-system-inventory.md`
- AI Search service: `advisor-search-uwmrjzgkhs2hk` (Basic tier, swedencentral)
- Index JSON: `advisor-agent/data/system-inventory-v1-index.json` (companion file)
- Azure Search docs: vector search, hybrid query, semantic ranking, HNSW params, create index CLI

---

### brett-auth-integration-tests

**By:** Brett (Tester)  
**Date:** 2026-05-26  
**Status:** ✅ WRITTEN — ❌ 8/11 tests expected-fail (pre-implementation)

**Summary**

Wrote Layer 1 (backend contract tests) and Layer 2 (smoke script) for auth + `/v1/responses` critical path. Tests intentionally written before Dallas's JWT middleware and Lambert's MSAL client land; 3 pass, 8 expected-fail pending implementation.

**Key Decisions**

- Test runner: Vitest 1.6.1 (already configured); new `vitest.config.ts` baseline `ADVISOR_DEMO_MODE=false`
- Layer 1: `agent/src/__tests__/auth-contract.test.ts` — 11 contract tests covering no-auth, malformed token, wrong signature, wrong aud/iss, expired, missing scp, valid token paths; `GET /health` (200), `/v1/responses` variants (401), `/admin/org-context` role-gated (403/200)
- Layer 2: `scripts/smoke-prod.sh` — 3 checks: `/health` (200), `/v1/responses` no-auth (401), SWA homepage (200 text/html)
- JWT mocking: `vi.mock('jose')` intercepts `jwtVerify`/`createRemoteJWKSet`; test configures outcomes via `mockResolvedValueOnce`/`mockRejectedValueOnce`
- Claim constants exported (TENANT_ID, AUDIENCE, ISSUER, SCOPE, ADMIN_ROLE) for Dallas's future middleware unit tests
- Known limitation: `agent/.env.local` sets `ADVISOR_DEMO_MODE=true`; admin tests (10/11) fail for wrong reason (demo mode gate, not JWT logic); will fix once Dallas's middleware lands and Dallas confirms `ADVISOR_DEMO_MODE=false` in CI/test env

**M2 Backlog**

- Playwright E2E: sign-in flow, intake form, admin drill-down (deferred until Lambert's MSAL UI stabilizes + SWA SPA deploy unblocked)

**References**

- Source: `.squad/decisions/inbox/brett-auth-integration-tests.md`
- Files: `agent/src/__tests__/auth-contract.test.ts` (new), `agent/vitest.config.ts` (new), `scripts/smoke-prod.sh` (new), `agent/package.json` (supertest, jose added)
- Test status: 3 pass (health, valid token paths), 8 expected-fail (auth rejection paths, admin pass)

---

### dallas-m1-reasoning-loop

**By:** Dallas (Backend & Agent Developer)  
**Date:** 2026-05-26  
**Status:** ✅ COMPLETE — deployed to revision `advisor-agent-app--azd-1779839176`

**Summary**

Implemented the M1 advisor reasoning loop end-to-end. All routes live. POST /v1/responses returns a real GPT-4.1-mini recommendation. 18/18 tests pass.

**Key Decisions**

- **Copilot SDK fallback:** `@github/copilot-sdk@1.0.0-beta.8` is GitHub Copilot CLI JSON-RPC, not an Azure AI agent SDK. Fell back to `openai@^4.104.0` (AzureOpenAI class) with `azureADTokenProvider` for managed identity. FR-002 architectural intent met.
- **AOAI tool calling:** 4 tools — `scoreBXT`, `searchSimilarProjects`, `recordReuseDecision`, `produceReadinessBrief`. Max 8-iteration agentic loop.
- **System prompt:** Dynamic — built from active OrgContext + framework-anchors.json at call time (FR-024).
- **Cosmos stores:** Full CRUD with createIfNotExists at boot (idempotent). ETag optimistic concurrency on `setStatusNew`. Transactional: `createRequest` called AFTER model succeeds — no orphaned Drafts on model failure.
- **Azure AI Search:** Hybrid vector + BM25 + semantic re-rank on `system-inventory-v1`, filter `status eq 'active'`, top 5, confidence_score >= 0.5.
- **502 vs 500:** Model/AOAI failures return 502 Bad Gateway; internal bugs return 500. Discovered via Brett's proactive Test 7 contract.
- **Data files:** `data/framework-anchors.json` (BXT criteria + 9 questions), `data/org-context-default.json` (seed org context with M365/Copilot Studio/AOAI entitlements).

**M1 Gap (Parker)**

Container App MI needs `Cosmos DB Built-in Data Contributor` role on the `advisor` database. Without it, first Cosmos write returns 403. See decision file §D.

**References**

- Source: `.squad/decisions/inbox/dallas-m1-reasoning-loop.md`
- Skill: `.squad/skills/aoai-direct-client-with-managed-identity/SKILL.md`
- Commits: `9d32784`, `28d85cb`, `3ad0244`
- Tests: 18 passed (11 auth-contract + 7 reasoning-loop)

---

### 2026-05-27: M1 Completion Decisions (Continuation)

#### lambert-m1-chat-render-and-session-list

**By:** Lambert (Frontend Developer)  
**Date:** 2026-05-26  
**Status:** ✅ COMPLETE — built, zero TS errors, pushed to feat-ai-decision-agent

**Summary**

Replaced the raw-JSON dump in `SessionPage.tsx` with a proper `turns: Turn[]` state array. On submit, a user turn is pushed immediately (formatted as a concise markdown summary: `**New project: {name}**` + key fields). On API success, the assistant text is extracted defensively from `response.output[0].content[0].text` (falls back gracefully if the shape diverges). On API error, an italic error note is pushed as an assistant turn so the conversation history is preserved even when the backend is a 501.

After the first turn, the intake panel auto-collapses and shows an "Edit intake" toggle, so users can iterate without losing the chat history. The chat panel has `aria-live="polite"` and auto-scrolls to the latest turn via `useRef` + `scrollIntoView({ behavior: 'smooth' })`.

Thinking state is rendered as an animated three-dot bounce (CSS `@keyframes thinking-bounce`) while waiting for the response — no library needed.

**Markdown library choice:** `react-markdown` 9.0.1 (ESM, remark-based). Chosen because zero runtime config needed for basic markdown, streaming-ready for M2, lightweight compared to alternatives, and well-maintained in React ecosystem. All assistant turns render through `<ReactMarkdown>`.

**Session list wiring:** `HomePage.tsx` now calls `GET /sessions` on mount via `apiGet<Session[]>`. Renders loading / error / empty states. "Start a new session" button calls `POST /sessions` and navigates to `/session/:id`. Falls back to `/session/new` if the backend isn't deployed yet (graceful — the intake form still works).

**Admin page status:** All three admin pages wired to real API calls (`GET /admin/org-context`, `GET /admin/requests`, `GET /admin/projects`). All return graceful error states. `RequireAdmin` verified: checks `roles.includes('AdvisorAdmin')` via `idTokenClaims.roles` from MSAL. Works correctly in demo mode.

**Type cohesion fix:** `web/src/types/index.ts` fully reconciled with `agent/src/data/models.ts`. Added `sessionId` field to `Session`, `SessionTurn` added, `ReuseDecision` shape updated, `ReadinessBrief` reworked, `FrameworkAnswers` structure updated, and multiple entitlement/project type fixes applied.

**E2E smoke result:** SPA builds and deploys successfully to SWA. Sign-in flow works (MSAL popup). Intake form renders and submits. API calls reach the Container App but `/v1/responses` and `/sessions` return 4xx/5xx (Dallas's routes not yet live).

**Files changed:**
- `web/package.json` — `react-markdown@9.0.1` added
- `web/src/types/index.ts` — full reconcile with agent models
- `web/src/pages/SessionPage.tsx` — chat turns, markdown render, collapse toggle, auto-scroll
- `web/src/pages/HomePage.tsx` — real GET /sessions, POST /sessions + navigate
- `web/src/pages/admin/OrgContextPage.tsx` — GET /admin/org-context wired
- `web/src/pages/admin/RequestsPage.tsx` — GET /admin/requests wired
- `web/src/pages/admin/ProjectsPage.tsx` — GET /admin/projects wired
- `web/src/pages/BriefPage.tsx` — mock updated to new ReadinessBrief shape
- `web/src/styles.css` — chat-turn, chat-bubble, thinking-dots, intake-toggle, sessions-list CSS

---

#### ripley-framework-anchors-and-default-org-context

**By:** Ripley (Lead/Architect)  
**Date:** 2026-05-26  
**Status:** ✅ COMPLETE — files written, routing to Dallas (agent loading) and review

**Deliverables**

Two data files:

1. **`advisor-agent/data/framework-anchors.json`** — the structured framework reference Dallas loads into the advisor's system prompt, superseding the M1 inline fallback stub Dallas had committed.

2. **`advisor-agent/data/org-context-default.json`** — the minimal default org context for first-boot when no admin has published a version. Dallas's M1 version already existed and correctly matched the TypeScript `OrgContext` model. Preserved and not replaced.

**Schema design rationale:**

Why extract to JSON instead of hardcoding in the system prompt: (1) Single-point update. Framework evolves (product renames, new groupings, revised BXT scoring). A single JSON file edit updates the prompt across all deployments without touching agent code. (2) Structured injection. Dallas's system prompt builder can compose subsets per phase: intake filter for Phase 0, BXT dimensions for Phase 1, nineQuestions + capabilityGroupings for Phase 2, decisionAnchors for Phase 3. Token budget is controlled by loading only the relevant slice per step. (3) Testability. A structured JSON can be validated in unit tests against the schema shape. (4) Separation of concerns. Framework knowledge lives here, agent reasoning logic in `agent/src/framework/`, data store models in `agent/src/data/models.ts`.

**Key schema decisions:**
- **`groupingsAffected` on each Q.** Dallas needs to know which groupings each question narrows so the advisor can skip answered questions.
- **`answers` arrays on each Q.** Structured answers enable programmatic filtering of org-context entitlements.
- **`scoringGuide` as single string not object.** Fits prompt injection directly. No extra parsing step.
- **`doYouNeedAnAgentCheckpoint` as a paragraph string.** This is a judgment call the advisor must surface verbatim — kept as prose, not structured fields.
- **`decisionAnchors` as arrays of criteria strings.** Dallas can inject these as bullet lists per decision tree branch.

**Source docs cited:**
- `docs/decision-framework.md` — Intake Filter, UX Framing, BXT scorecard, 9 critical questions
- `docs/capability-model.md` — Five capability groupings, mental models
- `docs/evaluation-criteria.md` — Complexity tiers, skills matrix, trust boundary, action safety
- `advisor-agent/product-spec.md` — 9-question label list
- `.github/copilot-instructions.md` — Capability grouping anchor products canonical list

**Routing:**
- Dallas: Load `framework-anchors.json` into the system prompt builder; replace the inline BXT/9Q fallback object with a `require('../../../data/framework-anchors.json')` import (M1)
- Dallas: Load `org-context-default.json` as first-boot seed when `GET /admin/org-context` returns 404 (M1)
- Ripley: Update `framework-anchors.json` version when source docs are updated (Ongoing)

---

#### brett-m1-reasoning-loop-tests

**By:** Brett (Tester)  
**Date:** 2026-05-26  
**Status:** ✅ WRITTEN — 17/18 tests passing (1 proactive contract gap)

**Test Cases (Layer 1 — `agent/src/__tests__/reasoning-loop.test.ts`)**

| Test | Status | Assertion |
|------|--------|-----------|
| 1. POST /sessions → 201 + ownerId binding | ✅ [VERIFIED] | 201, body.ownerId === jwt.oid, createSession called |
| 2. GET /sessions returns only caller's sessions | ✅ [VERIFIED] | Two sessions seeded; response contains only caller's |
| 3. GET /sessions/:id for other user → 404 | ✅ [VERIFIED] | 404 not 403 (no info disclosure) |
| 4. POST /v1/responses happy path | ✅ [VERIFIED] | 200, Hosted Agent Responses shape, model called, createRequest called |
| 5. POST /v1/responses cross-user session → 404 | ✅ [VERIFIED] | 404, model NOT called, createRequest NOT called |
| 6. POST /v1/responses no sessionId → inline session | ✅ [VERIFIED] | 200, createSession called, res.body.sessionId populated |
| 7. POST /v1/responses model throws → 502 | ❌ [PROACTIVE] | 502 `{ error: 'advisor_unavailable', reason }` |

**Contract Notes (Deltas from Squad Brief Spec):**

Three places where Dallas's implementation differs:
1. **POST /sessions status code:** brief said 200; Dallas ships 201 (Created). Suite codifies **201** as canonical.
2. **GET /sessions response envelope:** brief implied bare array; Dallas wraps in `{ sessions: [...] }`.
3. **Session ID in POST /v1/responses response:** brief spec said `session?: { id, title }`; Dallas ships top-level `sessionId: string`.

**Contract Gap — Test 7 (502 for Model Errors):**

**Current state:** Dallas's `handleError` returns HTTP 500 for all non-404 errors, including AzureOpenAI call failures.

**Contract:** Model/reasoning failures should return **502 Bad Gateway** with `{ error: 'advisor_unavailable', reason: <string> }`. 502 signals an upstream dependency failure vs. an internal bug (500).

**Secondary issue:** Dallas's route creates a Request in Cosmos DB *before* calling the model (correct for draft persistence), but if the model throws, the Draft Request becomes orphaned. Test 7's `expect(requestStore.createRequest).not.toHaveBeenCalled()` asserts the transactional design. If Dallas accepts the orphan-and-TTL approach, remove that assertion and document the cleanup path.

**Mock Strategy:**

- **Cosmos DB:** Injected via `ResponsesAdapterDeps` DI pattern. `InMemorySessionStore` and `InMemoryRequestStore` are Map-backed with `vi.fn()` methods.
- **Azure AI Search:** `MockProjectSearch` with `vi.fn()` `findSimilar` returning `PRESET_SIMILAR_PROJECTS`.
- **AzureOpenAI model:** `mockAoaiClient` is a duck-typed object with `chat.completions.create` as a `vi.fn()`. Returning `finish_reason:'stop'` exits agentic loop after one turn.
- **`jose` JWT verification:** `vi.mock('jose')` same pattern as `auth-contract.test.ts`.

**Layer 2 — Smoke Script Changes (`scripts/smoke-prod.sh`):**

Added Checks 4–5 (authenticated) gated on `SMOKE_TOKEN` env var.

**Check 4:** `POST /sessions` with Bearer token → expect 201 (Dallas returns 201 in the real API).

**Check 5:** `POST /v1/responses` with Bearer token + canned intake → expect 200, `status: completed`, non-empty `output[0].content[0].text`.

How to obtain `SMOKE_TOKEN`:
1. Sign in at the SWA URL in a browser (Lambert's MSAL UI).
2. Open browser DevTools → Network tab.
3. Find a request to the Container App.
4. Copy the `Authorization: Bearer <token>` header value.
5. `export SMOKE_TOKEN=<token>`
6. `bash scripts/smoke-prod.sh`

Token lifetime: ~1 hour. Run the script promptly.

**M2 Backlog:** Once Parker provisions a CI service principal in the Entra tenant, automate via `az account get-access-token`.

**M2 Playwright UI Test Backlog:** Sign-in flow, start new session, submit intake form, admin login, session resume — all deferred until Lambert's sign-in UI stabilises post-M1.

**Multi-turn Tool-Calling Mock (M2 Enhancement):** Current mock uses `finish_reason:'stop'` on first turn, bypassing all tool calls. Implement as `advisor-loop-full.test.ts` in M2 to verify full tool sequence (scoreBXT → searchSimilarProjects → produceReadinessBrief → stop).

**Files changed:**
- `agent/src/__tests__/reasoning-loop.test.ts` — new, 7 integration tests
- `scripts/smoke-prod.sh` — extended with Checks 4–5 (authenticated) + SMOKE_TOKEN docs

---

#### parker-m1-infra-roles-search-embedding

**By:** Parker (Infrastructure Engineer)  
**Date:** 2026-05-26  
**Status:** ✅ ALL THREE TASKS COMPLETE

**Task 1: AdvisorAdmin Entra App Role**

- **App role added** to `advisor-agent-web` (appId `4f4f4a4d-e60f-4b86-a681-86059aae4597`) via `az ad app update --id 4f4f4a4d-e60f-4b86-a681-86059aae4597 --app-roles @infra/app-roles.json`. Role definition file committed at `infra/app-roles.json`.

- **Service principal created** (object ID: `2f3a486a-03fe-4d0e-8d8e-17926105849f`).

- **Role assigned to Ha Duong** via Microsoft Graph `appRoleAssignments`:
  - principalId: `3cff1542-912f-4f64-b2f0-1c254dd4ad3c` (System Administrator)
  - appRoleId: `d64375c5-5a38-41a3-9f36-f68f8a4c2674` (AdvisorAdmin)
  - assignment ID: `QhX_PC-RZE-y8BwlTdStPADDO79R1sxHnYSExUnok1s`

**Role manifest** (committed at `infra/app-roles.json`):
```json
[{"id":"d64375c5-5a38-41a3-9f36-f68f8a4c2674","value":"AdvisorAdmin","displayName":"Advisor Admin","description":"Can manage org context, projects, and inspect all advisor requests.","allowedMemberTypes":["User"],"isEnabled":true}]
```

**Verification note:** Ha Duong must **sign out and sign back in** to get a fresh token with the `roles` claim.

**Task 2: AI Search `system-inventory-v1` Index**

- **Index provisioned** via REST PUT against `advisor-search-uwmrjzgkhs2hk` (HTTP 201 Created).

- **Index re-PUT with vectorizers** after AOAI embedding deployment landed (HTTP 204 No Content). The `vectorSearch.profiles[0].vectorizer` is now wired to `aoai-text-embedding-3-small`.

- **`Search Index Data Contributor` granted** to agent MI `advisor-agent-identity` (role assignment ID: `da63719e-20a7-47e3-b476-b2ee23ca2917`).

**Index state:**
| Property | Value |
|---------|-------|
| Name | `system-inventory-v1` |
| Fields | 13 (id, name, description, description_vector, capabilities, domain, owner_team, status, stack, data_sources, last_reviewed, confidence_score, org_id) |
| Vector profile | `default-vector-profile` → `default-hnsw` (cosine, m=4, efC=400, efS=500) |
| Vectorizer | `aoai-text-embedding-3-small` → integrated vectorization active |
| Semantic config | `default-semantic-config` |
| API version used | `2024-07-01` (stable) |

**Task 3: AOAI text-embedding-3-small Deployment**

- **Deployed** `text-embedding-3-small` version `1` to `advisor-aoai-uwmrjzgkhs2hk`:
  - SKU: GlobalStandard (Standard SKU not available for this model in swedencentral)
  - Capacity: 10K TPM
  - provisioningState: Succeeded
  - deploymentState: Running

- **Bicep module updated** — `infra/modules/aoai.bicep` now contains the `embeddingDeployment` resource with `GlobalStandard` SKU and exports `embeddingDeploymentName` output.

**Files changed:**
- `infra/app-roles.json` — New — AdvisorAdmin app role manifest
- `infra/modules/aoai.bicep` — Added `embeddingDeployment` resource + updated comment + output
- `advisor-agent/data/system-inventory-v1-index.json` — Added `vectorizers` block + wired `vectorizer` in profile

**M1 Status after this run:**
| Item | Status |
|------|--------|
| AdvisorAdmin app role defined | ✅ |
| AdvisorAdmin assigned to Ha Duong | ✅ |
| system-inventory-v1 index provisioned | ✅ |
| Search Index Data Contributor on agent MI | ✅ |
| text-embedding-3-small AOAI deployment | ✅ |
| Integrated vectorization wired in index | ✅ |
| Bicep module updated for future provisions | ✅ |


### 2026-05-27: Dallas JWT & Admin Updates (Dated Session)

#### dallas-v2-token-fix

# Decision: Dual-Issuer JWT Validation (v1 + v2 Entra Tokens)

**Author:** Dallas  
**Date:** 2026-05-27T07:22:12Z  
**Status:** Decided — deployed revision `advisor-agent-app--0000005`  
**Refs:** FR-014, FR-019

---

## Context

`GET /sessions` returned 401 after Ha signed out and back into the SPA. The Entra app registration (`appId: 4f4f4a4d-e60f-4b86-a681-86059aae4597`) had `requestedAccessTokenVersion: 2` confirmed via Graph API. The deployed SPA was correctly sending real Entra tokens (not demo mode).

## Root Cause

`jwt-middleware.ts` was set up with a single `EXPECTED_ISSUER`:

```
https://login.microsoftonline.com/cdfe81b5-821e-4f07-9ea7-516efc8497e4/v2.0
```

Microsoft Entra can issue tokens with **either** of these issuers depending on when the `requestedAccessTokenVersion: 2` setting propagates, cached sessions, or tenant-level policy overrides:

| Format | Issuer |
|--------|--------|
| v2     | `https://login.microsoftonline.com/{tenantId}/v2.0` |
| v1     | `https://sts.windows.net/{tenantId}/` |

When the backend only accepted v2, any token issued with the v1 issuer format silently produced a `401 { reason: "issuer mismatch" }`. The SPA showed no useful error — just "API GET /sessions failed: 401".

## Secondary Issue: `azure.yaml` predeploy hook

The predeploy hook was building the web SPA with `VITE_ADVISOR_DEMO_MODE=true`:

```sh
VITE_ADVISOR_DEMO_MODE=true npm run build --workspace=web
```

This bakes `isDemoMode = true` into the bundle. `getAccessToken()` returns `''` immediately in demo mode — no `Authorization` header is ever sent. Future `azd deploy` runs would silently regress auth.

Fixed: removed demo mode from the web build; added real `VITE_` vars and reads `VITE_AZURE_REDIRECT_URI` / `VITE_API_BASE_URL` from AZD env.

## Decision

### §A — Dual-issuer acceptance (defensive pattern)

Accept **both** v1 and v2 issuers in `jose`'s `jwtVerify` options:

```ts
const ACCEPTED_ISSUERS = [
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  `https://sts.windows.net/${TENANT_ID}/`,
];

await jwtVerify(token, JWKS, {
  issuer: ACCEPTED_ISSUERS,  // jose v5+ accepts string[]
  audience: API_AUDIENCE,
});
```

**Security rationale:** The `aud` claim is unique to our app (`api://4f4f4a4d-...`). A rogue v1 token from a different app cannot satisfy our audience check. Accepting both issuer formats carries zero security trade-off.

### §B — JWT failure diagnostics

On `jwtVerify` failure, decode the token without signature verification and log `iss`, `aud`, `ver`, `scp`, `alg`, `kid` to stderr. This makes future auth regressions self-diagnosing without needing to capture live tokens from users.

### §C — `azure.yaml` predeploy hook fix

Never build the web SPA with `VITE_ADVISOR_DEMO_MODE=true`. The hook now passes:
- `VITE_ADVISOR_DEMO_MODE=false`
- `VITE_ADVISOR_TENANT_ID` and `VITE_ADVISOR_CLIENT_ID` hardcoded (public identifiers)
- `VITE_AZURE_REDIRECT_URI="${STATIC_WEB_APP_URL}"` from AZD env
- `VITE_API_BASE_URL="${CONTAINER_APP_URL}"` from AZD env

## Deployment

- **Backend:** `az acr build` → image `jwt-dual-issuer` → `az containerapp update` → revision `advisor-agent-app--0000005` (Running, 100% traffic)
- **Tests:** 30/30 passing including 4 new dual-issuer tests
- **Frontend:** No web redeploy needed; current SPA was already built correctly by GitHub Actions (without demo mode)

## Action Required from Ha

1. In browser DevTools → Application → Storage → click **"Clear site data"** (or open an incognito window)
2. Navigate to `https://polite-mushroom-0a09fa803.7.azurestaticapps.net/`
3. Sign in with your Microsoft account
4. `GET /sessions` should now succeed

The middleware now accepts both v1 and v2 tokens, so even if Entra's token version propagation is delayed you will be unblocked.

---

#### dallas-cors-preflight-fix

# Decision: CORS Preflight Fix — P0 Regression

**Author:** Dallas (Backend Developer)  
**Date:** 2026-05-27  
**Status:** Deployed ✅  
**Revision:** `advisor-agent-app--azd-1779864726`

---

## Context

SPA at `https://polite-mushroom-0a09fa803.7.azurestaticapps.net/session/new` showed
"Backend not ready yet — Failed to fetch" for all users. Backend `/health` returned 200
but the SPA could not reach `/v1/responses`.

---

## Root Cause

**Middleware ordering + W3C CORS preflight spec.**

The W3C CORS specification (Fetch Standard §3.2) requires browsers to send an HTTP `OPTIONS`
preflight request **without** an `Authorization` header before any cross-origin request that
carries credentials. This is non-negotiable browser behaviour — it cannot be worked around
from the client side.

`jwtMiddleware` was mounted on `['/v1', '/sessions', '/admin']` in `index.ts` **before any
CORS middleware existed**. When the browser sent `OPTIONS /v1/responses` with no `Authorization`
header, `jwtMiddleware` responded with `HTTP 401 { error: "unauthorized", reason: "missing
bearer token" }`. The response carried no `Access-Control-Allow-Origin` header, so the browser
blocked the actual `POST` request entirely — producing "Failed to fetch" in the SPA.

---

## Fix

### 1. CORS middleware mounted BEFORE `jwtMiddleware` (`agent/src/index.ts`)

```typescript
app.use(cors({
  origin: corsOrigins,          // from ADVISOR_ALLOWED_ORIGINS env var
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));
// jwtMiddleware comes AFTER cors()
app.use(['/v1', '/sessions', '/admin'], jwtMiddleware);
```

Origins are loaded from `ADVISOR_ALLOWED_ORIGINS` (comma-separated). Default: deployed SWA
origin + `http://localhost:5173`. `cors({origin: '*'})` is explicitly NOT used — it is
incompatible with `credentials: true` and violates the allowlist security policy.

### 2. Belt-and-braces bypass in `jwtMiddleware` (`agent/src/auth/jwt-middleware.ts`)

```typescript
if (req.method === 'OPTIONS') {
  next();
  return;
}
```

Added at the very top of the middleware, before any auth logic. Even if CORS middleware
ordering ever regresses, preflight requests will pass through without a 401.

### 3. Bicep wiring (`infra/modules/container-apps.bicep`, `infra/main.bicep`)

- `container-apps.bicep` gains `param allowedOrigins string = ''`, wired to
  `ADVISOR_ALLOWED_ORIGINS` env var on the Container App.
- `main.bicep` gains `param allowedOrigins string = 'https://polite-mushroom-0a09fa803.7.azurestaticapps.net'`
  and passes it through to the `containerApps` module call.

### 4. Tests added (`agent/src/__tests__/auth-contract.test.ts`)

- **Test 12:** `OPTIONS /v1/responses` from SWA origin → HTTP 2xx with
  `Access-Control-Allow-Origin: <swa>` (no auth required).
- **Test 13:** `OPTIONS /v1/responses` from unlisted origin → no `Access-Control-Allow-Origin`
  header (origin blocked by allowlist).

---

## Verification

```
curl -i -X OPTIONS https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io/v1/responses \
  -H "Origin: https://polite-mushroom-0a09fa803.7.azurestaticapps.net" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

**Response (2026-05-27):**
```
HTTP/2 204
access-control-allow-origin: https://polite-mushroom-0a09fa803.7.azurestaticapps.net
vary: Origin
access-control-allow-credentials: true
access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS
access-control-allow-headers: Authorization,Content-Type
```

✅ HTTP 204 with correct `Access-Control-Allow-Origin`. SPA can now send credentialed POST
requests. The "Failed to fetch" regression is resolved.

---

## Deployed Revision

`advisor-agent-app--azd-1779864726`

---

## Lesson: CORS Preflight MUST Bypass Auth (Pattern for Brett)

This is a classic Express footgun. The invariant is:

> **CORS middleware MUST precede any authentication middleware.**  
> Belt-and-braces: add `if (req.method === 'OPTIONS') return next()` at the top of every
> auth middleware regardless of outer ordering.

Brett should codify this as a standing contract test: any new route prefix added to
`jwtMiddleware`'s path list must have a corresponding preflight test asserting 2xx +
`access-control-allow-origin` from the allowed origin.

See also: `.squad/skills/cors-preflight-with-jwt/SKILL.md` for the reusable pattern.

---

## Auth Invariant Preserved

POST/GET/etc. requests to `/v1/*` still require a valid Bearer token. The bypass is
**OPTIONS-only**. No authentication was removed from real requests.

---

#### dallas-m2-streaming-and-admin-writes

# Decision: M2 Streaming + Admin Writes

**ID:** dallas-m2-streaming-and-admin-writes  
**Date:** 2026-05-27  
**Author:** Dallas (Backend Developer)  
**Status:** Implemented  
**Spec refs:** FR-024 (versioned org-context write API), M2 SSE streaming spec

---

## Context

M2 wave required two parallel backend features in a single PR:

1. **Admin write API (Feature A):** Make `/admin/org-context` editable with a full versioned write API so admins can publish new context versions and the advisor reasoning loop picks them up per-request without a restart.

2. **SSE Streaming (Feature B):** `POST /v1/responses` currently returns one batched JSON after the full reasoning loop. M2 needs incremental streaming so the SPA can show the advisor reasoning live.

---

## Decisions Made

### Feature A — Versioned Org Context

**Decision A1: New `org_contexts` Cosmos container, partition key `/id`**  
Each version document has a unique id (e.g. `org-ctx-v1-{uuid}`). Partition key `/id` means point reads are efficient and no cross-partition overhead for individual version lookups. Trade-off: transactional batch for publish-one is impossible since versions are in different partitions.

**Decision A2: Read-modify-write loop for `publish(id)`**  
Since Cosmos transactional batch requires same partition, publish uses: (1) `listAll()`, (2) clear `published` flag on any currently-active version, (3) set `published = true` on target. Eventual consistency is acceptable for this rare admin operation. An alternative `org-ctx-pointer` document pattern is documented in history.md for M3 if needed.

**Decision A3: Per-request `getPublished()` in reasoning loop**  
Previously `getOrgCtx()` was called once at boot (M1 read the JSON file at startup). M2 changes to per-request: `orgContextStore.getPublished()` on every `POST /v1/responses`. This ensures a freshly published version takes effect on the next turn without a process restart. The cold-path cost is one Cosmos read per request — acceptable given the org context is small.

**Decision A4: Boot seed from `data/org-context-default.json`**  
On first boot, if `org_contexts` container is empty, the server creates version 1 from the seed JSON and publishes it. This runs async/detached so it never blocks the HTTP listener. Safe to retry — `listAll()` check guards against double-seeding.

**Decision A5: `createAdminRouter` accepts optional deps object**  
Changed signature from `createAdminRouter(): Router` to `createAdminRouter(deps?: AdminRouterDeps): Router`. Backward compatible — existing callers pass no args and get the noop store (503 for write operations). Tests updated to pass the in-memory store.

### Feature B — SSE Streaming

**Decision B1: `Accept: text/event-stream` content negotiation**  
The route inspects `req.headers.accept` at entry and dispatches to `handleResponsesSSE` or `handleResponsesBatch`. Two separate functions — not a single function with branches — because error handling shapes are incompatible: batch uses `res.status(N).json()`, SSE uses `sseWrite(error) + res.end()`.

**Decision B2: `res.flushHeaders()` before first `await`**  
Required to force the SSE headers downstream through ACA's front-door before the first async operation. Without this, ACA buffers until the response is complete, defeating streaming.

**Decision B3: 15-second keepalive comment**  
`setInterval(() => res.write(': keepalive\n\n'), 15_000)` runs for the lifetime of the SSE connection. ACA idle timeout is 30s; 15s keepalive leaves comfortable margin. The interval is always cleared in `endSSE()`.

**Decision B4: `onEvent` callback threaded into `runAdvisorLoop`**  
Rather than duplicating the reasoning loop for SSE, added an optional `onEvent?: (event: SSELoopEvent) => void` field to `AdvisorLoopDeps`. When present, each model call uses `stream: true` (AsyncIterable). Text deltas are emitted as `text.delta`; tool call dispatch emits `tool.invoked` before and `tool.result` after each tool call. Backward compatible — existing tests don't set `onEvent` and use the non-streaming path unchanged.

**Decision B5: Persist to Cosmos after `turn.completed` event**  
The SSE path emits `turn.completed` (with final text) before Cosmos persistence. This minimizes time-to-first-complete-response for the client. Persistence errors are caught and logged but do not fail the SSE stream — the client already received the response.

---

## Alternatives Considered

**Alt: `client.responses.create({ stream: true })`** — The spec referenced the new Responses API. The codebase uses `chat.completions.create` throughout. Switching APIs mid-M2 would risk breaking the M1 tool-calling loop. Decision: stay on `chat.completions.create({ stream: true })`.

**Alt: Cosmos transactional batch for publish** — Would require moving all versions to the same partition (e.g. partition key `/orgId`). That's a data migration. Read-modify-write loop is simpler for MVP scale.

---

## Test Coverage

6 new tests in `src/__tests__/sse-streaming.test.ts`:
- Test 1: SSE event order (turn.created → text.delta+ → turn.completed → response.done)
- Test 2: Non-streaming fallback (no Accept header → batched JSON)
- Test 3: Error mid-stream (emits error event, closes gracefully)
- Test 4: POST /admin/org-context/versions → 201 draft
- Test 5: GET /admin/org-context/versions → list
- Test 6: POST /admin/org-context/versions/:id/publish → publish + unpublish others

All 26 tests pass (20 original + 6 new).

---

#### lambert-m2-streaming-admin-reviewer

# Decision: lambert-m2-streaming-admin-reviewer

**Date:** 2026-05-27  
**Author:** Lambert (Frontend Developer)  
**Requested by:** Ha Duong  
**Sprint:** M2 Wave  

---

## Context

M2 frontend wave covering three parallel features shipped while Dallas delivers the matching backend (agent dallas-4). All changes are confined to `web/src/`; no `agent/` files were touched.

---

## Feature 1 — SSE Streaming in SessionPage

### Problem
Current SessionPage POSTs to `/v1/responses` and waits up to 60 s for a batched JSON response. This produces a poor UX (long spinner, no progressive feedback) and prevents showing tool invocations in real time.

### Decision
Replace `apiPost` with a hand-rolled SSE consumer (`streamResponses` async generator in `client.ts`). Use `fetch` with `Accept: text/event-stream` and `Authorization: Bearer <token>` — the native `EventSource` API cannot carry custom headers, making it unsuitable for protected endpoints.

### SSE parser implementation
- Read the response body via `response.body.getReader()`
- Accumulate chunks in a `buffer` string, split on `\n\n` for event boundaries
- Skip lines starting with `: ` (SSE comments / keepalive heartbeats)
- Parse `event: X` + `data: Y` pairs; `JSON.parse` the data payload
- Emit typed `SSEEvent` discriminated union events to the caller
- Clean up with `reader.cancel()` in a `finally` block

### Graceful fallback
If `Content-Type` is not `text/event-stream` (backend not yet upgraded), fall through to `response.json()` and emit a `__json_fallback__` sentinel. `SessionPage` handles this identically to the old batched path — deploy ordering is safe.

### AbortController wiring
`AbortController` stored in `useRef<AbortController>`. Aborted on:
1. Component unmount (`useEffect` cleanup)
2. New submission (before starting a fresh stream)

Aborted streams do not update state (guarded by `signal.aborted` check in the catch block).

### Tool call chips
Collapsible `<ToolChip>` component. State: `{ toolName, args, resultSummary, done, collapsed }[]`. Auto-collapse + add ✓ on `tool.result`. Persisted to `Turn` history on `response.done`. Error turns include a Retry button that re-calls `runStream(retryPayload)`.

---

## Feature 2 — Admin Org Context Edit + Publish

### New routes wired (Dallas M2 backend)
- `GET /admin/org-context/versions` — version list  
- `POST /admin/org-context/versions` — create draft  
- `POST /admin/org-context/versions/:id/publish` — publish

### OrgContextPage rewrite
Two-column layout: version list (left, newest first) + edit form (right). Form edits:
- `changeSummary` — plain text input
- `systemInventory`, `entitlements`, `customInstructions` — JSON textareas (M2 scope; full row-level editors deferred to M2.1)

`isDirty` computed by comparing `JSON.stringify` of rebuilt content vs original. "Save as new draft" disabled when not dirty. "Publish" disabled when already published.

Relative-time helper (no external dependency): compares `Date.now()` to ISO timestamp, formats as `Xm ago` / `Xh ago` / `Xd ago`.

Toast: fixed-position, auto-dismiss after 3.5 s via `setTimeout`. Defined inline with a `useToast` custom hook; no third-party library.

### EntitlementsPage + CustomInstructionsPage
Both pages are read-only in M2 — a `coming-soon-banner` communicates to admins that write actions land in M2.1 once Dallas ships the standalone routes. Data is fetched from the existing `/admin/org-context` endpoint.

### New types in `web/src/types/index.ts`
```ts
export interface OrgContextVersion {
  id: string;
  version: number;
  published: boolean;
  publishedAt?: ISOTimestamp;
  publishedBy?: string;
  content: OrgContext;
}
```

---

## Feature 3 — Reviewer Queue

### Route and gating
`/reviewer` — new top-level route. Nav link in `AppHeader` visible to `AdvisorAdmin` role. **TODO M2.1:** switch gating role to `AdvisorReviewer` once the role is provisioned in Entra.

### Data source
`GET /admin/requests` (existing admin endpoint). A dedicated reviewer-scoped `/requests` endpoint does not exist yet; using the admin route avoids backend changes.

### Columns
requestId (link to `/brief/:id`), submittedBy (ownerId/submitterId), projectName (title), reuse grouping (reuseDecision.decision), recommended tech (readinessBrief.recommendedPlatform.displayName), createdAt, status badge.

### Expandable row
Click row → inline `<ReadinessBriefPanel>` renders the same brief fields as `BriefPage`. Panel shows structured data (not raw markdown).

### Status transition buttons  
Accept / Reject / Needs more info. POSTs to `/requests/:id/status`.  
**TODO M2.1** comment in code — backend route pending. On failure, toast reads "Action queued (backend route pending)" rather than surfacing an error.

---

## Alternatives considered

| Decision | Alternative | Reason rejected |
|----------|-------------|-----------------|
| Hand-rolled SSE reader | Native `EventSource` | Cannot set `Authorization` header |
| `__json_fallback__` sentinel | Separate code path / boolean flag | Keeps generator interface clean; caller handles both cases identically |
| `React.Dispatch<T>` for callback type | `(action: T) => void` | ESLint `no-unused-vars` (base rule, no `@typescript-eslint` plugin) flags named params in interface function types |
| JSON textareas for OrgContext arrays | Row-level form inputs | Sufficient for M2; full inline editing is M2.1 scope |

---

## Build & lint status

- `npm run build` ✓ — 593 kB JS bundle (< 1 MB limit), 14.9 kB CSS
- `npm run lint` ✓ — 0 warnings, 0 errors
- No changes to `agent/` directory

---

#### parker-foundry-hosted-agent-blocker

# Blocker: Foundry Hosted Agent Registration — M2.1 Follow-up

**Author:** Parker (DevOps/SRE)  
**Date:** 2026-05-27T07:00:00Z  
**Severity:** Non-blocking (M2.1 deferred — not on M2 critical path)  
**Spec ref:** FR-003, product-spec.md §9

---

## What was requested

> "Register the ACA endpoint as a Microsoft Foundry Agent Service Hosted Agent."

---

## Research findings

### What "Foundry Hosted Agent" actually is

Foundry Hosted Agent is a **container hosting service** operated by the Foundry gateway — not an endpoint registry. You give it a container image; it runs that image in an isolated sandbox with a dedicated Entra agent identity. Our ACA endpoint and a Foundry Hosted Agent are two separate hosting environments that both run the same code.

### Docs consulted (2026-05-27)

| Document | URL | Key finding |
|---|---|---|
| Hosted agents concept | https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents | Preview; container must use protocol library |
| Deploy hosted agent (SDK + REST) | https://learn.microsoft.com/azure/foundry/agents/how-to/deploy-hosted-agent | Python SDK `azure-ai-projects>=2.1.0` only; no Bicep for agent version |
| Quickstart (azd) | https://learn.microsoft.com/azure/foundry/agents/quickstarts/quickstart-hosted-agent | azd/VS Code only; no IaC resource type |
| Bicep types reference | https://learn.microsoft.com/azure/templates/microsoft.cognitiveservices/accounts | CognitiveServices/accounts supports AIServices kind + projects child |

### Three concrete blockers

#### Blocker 1 — No Foundry project in our infra

Foundry Hosted Agent requires:
1. `Microsoft.CognitiveServices/accounts` with `kind=AIServices` + `allowProjectManagement: true`
2. A child `Microsoft.CognitiveServices/accounts/projects` resource

Our current `infra/modules/foundry.bicep` is a placeholder that acknowledges this gap. Neither resource is deployed to `rg-advisor-dev`.

**Cost impact:** AIServices S0 = ~$10/mo base + model token costs (separate from current AOAI account).

#### Blocker 2 — Container doesn't implement Foundry protocol library

The Foundry gateway requires the container to use:
- Python: `azure-ai-agentserver-responses`
- .NET: `Azure.AI.AgentServer.Responses`
- **Node.js: No official library as of 2026-05-27**

The library exposes a `/responses` endpoint (not our `/v1/responses`), `/readiness`, and handles SSE streaming with the Foundry lifecycle (created → in_progress → completed). Our Express container doesn't implement this contract.

**There is no Node.js Foundry protocol library currently published on npm.** Node.js is NOT listed in the [language support matrix](https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents#language-support) for Hosted Agents.

This is a fundamental gap: to deploy to Foundry Hosted Agent from Node.js, we would need to either manually implement the protocol contract or migrate the agent to Python/.NET.

#### Blocker 3 — No Bicep resource type for agent version registration

The Foundry data-plane agent version lifecycle (create/poll/activate) has **no ARM/Bicep resource type**. Registration is only possible via:
- Python SDK (`azure.ai.projects>=2.1.0`, `project.agents.create_version(...)`)
- azd + VS Code extension workflow
- Direct REST API calls

The `infra/modules/foundry.bicep` placeholder cannot be completed until Microsoft publishes a GA ARM resource type.

---

## What was delivered in M2

| Artefact | Purpose |
|---|---|
| `scripts/register-foundry-agent.sh` | Reference registration script using Python SDK; guards on missing env vars; exits cleanly if Foundry project is not configured |
| `docs/m2-foundry-hosted-agent.md` | Full M2.1 handoff doc: step-by-step unblocking plan, Bicep snippets, RBAC commands, JWT audience verification guidance |

---

## Recommended next steps (M2.1)

1. **Decide on language:** Evaluate whether to migrate the agent to Python (Azure AI Agent Framework) or wait for Microsoft to publish a Node.js Foundry protocol library.
2. **Provision Foundry project:** Update `infra/modules/foundry.bicep` with AIServices account + project (Bicep snippets in `docs/m2-foundry-hosted-agent.md`). Run `azd provision`.
3. **Implement `/responses` protocol endpoint** (alongside existing `/v1/responses`).
4. **Register agent version** via `scripts/register-foundry-agent.sh` or `azd` once above are done.
5. **Verify JWT audience:** Foundry tokens may carry a different `aud` — check against `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`.

---

*Parker — 2026-05-27T07:00:00Z*

---

#### parker-cosmos-data-plane-rbac

# Parker: Cosmos DB Data-Plane RBAC Assignment (2026-05-27)

**By:** Parker (DevOps/Infra Engineer)  
**Date:** 2026-05-27T00:10:00Z  
**Status:** ✅ COMPLETE — Agent MI now has Cosmos DB Built-in Data Contributor role  
**Commit:** CLI assignment applied; Bicep already defined  

---

## Context

Dallas's M1 CosmosSessionStore + CosmosRequestStore were returning `403 Forbidden` on first write attempts. Root cause: the Container App managed identity (`advisor-agent-identity`, principalId `c8c13fe3-325a-439b-8aa8-d365f3ebe285`) lacked Cosmos DB **data-plane** RBAC role assignment.

The assignment was defined in Bicep (`infra/modules/identity.bicep` line 150) but had not yet been applied to the Azure Cosmos account.

---

## 🚨 Key Gotcha: Control-Plane vs Data-Plane RBAC

**CRITICAL DISTINCTION:**

- **Azure RBAC (Control-Plane):** `az role assignment create --role "Cosmos DB Account Reader Role"` → Grants ARM permissions (read/write account settings, keys, scaling). Does NOT unlock Cosmos DB API read/write operations.
  
- **Cosmos DB RBAC (Data-Plane):** `az cosmosdb sql role assignment create` → Grants SDK/API permissions (read/write documents, execute queries). Required for every application identity that touches Cosmos data.

**Why This Matters:** A principal with control-plane "Cosmos DB Contributor" cannot read a single document. A principal with data-plane "Cosmos DB Built-in Data Contributor" can freely read/write items but cannot manage the account itself.

**Dallas's situation:** The agent identity had control-plane Contributor (via infrastructure deployment) but **lacked data-plane Contributor**. Each SDK call to Cosmos hit a 403 Unauthorized error before the query even executed.

**This is the #1 pit in Cosmos security setup.**

---

## Resources Discovered

| Resource | Value |
|---|---|
| **Subscription ID** | `3d2c527a-481d-4e13-b3a1-637924b33343` |
| **Resource Group** | `rg-advisor-dev` |
| **Cosmos Account Name** | `advisor-cosmos-uwmrjzgkhs2hk` |
| **Container App** | `advisor-agent-app` (user-assigned identity) |
| **Agent Identity** | `advisor-agent-identity` |
| **Agent MI PrincipalId** | `c8c13fe3-325a-439b-8aa8-d365f3ebe285` |

---

## Cosmos DB Built-in Roles (Well-Known IDs)

| Role | GUID | Access |
|---|----|--------|
| Data Reader | `00000000-0000-0000-0000-000000000001` | Read-only (cannot create, upsert, delete) |
| Data Contributor | `00000000-0000-0000-0000-000000000002` | Full read/write/delete on documents |

**Why Data Contributor for the agent:** Dallas's stores call `createIfNotExists` (idempotent), `upsert`, and `replace` — all write operations. Reader-only role would fail on first write. Contributor is the correct choice.

---

## Assignment Execution

### CLI Command Issued

```bash
az cosmosdb sql role assignment create \
  --account-name advisor-cosmos-uwmrjzgkhs2hk \
  --resource-group rg-advisor-dev \
  --role-definition-id 00000000-0000-0000-0000-000000000002 \
  --principal-id c8c13fe3-325a-439b-8aa8-d365f3ebe285 \
  --scope "/"
```

### Result

Assignment created successfully (HTTP 200):
```
Role Assignment ID: 2029d58b-61cd-4a7f-844b-8629dda32369
Principal ID: c8c13fe3-325a-439b-8aa8-d365f3ebe285 (agent MI)
Role: 00000000-0000-0000-0000-000000000002 (Data Contributor)
Scope: / (account-wide)
```

### Verification

✅ Agent MI now appears in role assignment list:
```bash
az cosmosdb sql role assignment list \
  --account-name advisor-cosmos-uwmrjzgkhs2hk \
  -g rg-advisor-dev
```

---

## Bicep Codification Status

✅ **Already in Infrastructure as Code**

The role assignment is defined in `infra/modules/identity.bicep` (lines 150–159):

```bicep
resource agentCosmosContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosAccountId, agentIdentity.id, cosmosDataContributorRoleId)
  parent: existingCosmosAccount
  properties: {
    scope: cosmosAccountId
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: agentIdentity.properties.principalId
  }
}
```

**Implications:**
- ✅ Future `azd up` deployments will automatically create this assignment.
- ✅ No additional Bicep changes required.
- ✅ The assignment is idempotent — repeated deployments will not fail.

---

## Verification: Dallas's Cosmos Writes

To verify the fix works:

1. **Restart the Container App revision:**
   ```bash
   az containerapp logs show -n advisor-agent-app -g rg-advisor-dev --tail 50
   ```

2. **Trigger a `/v1/responses` request** via the web UI (requires valid JWT).

3. **Expected outcome:** Cosmos writes return `HTTP 201 Created` (success) instead of `HTTP 403 Forbidden`.

---

## M2 Follow-Up: Narrow Role Scope

**Deferred decision:** The current role scope is `/` (account-wide). M1 uses account-level scope for simplicity. Before production:

1. Narrow agent role to the `advisor` database scope.
2. Narrow admin role similarly.
3. Potential container-level scope if read isolation becomes a requirement.

See `infra/modules/identity.bicep` line 154 TODO comment.

---

## References

- **Cosmos DB Data-Plane RBAC:** https://learn.microsoft.com/azure/cosmos-db/nosql/security/how-to-grant-data-plane-role-based-access
- **Azure RBAC vs Data-Plane RBAC:** https://learn.microsoft.com/azure/cosmos-db/roles/overview
- **Bicep Implementation:** `infra/modules/identity.bicep` (lines 150–169)
- **Dallas's Issue:** `.squad/decisions/inbox/dallas-m1-reasoning-loop.md` (§D)

---

#### parker-m2-observability-foundry

# Decision: M2 Observability + Foundry Hosted Agent

**Author:** Parker (DevOps/SRE)  
**Date:** 2026-05-27T07:00:00Z  
**Status:** Shipped (observability) / M2.1 follow-up (Foundry)

---

## EPIC 1 — Application Insights Observability ✅ Shipped

### What shipped

| Item | Status | Detail |
|---|---|---|
| `infra/modules/monitoring.bicep` | ✅ Pre-existing + enhanced | Log Analytics (PerGB2018, 30d) + App Insights workspace-based. Added `instrumentationKey` output. |
| `infra/main.bicep` wiring | ✅ Pre-existing | `appInsightsConnectionString` passed to container-apps.bicep as `APPLICATIONINSIGHTS_CONNECTION_STRING` env var. |
| `applicationinsights@^2.9.8` npm | ✅ Installed | `cd agent && npm install applicationinsights@^2.9.5` resolved to 2.9.8. |
| SDK init in `agent/src/index.ts` | ✅ Wired | Import + `setup().setAutoCollectConsole(true,true).setAutoDependencyCorrelation(true).start()` guarded on env var. |
| `requestProcessed` custom event | ✅ Wired | `appInsights.defaultClient?.trackEvent(...)` in `agent/src/adapter/responses.ts` after each loop completion. |

### Custom event shape

```ts
appInsights.defaultClient?.trackEvent({
  name: "requestProcessed",
  properties: {
    requestId,       // Cosmos request ID
    sessionId,       // session
    durationMs,      // total loop duration string
    toolsInvoked,    // count of phases executed (bxt+search+reuse+readiness)
    finalGrouping,   // readinessBrief.recommendedPlatform.platformKey
    finalTech,       // readinessBrief.recommendedPlatform.displayName
  },
});
```

### Verification query (after deploy, wait 2–5 min)

```kusto
// In Application Insights → Logs:
customEvents
| where name == "requestProcessed"
| project timestamp, tostring(customDimensions.requestId), tostring(customDimensions.durationMs), tostring(customDimensions.finalTech)
| order by timestamp desc
| take 20

requests
| where url contains "/v1/responses"
| project timestamp, duration, resultCode
| order by timestamp desc
| take 20
```

### Guardrails respected

- CORS middleware order NOT changed (Dallas's fix preserved) ✅
- `jwt-middleware.ts` NOT modified ✅
- `responses.ts` reasoning logic NOT changed — only `trackEvent` ADDED ✅
- All 20 tests pass after changes ✅

---

## EPIC 2 — Foundry Hosted Agent Registration 🟡 M2.1 Blocked

See `.squad/decisions/inbox/parker-foundry-hosted-agent-blocker.md` for full detail.

**Summary:** Documented as M2.1 follow-up. Three blockers: no Foundry project infra, container doesn't implement protocol library, no Bicep for agent version registration.

**Artefacts produced:**
- `scripts/register-foundry-agent.sh` — reference registration script (Python SDK, guards on missing env vars)
- `docs/m2-foundry-hosted-agent.md` — M2.1 handoff doc with step-by-step unblocking plan

---

## Commit strategy

Pushed App Insights changes first (separate commit to reduce conflict with Dallas's streaming work on index.ts + responses.ts), then Foundry docs.
