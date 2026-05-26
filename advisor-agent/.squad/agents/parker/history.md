# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

---

## M0 Infra Scaffold — 2026-05-26

### Bicep module structure

Six modules under `infra/modules/`:

| Module | Resources | Key decisions |
|---|---|---|
| `cosmos.bicep` | `Microsoft.DocumentDB/databaseAccounts`, `sqlDatabases/advisor`, 4× `sqlDatabases/containers` | `disableLocalAuth: true` — all access via managed identity + data-plane RBAC |
| `search.bicep` | `Microsoft.Search/searchServices` (Basic SKU) | System-assigned identity; no index in M0 — Dallas adds in M1; `authOptions.aadOrApiKey` keeps RBAC strict |
| `container-registry.bicep` | `Microsoft.ContainerRegistry/registries` (Basic SKU) | `adminUserEnabled: false`; agent identity gets AcrPull via ARM RBAC in identity.bicep |
| `monitoring.bicep` | `Microsoft.OperationalInsights/workspaces` + `Microsoft.Insights/components` (workspace-based) | Workspace-based App Insights so all telemetry lands in one queryable LA store |
| `identity.bicep` | 2× `Microsoft.ManagedIdentity/userAssignedIdentities`, 2× ARM role assignments, 8× `Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments` | See identity model below |
| `foundry.bicep` | Placeholder only — no deployable resource yet (see Foundry gap below) | Output `agentPlaceholder` lets downstream modules reference the agent name |

### Identity model

Two user-assigned managed identities:

**agentIdentity** (advisor Hosted Agent / Container App runtime)
- `Cosmos DB Built-in Data Contributor` → sessions, requests, projects containers
- `Cosmos DB Built-in Data Reader` → org-context container
- `Search Index Data Reader` → Search service (ARM RBAC)
- `AcrPull` → Container Registry (ARM RBAC)

**adminIdentity** (admin backend service)
- `Cosmos DB Built-in Data Contributor` → org-context
- `Cosmos DB Built-in Data Reader` → sessions, requests, projects (admin browse screens — elevated privilege, must be audit-logged)

Cosmos DB data-plane role assignments use `Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments`. The well-known built-in role definition IDs are:
- `00000000-0000-0000-0000-000000000001` — Built-in Data Reader
- `00000000-0000-0000-0000-000000000002` — Built-in Data Contributor

⚠️ **TODO (M1):** Narrow `scope` on each `sqlRoleAssignment` from account scope to container scope once containers stabilise.

### Foundry Hosted Agent preview gap

**Problem:** `Microsoft.FoundryService/agents` (or the confirmed ARM resource type) is not GA in the Bicep/ARM provider as of M0. There is no stable Bicep resource declaration to deploy or version a Hosted Agent.

**Bridge:** AZD `predeploy` hook in `azure.yaml` will call `scripts/deploy-hosted-agent.sh` (to be created in M1 by Parker or Ripley). The script wraps `az rest` / Foundry CLI to PUT the agent definition. This is explicitly called out in `infra/modules/foundry.bicep` with a TODO comment.

**When to revisit:** Monitor https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents and the ARM provider changelog. Replace the placeholder block in `foundry.bicep` with the real resource declaration once GA is confirmed.

### Networking posture

Public networking selected per product-spec §10. `publicNetworking` parameter defaults to `true` in `main.parameters.json` for dev. Cosmos DB `disableLocalAuth: true` enforces managed identity regardless of network posture. Private endpoint hardening is a prod path — leave Bicep structure extensible (no VNet resources in M0).

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.

---

## M0 Local Boot Smoke Test — 2026-05-26

### Dev loop commands (verified on commit 9250e2c)

**Install (once per codespace):**
```bash
cd advisor-agent && npm install
```

**Agent backend (port 8080) — build required, no watch mode in M0:**
```bash
cd advisor-agent/agent && npm run build && ADVISOR_DEMO_MODE=true ADVISOR_LOCAL_DEV=true node dist/index.js
```

**Web dev server (port 5173):**
```bash
cd advisor-agent/web && npm run dev
```

