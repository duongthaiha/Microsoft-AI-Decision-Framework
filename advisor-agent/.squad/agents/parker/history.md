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

**2026-05-27 Cosmos Data-Plane RBAC Fix (parker-cosmos-data-plane-rbac):**
- **Issue:** Dallas's CosmosSessionStore + CosmosRequestStore hitting 403 on first write. Agent MI lacked Cosmos **data-plane** RBAC role (not control-plane).
- **THE GOTCHA:** Azure RBAC (control-plane) ≠ Cosmos DB RBAC (data-plane). `az role assignment create --role "Cosmos DB Contributor"` grants account management but NOT SDK read/write. Must use `az cosmosdb sql role assignment create` (data-plane). This is the #1 pit in Cosmos security.
- **Fix:** Assigned `Cosmos DB Built-in Data Contributor` (GUID `00000000-0000-0000-0000-000000000002`, scope `/`) to agent MI (`c8c13fe3-...`) via CLI. Role assignment created (ID: `2029d58b-...`).
- **Codification:** Already in Bicep (`infra/modules/identity.bicep` line 150 `agentCosmosContributor`). Future `azd up` will auto-create it.
- **Verification:** Run `az cosmosdb sql role assignment list --account-name advisor-cosmos-uwmrjzgkhs2hk -g rg-advisor-dev` — agent MI now appears.
- **Next:** Dallas restarts Container App revision; tests `/v1/responses` write → should get 201 instead of 403.
- **M2:** Narrow scope from account (`/`) to database or container level.
- **Decision file:** `parker-cosmos-data-plane-rbac.md` (inbox).


---

## M2 Observability + Foundry Hosted Agent — 2026-05-27T07:00:00Z

### EPIC 1 — Application Insights ✅ Shipped

**Finding:** `infra/modules/monitoring.bicep` already had Log Analytics + App Insights workspace-based correctly wired. `main.bicep` already passed `appInsightsConnectionString` to container-apps.bicep as `APPLICATIONINSIGHTS_CONNECTION_STRING`. Only minor enhancements needed.

**Changes delivered:**
- `infra/modules/monitoring.bicep` — added `instrumentationKey` output (App Insights iKey, required by some SDK consumers)
- `agent/` — installed `applicationinsights@^2.9.8` (resolved from `^2.9.5`)
- `agent/src/index.ts` — App Insights import + `setup().setAutoCollectConsole(true,true).setAutoDependencyCorrelation(true).start()` at top, guarded on `APPLICATIONINSIGHTS_CONNECTION_STRING` env var
- `agent/src/adapter/responses.ts` — `requestProcessed` custom event via `appInsights.defaultClient?.trackEvent(...)` after each reasoning loop completion. Properties: `{ requestId, sessionId, durationMs, toolsInvoked, finalGrouping, finalTech }`
- All 20 tests pass. TypeScript build clean.

