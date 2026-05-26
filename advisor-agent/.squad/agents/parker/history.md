# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Key Decisions & Patterns

### M0 Infrastructure Decisions

**Bicep Modules:** Six modules (cosmos, search, container-registry, monitoring, identity, foundry).  
- **Cosmos:** `disableLocalAuth: true`; all access via managed identity + data-plane RBAC  
- **Identity:** Two user-assigned identities (agentIdentity, adminIdentity) with scoped Cosmos RBAC  
- **Foundry:** Placeholder stub; M1 will author `scripts/deploy-hosted-agent.sh` via AZD predeploy hook  
- **Networking:** Public (dev posture); private endpoints deferred to prod  
- **TODO M1:** Narrow Cosmos role scope from account to container level  

**Regional Strategy:** swedencentral (compute) + westeurope (Static Web App, CDN-global resource). Both regions confirmed for all services (AI Search Basic, AOAI gpt-4.1-mini, Container Apps, Cosmos DB).

**Key IDs for reference:**
- Cosmos DB built-in role definitions: `00000000-0000-0000-0000-000000000001` (Reader), `00000000-0000-0000-0000-000000000002` (Contributor)  
- Entra app registration App ID: `4f4f4a4d-e60f-4b86-a681-86059aae4597`; Tenant: `cdfe81b5-821e-4f07-9ea7-516efc8497e4`  

### M0→M1 Dev Loop

**Local boot:** `npm install` (once) → Terminal 1: `(cd agent && npm run build && ADVISOR_DEMO_MODE=true ADVISOR_LOCAL_DEV=true node dist/index.js)` → Terminal 2: `(cd web && npm run dev)`

**Gotchas:** (1) No `dev` script in agent/ — must rebuild each time (M1 fix: Dallas adds `tsx watch`). (2) `web/tsc` inherits wrong `rootDir` from base — requires `"rootDir": "src"` override (M1 fix: Lambert). (3) `ADVISOR_DEMO_MODE=true` blocks admin routes by design.

### M0→Azure Deployment

**Container App URL:** `https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io`  
**Static Web App URL:** `https://polite-mushroom-0a09fa803.7.azurestaticapps.net`  
**Cosmos endpoint:** `https://advisor-cosmos-uwmrjzgkhs2hk.documents.azure.com:443/`  
**Search endpoint:** `https://advisor-search-uwmrjzgkhs2hk.search.windows.net`  
**AOAI endpoint:** `https://advisor-aoai-uwmrjzgkhs2hk.openai.azure.com/` (model: gpt-4.1-mini 2025-04-14)  

**Pitfalls solved:** (1) Docker build: `.dockerignore` + `COPY tsconfig.base.json`; (2) `azd deploy`: Remote build + `azd-service-name` tag on Container App; (3) gpt-4o-mini deprecated → switched to gpt-4.1-mini; (4) eastus2 AI Search quota exhausted → swedencentral available; (5) AZD predeploy hook: set `VITE_ADVISOR_DEMO_MODE=true` for web build.

### SWA GitHub Actions Deploy Pattern

**Problem:** SWA CLI binary is x86-64 only; ARM aarch64 codespace incompatible.  
**Solution:** GitHub Actions (ubuntu-latest x86-64 runner) + `Azure/static-web-apps-deploy@v1` + GitHub secrets/variables.

**Workflow (.github/workflows/deploy-web.yml, commit 868bd67):**
- Trigger: `push` to `feat-ai-decision-agent` or `main`
- Build: `npm ci && npm run build` inside `advisor-agent/web/`
- Deploy: SWA action handles `output_location: dist`
- Vite envs: Set on deploy step (not job level) for SWA action build subprocess
- GitHub Variables: `VITE_API_BASE_URL`, `VITE_ADVISOR_CLIENT_ID`, `VITE_ADVISOR_TENANT_ID`, `VITE_AZURE_REDIRECT_URI`
- GitHub Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- First run 26479487737: ✅ 1m08s, site HTTP 200

**Pattern:** GitHub Actions as deploy fallback for ARM-incompatible toolchains is reusable skill.

### Entra / Web Auth Setup

**App Registration (Phase 1 COMPLETE):**
- Redirect URIs: `http://localhost:5173` (local), `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` (deployed SWA)
- Platform: SPA (PKCE, no client secret)
- Scope: `api://4f4f4a4d-e60f-4b86-a681-86059aae4597/access_as_user`
- Permissions: Microsoft Graph `User.Read` (admin consent ✅)

**M1 Backend Auth Wiring (Dallas critical path):**
- Backend must validate token `aud` claim == `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`
- Stub location: `agent/src/auth/identity.ts` (marked "M1: JWT validation middleware")

**M1 Follow-ups:** Define `AdvisorAdmin` app role (Parker); implement JWT audience + issuer validation (Dallas).

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.

---

## Recent Sessions

**2026-05-26 M0→M1 Transition:**
- Local boot verified (commit 9250e2c)
- AZD provision & deploy (swedencentral)
- Region redeploy (eastus2 → swedencentral, commit fbf39dd)
- Entra app registration complete (parker-4)
- SWA GitHub Actions workflow deployed (commit 868bd67, run 26479487737)

**Decision records:** `.squad/decisions.md` entries parker-bicep-modules, parker-m0-verification-complete, parker-azd-deploy-partial-green, parker-region-redeploy, parker-entra-and-web-deploy, parker-swa-github-actions-deploy (merged 2026-05-26T22:54:00Z)

**2026-05-26 M1 Infra Run (parker-m1-infra-roles-search-embedding):**
- **AdvisorAdmin app role** added to `advisor-agent-web` (appId `4f4f4a4d-...`); SP created (id `2f3a486a-...`); role assigned to Ha Duong (oid `3cff1542-...`) via Graph `appRoleAssignments`. Role id: `d64375c5-5a38-41a3-9f36-f68f8a4c2674`. Manifest at `infra/app-roles.json`.
- **`system-inventory-v1` AI Search index** provisioned (HTTP 201) against `advisor-search-uwmrjzgkhs2hk` from `advisor-agent/data/system-inventory-v1-index.json` (Ripley's design). Index re-PUT (HTTP 204) with `vectorizers` block after AOAI deployment landed. `Search Index Data Contributor` granted to `advisor-agent-identity` (principalId `c8c13fe3-...`).
- **`text-embedding-3-small`** deployed to `advisor-aoai-uwmrjzgkhs2hk` (GlobalStandard SKU, 10K TPM, `provisioningState: Succeeded`). Note: Standard SKU not available for this model in swedencentral — GlobalStandard required. Bicep module `infra/modules/aoai.bicep` updated with `embeddingDeployment` resource + output.
- **Decision files written:** `parker-m1-infra-roles-search-embedding.md`, `parker-aoai-embedding-deploy.md` (inbox).
- No permissions blockers encountered.