**Full one-liner:**
```bash
cd /workspaces/Microsoft-AI-Decision-Framework/advisor-agent && \
  (cd agent && npm run build && ADVISOR_DEMO_MODE=true ADVISOR_LOCAL_DEV=true node dist/index.js &) && \
  (cd web && npm run dev)
```

### Gotchas discovered

1. **No `dev` script in `agent/`** — must `npm run build` then `node dist/index.js` every time. Dallas to add `tsx watch` dev script in M1.

2. **`web/tsc --noEmit` fails with TS6059** — `tsconfig.base.json` at monorepo root has `"rootDir": "src"` which resolves to `advisor-agent/src/` (root), not `web/src/`. Web's `tsconfig.json` inherits this without overriding. Fix: Lambert adds `"rootDir": "src"` to `web/tsconfig.json` in M1. Vite dev server is **unaffected** — only `npm run build` breaks.

3. **`ADVISOR_DEMO_MODE=true` blocks all admin routes (403)** — correct by design. Admin routes need `ADVISOR_DEMO_MODE` unset (or `false`) to pass the gate; M1 will add real JWT validation.

4. **Health endpoint is at `/health`, not `/api/health`** — only live endpoint in M0. All other routes return 501 (stub) or 404 (no root route defined).

5. **Root `package.json` has no `dev` script** — no one-command workspace dev boot yet. To be added as a tooling improvement in M1 (Parker scope).

---

## M0 AZD Deploy — 2026-05-26

### Deployment status
- ✅ `azd provision` succeeded: RG `rg-advisor-dev` in eastus2
- ✅ `azd deploy agent` succeeded: Container App `advisor-agent-app`
- ✅ `/health` returns `{"status":"ok","service":"advisor-agent","version":"0.0.1"}`
- ✅ `DefaultAzureCredential` verified against Cosmos
- 🟡 AI Search skipped — eastus2 `InsufficientResourcesAvailable`; added `deploySearch` toggle

### Key pitfalls encountered

| Pitfall | Fix |
|---|---|
| `azd provision` failed: no Docker locally | Added `remoteBuild: true` to agent docker config in azure.yaml |
| ACR remote build: `write too long` tar error | Improved `.dockerignore` — added `**/node_modules`, `web/`, `infra/`, `.squad/` |
| Docker build: `Cannot read file '/app/tsconfig.base.json'` | Added `COPY tsconfig.base.json ./` to Dockerfile Stage 1 |
| Web `tsc` build error: `rootDir` mismatch | Added `"rootDir": "."` override in `web/tsconfig.json` |
| `azd deploy agent` failed: resource not found | Missing `azd-service-name: agent` tag on Container App; added `union(tags, {'azd-service-name':'agent'})` |
| Cosmos `sqlRoleAssignment` duplicate bug | Previous code created 3 assignments for same (scope, role, principal); consolidated to 1 |
| `gpt-4o-mini 2024-07-18` deprecated 2026-03-31 | Switched to `gpt-4.1-mini 2025-04-14` (GA) |
| eastus2 AI Search quota exhausted | Added `deploySearch bool = false` parameter; documented as M1 follow-up |
| AZD predeploy hook ran web build before deploy | Updated hook to `VITE_ADVISOR_DEMO_MODE=true` prefix; web build now passes cleanly |

### Key file paths
- Deploy report: `.squad/decisions/inbox/parker-azd-deploy-report.md`
- Local dev config: `agent/.env.local`, `web/.env.local` (gitignored)
- New Bicep modules: `infra/modules/container-apps.bicep`, `infra/modules/aoai.bicep`, `infra/modules/staticwebapp.bicep`
- Fixed: `infra/modules/identity.bicep` (Cosmos RBAC bug), `infra/main.bicep` (new outputs)
- Fixed: `web/tsconfig.json` (rootDir), `Dockerfile` (tsconfig.base.json copy), `.dockerignore`
- AZD env: `.azure/advisor-dev/` (gitignored)

### Endpoints
- Container App: `https://advisor-agent-app.niceflower-d3218211.eastus2.azurecontainerapps.io`
- Static Web App: `https://orange-tree-0fd197c0f.7.azurestaticapps.net` (SPA not yet deployed)
- Cosmos: `https://advisor-cosmos-uwmrjzgkhs2hk.documents.azure.com:443/`
- AOAI: `https://advisor-aoai-uwmrjzgkhs2hk.openai.azure.com/` (model: gpt-4.1-mini)