**GUARDRAILS RESPECTED:** CORS middleware order untouched (Dallas's fix). `jwt-middleware.ts` untouched. Responses.ts reasoning logic untouched (only additive trackEvent).

**Portal verification KQL:**
```kusto
customEvents | where name == "requestProcessed" | project timestamp, customDimensions | order by timestamp desc | take 20
requests | where url contains "/v1/responses" | project timestamp, duration, resultCode | order by timestamp desc | take 20
```

### EPIC 2 — Foundry Hosted Agent Registration 🟡 M2.1 Blocked

**Key Research Finding:** Foundry Hosted Agent is a container hosting service (not an endpoint registry). To register, you give Foundry a container image; it provisions a sandbox with a dedicated Entra agent identity. Our `/v1/responses` Express route does NOT satisfy the `azure-ai-agentserver-responses` protocol library contract that Foundry requires.

**Three blockers:**
1. No Foundry project provisioned (`Microsoft.CognitiveServices/accounts` kind=AIServices + project child resource)
2. Container doesn't implement Foundry protocol library (no Node.js library published as of 2026-05-27)
3. No Bicep resource type for agent version registration (Preview only, Python SDK / REST only)

**Delivered:**
- `scripts/register-foundry-agent.sh` — reference registration script (Python SDK, safe no-op if env vars missing)
- `docs/m2-foundry-hosted-agent.md` — full M2.1 handoff document with Bicep snippets, RBAC commands, step-by-step unblocking plan
- `.squad/decisions/inbox/parker-foundry-hosted-agent-blocker.md` — blocker decision record

**Decisions files:** `parker-m2-observability-foundry.md`, `parker-foundry-hosted-agent-blocker.md` (inbox)

---

## 2026-05-27 — JWT Middleware Update (Cross-agent note)

**From Dallas:** JWT middleware now accepts **both v1 and v2 Entra token issuers**. If your infrastructure work involves token validation, auth proxy configuration, or Entra integration testing, be aware that the backend middleware accepts either issuer format (`login.microsoftonline.com/{tenantId}/v2.0` and `sts.windows.net/{tenantId}/`). This is a defensive pattern that maintains the audience + issuer validation security model. Do not re-introduce strict v2-only validation in future work. See decision `dallas-v2-token-fix`.

---

## 2026-05-27 — Entra Application ID URI Configuration (Open Task)

**From Dallas:** JWT audience validation now accepts both audience forms:
- Proper form: `api://4f4f4a4d-e60f-4b86-a681-86059aae4597` (with `api://` prefix)
- Bare GUID: `4f4f4a4d-e60f-4b86-a681-86059aae4597` (safety net)

**📌 ACTION REQUIRED:** Configure Entra app's **Application ID URI** to close the audience gap:
1. Portal → App registrations → `4f4f4a4d-e60f-4b86-a681-86059aae4597` → Expose an API
2. Edit **Application ID URI** to `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`
3. Save

**Why:** Once this is done, all new tokens will carry the proper `api://` form as `aud` claim. The bare-GUID acceptance in middleware becomes a silent safety net (not the primary path).

**Context:** Persistent 401 errors were caused by Entra issuing tokens with bare GUID `aud` instead of `api://` form. Middleware fix deployed to revision `advisor-agent-app--azd-1779868342` (34/34 tests pass), but the root fix (Application ID URI setting) closes the gap permanently.

See decision record: `dallas-401-deep-dive-audience-fix` in decisions.md

---

## 2026-05-27T10:30:00Z — Private Networking (VNet + Private Endpoints)

**Trigger:** Azure Policy auto-remediates Cosmos DB `publicNetworkAccess` to `Disabled` periodically. Ha flagged this after Dallas's band-aid (`az cosmosdb update --public-network-access Enabled`) would be reverted again.

**Solution:** Worked WITH the policy. Architecture: VNet (`10.0.0.0/22`) + `aca-subnet` (/23, delegated `Microsoft.App/environments`) + `pe-subnet` (/27) → Container Apps Environment VNet-integrated → Cosmos + Search private endpoints.

**Implemented:**
- `infra/modules/vnet.bicep` — new VNet module
- `infra/modules/private-endpoint.bicep` — generic PE + DNS zone + VNet link module
- `infra/modules/container-apps.bicep` — added `infrastructureSubnetId` param + `vnetConfiguration` for CAE
- `infra/modules/cosmos.bicep` — default `publicNetworkAccess` changed to `'Disabled'`
- `infra/main.bicep` — wired vnet + PE modules; `publicNetworking` default = `false`
- `infra/main.parameters.json` — `publicNetworking: false`
- `azure.yaml` — added `preprovision` hook (one-time CAE migration)
- `scripts/pre-provision.sh` — deletes old Consumption CAE (Azure blocks VNet config update on existing env)
- `scripts/post-deploy-smoke.sh` — 4-check smoke test; 4/4 PASS

**Deployed:** `az deployment group create` to `rg-advisor-dev`, provision succeeded. New CAE: `advisor-cae-vnet-uwmrjzgkhs2hk`. New FQDN: `advisor-agent-app.delightfulsea-3191f7a0.swedencentral.azurecontainerapps.io`.

**Verified:** Cosmos `publicNetworkAccess == Disabled`, 1 Approved PE, `/health` 200, smoke test 4/4.

**⚠ Action required:** Update `VITE_API_BASE_URL` GitHub variable to new FQDN (old `wittysea-86254dbc` FQDN is gone). SWA→API calls will 404 until updated.

**Decision file:** `parker-private-networking.md` (inbox)

**Previous open task — Entra Application ID URI (`api://4f4f4a4d-...`):** Still open. Not addressed this session. Tracked in history entry above and in `parker-private-networking.md` follow-ups table.



---

### 2026-05-27 — Private Networking & Wave-1 Infrastructure Fix (Archived to decisions.md)

Permanent private networking solution (VNet 10.0.0.0/22, private endpoints, policy-aligned Cosmos config, new CAE) has been archived to `.squad/decisions.md::parker-private-networking` for future infrastructure decisions and M3 follow-ups (AOAI PE, ACR Premium). CAE migration broke FQDN — VITE_API_BASE_URL updated by Coordinator.

---

## 2026-05-27T10:45:28Z — M2 Observability Wiring

## Learnings

### App Insights Wiring Approach
Infra was already correct from M0/M1: `infra/modules/monitoring.bicep` had workspace-based App Insights + Log Analytics; `container-apps.bicep` already injected `APPLICATIONINSIGHTS_CONNECTION_STRING`. Zero Bicep changes needed for M2 observability.

### OTel Package Choice
Migrated from `applicationinsights@^2.9.8` (classic SDK) to `@azure/monitor-opentelemetry@^1.18.0` (OTel distro) + `@opentelemetry/api@^1.9.1`. The distro is the Microsoft-recommended path — auto-instruments Express, outbound HTTP, and Node.js core with zero per-call code.

**Critical gotcha:** `useAzureMonitor()` must be called BEFORE importing Express and any instrumented SDK. In ESM projects, a dedicated `src/telemetry/otel.ts` module that is imported first (with `initTelemetry()` called at the very top of `index.ts`) is the clean pattern. This is the ESM equivalent of `applicationinsights.setup().start()` at CJS file top.

### Custom Events vs Custom Metrics in OTel
`@azure/monitor-opentelemetry` does NOT expose `TelemetryClient.trackEvent()`. Custom events are emitted as OTel spans (`kind: INTERNAL`) which appear in App Insights `dependencies` table (queryable by span name). Custom metrics use the `@opentelemetry/api` Meter API and appear in `customMetrics`. Adjusted KQL queries to use `dependencies` instead of `customEvents`.

### Token Usage Collection
`AdvisorLoopResult.tokenUsage` added — accumulates prompt/completion tokens across all agentic loop iterations. Available in non-streaming (batch) path only. Streaming path does not return per-iteration usage (AOAI requires `stream_options: { include_usage: true }` — deferred to M3).

### Structured Logging Pattern
Request-context middleware (`src/middleware/request-context.ts`) assigns UUID `requestId` per request, propagates it via `X-Request-Id` header, and emits a JSON log line to stdout on response finish. Log Analytics (via CAE stdout ingestion) captures these. Field schema: `event`, `requestId`, `method`, `route`, `status`, `latencyMs`, `userId` (Entra OID).

### Smoke Check
`scripts/post-deploy-smoke.sh` Check 6 added: queries ACA active revision env vars via `az containerapp revision list` to assert `APPLICATIONINSIGHTS_CONNECTION_STRING` is set. Catches silent telemetry failures from missed `azd deploy`.

**Files changed:** `agent/package.json`, `agent/src/index.ts`, `agent/src/adapter/responses.ts`, `agent/src/admin/admin-api.ts`, `agent/src/framework/advisor-loop.ts`, `scripts/post-deploy-smoke.sh`  
**Files created:** `agent/src/telemetry/otel.ts`, `agent/src/middleware/request-context.ts`, `agent/src/__tests__/observability.test.ts`, `.squad/decisions/inbox/parker-observability.md`, `.squad/skills/azure-monitor-otel-node/SKILL.md`  
**Test result:** 48/48 pass (34 existing + 4 new observability tests)
