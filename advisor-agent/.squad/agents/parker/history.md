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