### M1 follow-ups
1. Re-enable AI Search: `azd env set deploySearch true && azd provision` (or try swedencentral)
2. Deploy web SPA: `azd deploy web` once Entra app registration is created
3. Add `scripts/deploy-hosted-agent.sh` for Foundry Hosted Agent wiring
4. Narrow Cosmos role assignments from account scope to container scope
5. Add Cosmos serverless capability for cheaper dev billing

---

## M0→M1 Region Redeploy — 2026-05-26

### Redeploy from eastus2 to swedencentral (parker-3)

✅ **All-green.** Region migration completed successfully.

**Why swedencentral?** First candidate probed. All four required services available:
- AI Search Basic ✅
- AOAI gpt-4.1-mini ✅
- Container Apps ✅
- Cosmos DB serverless ✅

**Teardown:** `azd down --force --purge` succeeded (~16 min). No orphaned resources. eastus2 region clean.

**Redeploy:** swedencentral region up. New endpoints live.

**New Container App URL:** `https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io`

**Static Web Apps region split:** SWA is a CDN-backed global resource. Pinned to `westeurope` (correct by design). Added `staticWebAppLocation` parameter to `infra/main.bicep`. Bicep now splits compute (swedencentral) from SWA (westeurope).

**Bicep changes:**
1. `infra/main.bicep` — Added `staticWebAppLocation: string = 'westeurope'` parameter; wired to `staticWebApp` module.
2. `infra/main.parameters.json` — `deploySearch: true`; `staticWebAppLocation: "westeurope"`.

**Local env files updated:**
- `agent/.env.local` — `SEARCH_ENDPOINT` populated; AOAI + Search endpoints + `APPLICATIONINSIGHTS_CONNECTION_STRING` updated to swedencentral.
- `web/.env.local` — New Container App URL populated; Static Web App URL updated.

**Smoke test:** ✅ `GET /health` returns `{"status":"ok","service":"advisor-agent","version":"0.0.1"}`

**Caveats:**
- Foundry Hosted Agent Bicep still a stub (M1)
- AI Search index schema still missing (Dallas M1)
- SWA CLI x86-only binary breaks ARM aarch64 codespace (Parker M2, workaround: GitHub Actions + Azure Cloud Shell documented)
- Cosmos role scope still at account level (Parker M1)

**Commit:** fbf39dd

**Decision record:** `.squad/decisions.md` entry #259

---

## Entra SPA Setup — 2026-05-26

### Entra app registration complete (parker-4)

🟢 **Phase 1 DONE** — Entra app registration created and configured.  
🔴 **Phase 2 BLOCKED** — SWA CLI x86-only; ARM aarch64 codespace incompatible.

**App Registration Details:**
- Display Name: `advisor-agent-web`
- **App ID (Client ID):** `4f4f4a4d-e60f-4b86-a681-86059aae4597`
- **Tenant ID:** `cdfe81b5-821e-4f07-9ea7-516efc8497e4`
- Object ID: `bfb7a513-c545-4b25-a5db-dab4f7661777`
- Platform: SPA (Single-Page Application, PKCE)
- Identifier URI: `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`

**Redirect URIs registered:**
- `http://localhost:5173` (Vite local dev)
- `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` (deployed SWA from parker-3 redeploy)

**API Scope (exposed by this app):**
- `api://4f4f4a4d-e60f-4b86-a681-86059aae4597/access_as_user` ✅ Enabled

**API Permissions:**
- Microsoft Graph `User.Read` (Delegated) — admin consent ✅ granted

**PKCE Flow:** SPA platform auto-enables access token + ID token issuance. No client secret created (correct for PKCE). All identifiers are public — safe to commit.

**Env files updated:**
- `web/.env.local` — `VITE_ADVISOR_TENANT_ID`, `VITE_ADVISOR_CLIENT_ID`, `VITE_AZURE_REDIRECT_URI`, `VITE_API_BASE_URL`, `VITE_STATIC_WEB_APP_URL` all populated.
- `agent/.env.local` — No change needed; `AZURE_TENANT_ID` already present.

**Smoke test:** ✅ `cd web && npm run dev → curl http://localhost:5173 → HTTP 200`

### Phase 2 blocker — SWA CLI x86-only

Root cause: Codespace ARM aarch64. SWA CLI deployment binary is x86-64 ELF only. No ARM Linux variant in catalogue.

Vite build **succeeded** — `web/dist/` compiled and ready to deploy.

**Unblocking paths (for Ha):**

**Option A (recommended):** GitHub Actions (~5 min)
1. Get SWA deployment token: `az staticwebapp secrets list --name "advisor-web-uwmrjzgkhs2hk" --resource-group "rg-advisor-dev" --query "properties.apiKey" -o tsv`
2. Set as GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`
3. Create `.github/workflows/deploy-web.yml` (template in full report)
4. `gh workflow run deploy-web.yml`

**Option B:** x86-64 machine / Azure Cloud Shell
- From any x86 environment: `az login` → `azd env select advisor-dev` → `azd deploy web`

### M1 Backend Auth Wiring (Dallas critical path)

Frontend will request tokens scoped to `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`. Backend must validate:
- Token `aud` (audience) claim == `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`
- Token issuer matches tenant `cdfe81b5-821e-4f07-9ea7-516efc8497e4`

Stub location: `agent/src/auth/identity.ts` (marked "M1: the JWT validation middleware will attach…")

### M1 follow-ups

| Task | Owner | Notes |
|---|---|---|
| Define `AdvisorAdmin` app role on app registration | Parker | Required by FR-021; add once backend role-check middleware ready |
| Implement backend JWT validation (audience + issuer) | Dallas | Critical path for M2 sign-in to work |
| Plan app role assignment workflow | Ha / Parker | Portal or AZD postprovision hook |

**Decision record:** `.squad/decisions.md` entry #260

---

## SWA GitHub Actions Deploy — 2026-05-26 (parker-5)

### GitHub Actions as deploy fallback for ARM-incompatible toolchains

When local toolchain cannot run (e.g. SWA CLI x86-64 binary on ARM aarch64 codespace), GitHub Actions on `ubuntu-latest` is the correct unblocking pattern. Documented as a reusable skill in `.squad/skills/github-actions-as-deploy-fallback/SKILL.md`.

**Pattern applied:** `gh secret set` + `gh variable set` → commit workflow → push → first run triggered automatically.

### gh secret / variable conventions used

- **Sensitive deploy credentials** (SWA token, storage keys, etc.) → `gh secret set NAME --body "$VALUE" -R owner/repo`
- **Public build-time config** (Vite envs, client IDs, URLs) → `gh variable set NAME --body "VALUE" -R owner/repo`
- Variables are accessible in workflows as `${{ vars.NAME }}`; secrets as `${{ secrets.NAME }}`
- Inline fallback defaults in workflow `env:` block (`${{ vars.NAME || 'default' }}`) prevent build breaks if variables are deleted

### SWA action quirks

- `app_location` must be **repo-root-relative** (e.g. `advisor-agent/web`), not workspace-relative
- `output_location` is relative to `app_location` (so `dist` → `advisor-agent/web/dist`)
- `app_build_command` runs inside `app_location` — `npm ci && npm run build` works for Vite monorepo setups
- Vite env vars must be in the `env:` block on the **deploy step** (not job-level) so the SWA action's build subprocess picks them up
- `close_pull_request_job` must use `action: 'close'` and the same `app_location`; no `output_location` needed

### ARM workaround documented

`ubuntu-latest` GitHub-hosted runner is x86-64. The SWA CLI `StaticSitesClient` binary inside `Azure/static-web-apps-deploy@v1` is x86-64 only — this is why `azd deploy web` fails on ARM aarch64 codespaces. GitHub Actions is the canonical unblock path.

### First confirmed deploy

- Run `26479487737` — ✅ success, 1m8s
- Site: `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` → HTTP 200, `text/html`
- Decision record: `.squad/decisions/inbox/parker-swa-github-actions-deploy.md`
