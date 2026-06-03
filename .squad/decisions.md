# Squad Decisions

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

---


# ADR: Cosmos DB and Azure AI Search Data Model for `@advisor/data`

**Status:** Proposed  
**Date:** 2026-05-29  
**Author:** Switch (Data Engineer Agent)  
**Reviewers:** Tank (Composition Root), Anchor (API Contract)

---

## Context

The `@advisor/data` workspace needs to persist advisor sessions and guidance, and enable similar-project search and framework content retrieval. This ADR documents the data model and index design decisions.

---

## Cosmos DB Design

### Sessions Container

| Property | Value |
|---|---|
| Container ID | `sessions` |
| Partition key | `/customerOrganizationId` |
| Document `id` | `sessionId` (duplicated for Cosmos `id` field) |
| TTL | `-1` on container (no automatic expiry); per-document `ttl` field honored if `AdvisorSession.ttlSeconds` is set |

**Why partition by `customerOrganizationId`?**  
All session queries that know the org can use single-partition reads (fast, cheap). The only cross-partition query is `loadSession(sessionId)` which searches by `sessionId` alone — acceptable for POC; can be mitigated with a session registry pattern if scale requires it.

**Why not a separate `feedback` container?**  
`ProjectFeedback` is small (3 fields) and tightly coupled to the session lifecycle. Storing it as an optional field on the session document avoids a second round-trip for the common read pattern (load session + check feedback). The trade-off is that feedback is not independently queryable without scanning sessions — acceptable for POC.

### Guidance Container

| Property | Value |
|---|---|
| Container ID | `guidance` |
| Partition key | `/customerOrganizationId` |
| Document `id` | `guidanceId` |
| TTL | None |

`CustomerGuidanceDocument` records are org-scoped and infrequently updated. Partitioning by org aligns with the access pattern (load all guidance for a customer before a session).

---

## Azure AI Search Index Design

### `project-knowledge` Index

**Semantic config name:** `project-semantic`  
**Title field:** `title`  
**Content fields:** `searchableText`, `summary`  
**Keywords fields:** `useCaseTags`, `technologyTags`

**Flat document shape (no nested complex types):**  
`SimilarProjectSignals` (5 nested fields) is flattened to top-level fields (`interactionPattern`, `proactivity`, `dataPattern`, `actionSafety`, `governancePattern`). This simplifies OData filter expressions and avoids Azure AI Search's complex-type query syntax.

**`searchableText` field:**  
A denormalized blob of the most search-relevant content. Populated at index time from `ProjectKnowledgeDocument.searchableText`. This gives BM25 a single high-signal field to rank on, avoiding score dilution across many low-weight fields.

**Minimum score threshold (default 0.5):**  
BM25 scores are unbounded. Results below `minimumScore` are dropped and a `NoMatchFound` is returned with an honest reason string. This prevents the agent from surfacing a low-relevance match as a "similar project."

### `framework-content` Index

**Semantic config name:** `framework-semantic`  
**Title field:** `sectionHeading`  
**Content fields:** `content`  
**Keywords fields:** `phase`

Framework content is chunked by heading (H1/H2/H3) by `FrameworkContentIndexer`. Chunk size cap: 2,000 characters. The `phase` field enables the agent to scope retrieval to the current conversation phase.

**Local fallback:**  
`AzureAiSearchFrameworkRetrieval` loads local `.md` reference files as a fallback when Azure Search is unavailable — mirrors `InMemoryFrameworkRetrieval` so offline mode is never degraded.

---

## Alternatives Considered

### Separate feedback container
Rejected for POC: adds a second container and a second read per session load. Revisit if feedback analytics become a requirement.

### Complex-type fields for `SimilarProjectSignals`
Rejected: Azure AI Search OData filter syntax for nested fields is verbose and error-prone. Flat fields are simpler to query and index.

### Storing framework docs in Cosmos instead of Search
Rejected: Azure AI Search's BM25 + semantic reranking is a better fit for unstructured text retrieval than Cosmos SQL queries. Framework content is read-heavy and never mutated during a session.

### Using vector search fields
Deferred: vector embeddings would improve retrieval quality but require an Azure OpenAI embedding endpoint and add significant complexity. BM25 + semantic reranking is the right starting point for a POC.

---

# Infra / azd Decisions — AI Framework Advisor Agent POC

_Author: Dozer (DevOps)_  
_Date: 2026-05-29_  
_Status: Decisions recorded; open items flagged for Ghost (Security)_

---

## Decisions Made

### D-INFRA-01: Bicep scope — Subscription

**Decision:** `main.bicep` uses `targetScope = 'subscription'` and creates the resource group via a `Microsoft.Resources/resourceGroups` resource. Modules are deployed with `scope: rg`.

**Why:** azd's convention for clean environment tear-down requires owning the resource group in the Bicep. Subscription scope lets `azd down` delete the entire RG in one pass.

**Alternative rejected:** Resource group scope (pre-created RG) — harder to tear down cleanly in a POC.

---

### D-INFRA-02: Private networking — VNet 10.0.0.0/16, two subnets

**Decision:**
- ACA subnet: `10.0.0.0/23` (delegated to `Microsoft.App/environments`)
- Private endpoint subnet: `10.0.4.0/24` (PE network policies disabled)

**Why:** ACA Consumption profile requires minimum `/23`. Private endpoints require PE network policies disabled on their subnet. Two subnets cleanly separate workload from PE traffic.

---

### D-INFRA-03: Container Apps environment — VNet-integrated, not internal

**Decision:** `acaEnvironment.properties.vnetConfiguration.internal = false`

**Why:** `internal: true` would make the environment itself private, requiring a load balancer in the VNet for inbound traffic. For the POC, the app tier is intentionally public (AD-07). VNet integration is still required for outbound private connectivity to Cosmos DB and AI Search.

---

### D-INFRA-04: Cosmos DB — Serverless SKU for POC

**Decision:** `EnableServerless` capability enabled.

**Why:** No provisioned RU/s cost for a POC with low, bursty traffic. Switch to Provisioned (or Autoscale) for production.

**Trade-off:** Serverless has a per-request cost ceiling and higher latency under burst. Accept for POC.

---

### D-INFRA-05: AI Search — Basic SKU for POC

**Decision:** `sku.name: 'basic'`

**Why:** Basic is the lowest SKU that supports private endpoints. Free tier does not support private endpoints. Switch to Standard for production with SLA requirements.

---

### D-INFRA-06: ACR — public access, no private endpoint

**Decision:** ACR has `publicNetworkAccess: 'Enabled'`. No private endpoint for ACR.

**Why:** Container Apps (Consumption tier) pulls images over the internet. Adding ACR private endpoint requires a dedicated PE in the VNet and DNS zone, which adds cost and complexity for no material security gain in a POC (images are not sensitive data).

**Risk:** Accepted for POC. In production, scope ACR access with IP rules or PE.

---

### D-INFRA-07: Cosmos DB RBAC — data-plane role in cosmosdb.bicep, not roleassignments.bicep

**Decision:** Cosmos DB Built-in Data Contributor (`sqlRoleAssignments`) is assigned inside `cosmosdb.bicep` directly on the account resource.

**Why:** Cosmos DB data-plane RBAC uses `Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments`, not ARM RBAC. It requires the Cosmos DB account ID to construct the `roleDefinitionId`. Keeping it in `cosmosdb.bicep` keeps the dependency clear and avoids passing the account ID to a separate module just for this assignment.

---

### D-INFRA-08: azd service tag — `azd-service-name: api`

**Decision:** Container App is tagged with `{ 'azd-service-name': 'api' }` matching the service name in `azure.yaml`.

**Why:** azd uses this tag to locate the Container App to update on `azd deploy`. Without it, azd cannot resolve which Container App to push the new image to.

---

## Open Items for Ghost (Security)

### OPEN-SEC-01: Developer access path to private data services

**Context:** Cosmos DB, AI Search, and Key Vault have `publicNetworkAccess: 'Disabled'`. Developers cannot query these services from their laptops.

**Options (not decided):**

| Option | Notes |
|---|---|
| VPN Gateway (Point-to-Site) | ~$30/month; good UX after setup |
| Jumpbox VM in pe-subnet | ~$35/month; standard enterprise pattern |
| Azure Bastion | ~$140/month; highest security |
| Dev Tunnel (`azd tunnel`) | Free; acceptable for POC; not for production |
| Temporary public access exception | Avoid; defeats private-endpoint model |

**Ghost to decide:** Which path is acceptable for the POC developer team and document the exception policy if a temporary option is chosen.

---

### OPEN-SEC-02: Key Vault secrets rotation

**Context:** Key Vault is provisioned with soft-delete and purge protection. No secrets are currently stored (all config is endpoint URLs, not keys). When secrets are added (e.g., GITHUB_TOKEN for Copilot SDK in `copilot` mode), rotation policy needs to be defined.

**Ghost to decide:**
- Rotation trigger (expiry-based event via Event Grid → Logic App → re-provision)
- Which secrets belong in Key Vault vs managed platform config (ACA secrets)
- Audit log retention policy for Key Vault

---

### OPEN-SEC-03: Entra External ID auth (AD-06)

**Context:** AD-06 deferred auth to post-Wave 1. The API is currently unauthenticated.

**Ghost to design:**
- Entra External ID tenant configuration
- Customer org ID claim binding
- Admin vs customer-user role claim structure
- API auth middleware wiring (Tank implements once Ghost approves model)

---

### OPEN-SEC-04: API Management consideration (AD-07 open question)

**Context:** AD-07 leaves APIM as an open question for rate limiting and auth before external demo.

**Ghost to decide:** Whether APIM is required before the first external demo or whether Container Apps built-in auth (Dapr-style) and rate limiting are sufficient.

---

## Known Issues Resolved

**cosmosdb.bicep duplicate `capabilities` block** — Fixed at authoring time. Single `capabilities: [{ name: 'EnableServerless' }]` block is in place.

---

# Architecture Foundation Decisions

**Filed by:** Trinity (Lead/Architect)
**Date:** 2026-05-29
**Wave:** 1 — Foundation scaffold

---

## Decision 1: Stack — Node.js 20 + TypeScript strict, Express API

**What:** The advisor stack is Node.js 20 + TypeScript 5.5 with strict mode (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`). Express 4 is the HTTP layer for `@advisor/api`.

**Why:** Node.js 20 is LTS, well-supported in Azure Container Apps, and a natural fit for the GitHub Copilot SDK. TypeScript strict mode catches contract drift at compile time — essential for a multi-team POC where Tank, Switch, Mouse, and Apoc all consume `@advisor/shared`. Express is the simplest zero-config HTTP layer for a headless API proof of concept.

---

## Decision 2: npm Workspaces with four packages (shared, api, cli, web)

**What:** The `agents/advisor/` root uses npm workspaces: `shared`, `api`, `cli`, `web`. Build order is `shared → api → cli` (web is a placeholder). TypeScript project references (`composite: true`) enforce this ordering.

**Why:** Workspaces give each team member (Tank, Mouse, Apoc, Switch) a clean, bounded surface. `@advisor/shared` is the single source of truth for contracts — no copy-paste types between packages. Project references mean `tsc --build` respects dependencies and avoids redundant recompilation.

---

## Decision 3: All shared contracts in `@advisor/shared`

**What:** Every TypeScript interface, type, enum, and Zod validator used by more than one workspace lives in `@advisor/shared`. The other workspaces (`api`, `cli`, `web`) import from `@advisor/shared` and never re-define types locally.

**Why:** Prevents contract drift. If the `RecommendationOutput` shape changes, one file changes and all consumers see the error at compile time. The alternative (each workspace defining its own types) is how data contracts rot silently across a multi-team POC.

---

## Decision 4: External dependencies abstracted behind interfaces

**What:** GitHub Copilot SDK, Cosmos DB, and Azure AI Search are each abstracted behind TypeScript interfaces (`ICopilotSessionService`, `IConversationStore`, `IGuidanceStore`, `IProjectSearchService`). Mock/in-memory implementations are used locally; real Azure adapters are added by Tank and Switch later.

**Why:** The backlog explicitly requires "headless-first and CLI-testable without live Azure." Interface abstraction is the only way to honour this while keeping the codebase production-shaped. It also means Apoc can write regression tests against mock implementations without Azure credentials.

---

## Decision 5: App hosting — Azure Container Apps

**What:** `@advisor/api` targets Azure Container Apps. `@advisor/web` targets Container Apps or Static Web Apps (Mouse to decide based on framework choice).

**Why:** Container Apps supports scale-to-zero (POC cost control), managed identity for private data-service access, and VNet integration for private endpoint connectivity to Cosmos DB and Azure AI Search. It aligns with the Bicep + azd guardrail.

---

## Decision 6: Auth — Entra External ID, deferred implementation

**What:** Entra External ID is the chosen auth provider for customer-facing users. Admin endpoints require an elevated org-admin role. Implementation is deferred beyond Wave 1.

**Why:** The auth decision is made now to avoid re-architecting later (session partition key model, org-scoping, Entra claims). However, implementing full CIAM auth before the headless agent is validated adds risk and delay. A static API key or unauthenticated local mode is acceptable for Wave 1 CLI testing.

---

## Decision 7: Cosmos DB responsibility — sessions, guidance, NOT project search

**What:** Cosmos DB stores `AdvisorSession` (conversation + recommendation state) and `CustomerGuidanceDocument` (per-org custom instructions + organization context). It does NOT store the project knowledge index. `organizationContext` sits at the **same level** as `instructions[]` in the guidance document.

**Why:** Cosmos DB is the right store for mutable session state (conversation turns, captured facts, readiness state) and per-org durable configuration (instructions). Azure AI Search is the right store for searchable project knowledge. Keeping these non-overlapping prevents a design where Cosmos DB is queried for full-text similarity search, which it is not optimized for.

---

## Decision 8: Azure AI Search responsibility — project knowledge ONLY

**What:** Azure AI Search stores `ProjectKnowledgeDocument` projections for similar-project lookup. It does NOT store session state, conversation history, or custom instructions.

**Why:** Hybrid (keyword + vector) search over structured tags and free-text is Azure AI Search's purpose. Keeping its responsibility to project lookup prevents the index from becoming a mirror of Cosmos DB content.

---

## Decision 9: CLI harness calls the API over HTTP

**What:** `@advisor/cli` calls `@advisor/api` over HTTP. It does not import agent logic, SDK sessions, or data adapters directly.

**Why:** The CLI tests the same code path a front end uses. This means CLI validation proves the API contract, not just the business logic in isolation. Apoc's regression scenarios run against the same API surface.

---

## Decision 10: `ProjectCase.similarProjectSearch` shape

**What:** The `similarProjectSearch` field on `ProjectCase` uses a union type: either an array of `SimilarProjectMatch` entries or an explicit `NoMatchFound` object (`{ noMatchFound: true, reason: string }`). An empty array is not a valid "no match" representation.

**Why:** Silent empty arrays hide the distinction between "search ran and found nothing useful" and "search did not run." The backlog explicitly requires the advisor to "state that no useful match was found" — a typed `NoMatchFound` object enforces this at the contract level.

---

# Tester Findings — Eval & Regression Infrastructure

**Author:** Apoc (QA/Tester)
**Date:** 2026-05-29
**Sprint:** 1 — Test infrastructure build-out
**Status:** Ready for review

---

## Defect D1 — InMemoryProjectSearch minimum score prevents true "no match"

**Severity:** Medium
**Affects:** `api/src/adapters/inmemory/InMemoryProjectSearch.ts`

The seed data scoring formula `Math.max(project.score * 0.5, project.score * 0.6)` means the top seed (score = 0.86) has a minimum of 0.516, which always exceeds the 0.5 threshold. This means the default `InMemoryProjectSearch` **always** returns the insurance guidance project for ANY query — there is no code path that returns `noMatchFound: true` with the current seeds.

**Impact:** The `no-similar-match` eval case cannot exercise the honest "we have no similar project" path using the default adapter. The workaround (`NoMatchProjectSearch` in `eval/evalFactory.ts`) artificially forces the no-match result.

**Recommendation:** Lower the scoring threshold to e.g. 0.7, or add a dynamic threshold based on the query type so that clearly unrelated queries (e.g. an IoT sensor use case vs. insurance claims guidance) return `noMatchFound: true` naturally.

---

## Gap G1 — Mock agent ignores Q8 (team_skills) in recommendation

**Severity:** Medium
**Affects:** `api/src/agent/AgentOrchestrator.ts` — `buildRecommendationOutput()`
**Documented in:** `eval/cases/healthcare-minimal.ts` `advisoryNote`

The mock agent always recommends Copilot Studio as the primary technology regardless of `user_experience_level` or `team_skills` (Phase 2 Q8). A pro-code engineering team gets the same recommendation as a maker/low-code team.

**Impact:** The healthcare pro-code eval case passes but only because the expected values were calibrated to the actual (non-ideal) mock output. In a real deployment, this would guide a pro-code team away from Azure Foundry / M365 Agents SDK unnecessarily.

**Recommendation:** In Wave 3, read Q8 `team_skills` evidence from the conversation capture and branch the recommendation: low-code → Copilot Studio primary; pro-code → Azure Foundry / M365 Agents SDK primary; mixed → Copilot Studio + Foundry.

---


---

# Deployment Decision Record — advisor-poc

**Author:** Dozer (DevOps)  
**Date:** 2026-05-29T18:44:22+01:00  
**Env:** advisor-poc  
**Region:** swedencentral  
**Subscription:** 3d2c527a-481d-4e13-b3a1-637924b33343 (MCAP managed env)  
**Resource group:** rg-advisor-advisor-poc  
**Status:** ✅ DEPLOYED AND VALIDATED

---

## 1. Region Choice — Why swedencentral, Not eastus2

**Planned region:** `eastus2` (per preflight recommendation)  
**Actual region:** `swedencentral`

**Root cause of switch:**

Deployment history reveals three attempts:

| Deployment name | Region | Outcome | Time |
|---|---|---|---|
| advisor-poc-1780071275 | eastus2 | **FAILED** | 2026-05-29T16:24 UTC |
| advisor-poc-1780072974 | eastus2 | Succeeded (empty outputs) | 2026-05-29T16:42 UTC |
| advisor-poc-1780073009 | swedencentral | **Succeeded — LIVE** | 2026-05-29T17:02 UTC |

The first eastus2 attempt failed with HTTP 409 `Conflict` on the `Microsoft.Search/searchServices`
module. AI Search service names are **globally unique**. A prior partial deployment or test run had
left a Search resource in the same name space (`srch-advisor-<token>`) in a "Deleting" state,
causing the conflict. Quota was NOT the cause — eastus2 shows 0/12 Basic quota used at time of
writing.

After the conflict, the coordinator changed `AZURE_LOCATION` to `swedencentral` where no naming
conflict existed. The second eastus2 deployment that "succeeded" had empty outputs — likely an
infra-only partial run without app configuration. The swedencentral run completed cleanly with all
outputs populated.

**EU data residency:** swedencentral is an acceptable choice for POC purposes; for production
it provides EU data residency (Sweden) which aligns with typical enterprise compliance posture.

---

## 2. Final URLs and Resource Inventory

| Resource | Name | Status |
|---|---|---|
| Container App | `ca-advisor-33wfyfewrvjcg` | Running |
| **Public FQDN** | `https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io` | ✅ Healthy |
| Active revision | `ca-advisor-33wfyfewrvjcg--azd-1780075724` | Running |
| Container image | `acradvisor33wfyfewrvjcg.azurecr.io/advisor/api-advisor-poc:azd-deploy-1780074268` | — |
| Cosmos DB | `cosmos-advisor-33wfyfewrvjcg` | Succeeded, public=Disabled |
| AI Search | `srch-advisor-33wfyfewrvjcg` | running, public=Disabled |
| Key Vault | `kv-33wfyfewrvjcg` | — |
| Managed identity | `id-advisor-33wfyfewrvjcg` | clientId=e7054a1b-5533-4293-89a7-e9b4fb0a8abd |
| Container Registry | `acradvisor33wfyfewrvjcg` | — |
| Log Analytics | `log-advisor-33wfyfewrvjcg` | workspaceId=32f76c79-31b5-4f70-aaac-aa15e5a2ae51 |
| App Insights | `appi-advisor-33wfyfewrvjcg` | Succeeded |
| VNet | present | 10.0.0.0/16 + ACA subnet + PE subnet |

---

## 3. Adapter Mode — Confirmed

**Key finding:** `ADVISOR_AGENT_MODE=mock` in the azd env does NOT mean mock adapters are active.
The composition root (`composition.ts`) uses TWO independent flags:

- `ADVISOR_AGENT_MODE` → controls the **LLM/Copilot service** only (mock vs real Copilot SDK)
- `COSMOS_ENDPOINT` + `SEARCH_ENDPOINT` presence → controls the **data adapters** (in-memory vs real Azure)

Since both endpoints are injected by Bicep, the container boots into:

```
Data layer:   REAL Azure adapters (CosmosConversationStore + CosmosGuidanceStore + AzureAiSearchProjectSearch)
LLM layer:    MockCopilotSessionService (deterministic, no external LLM calls)
```

Startup logs confirm:
```json
{"level":"INFO","message":"COSMOS_ENDPOINT + SEARCH_ENDPOINT detected — using real Azure adapters"}
{"level":"INFO","message":"Azure adapters initialised"}
{"level":"INFO","message":"Using MockCopilotSessionService (deterministic, no LLM)"}
{"level":"INFO","message":"@advisor/api listening on port 3000"}
```

**To enable real LLM:** set `ADVISOR_AGENT_MODE=copilot` and inject `GITHUB_TOKEN` or
`COPILOT_TOKEN` into the container. This is a deferred POC step.

---

## 4. Validation Outcomes

### 4.1 API Health
| Check | Result | Detail |
|---|---|---|
| `GET /health` | ✅ HTTP 200 | `{"ok":true,"service":"@advisor/api"}` in 1.86s |
| CORS header | ✅ Present | `Access-Control-Allow-Origin: *` |
| Ingress | ✅ External | targetPort=3000, HTTP, external=true |

### 4.2 Cosmos DB — Private Endpoint Connectivity
| Check | Result | Detail |
|---|---|---|
| Service state | ✅ | `provisioningState: Succeeded`, `publicNetworkAccess: Disabled` |
| `sessions` container exists | ✅ | TTL=-1 (items expire only with per-item TTL) |
| `guidance` container exists | ✅ | No TTL (guidance is persistent) |
| Container can create sessions | ✅ PROVEN | `POST /sessions` → HTTP 201, sessionId returned |
| Container can write + read back | ✅ PROVEN | `POST /sessions/:id/intake` → HTTP 200, agent turn returned (requires Cosmos read+write) |
| **Private endpoint reachable from ACA** | ✅ PROVEN | Live session data flowing through private endpoint |

### 4.3 AI Search — Private Endpoint Connectivity
| Check | Result | Detail |
|---|---|---|
| Service state | ✅ | `provisioningState: succeeded`, `status: running`, `publicNetworkAccess: Disabled` |
| **Private endpoint reachable from ACA** | ✅ PROVEN | Container returned `RestError: The index 'advisor-project-knowledge' was not found` — this is an **application-level** 404 from the Search API, proving the VNet+private endpoint path is working. A network failure would produce a connection error, not an index-not-found response. |
| Index `advisor-project-knowledge` exists | ❌ NOT SEEDED | Index does not exist yet — see POC limitations |
| Index `framework-content` exists | ❌ NOT SEEDED | Index does not exist yet |

### 4.4 Application Insights / Log Analytics
| Check | Result | Detail |
|---|---|---|
| App Insights resource | ✅ | `provisioningState: Succeeded`, instrumentation key present |
| Log Analytics receiving telemetry | ✅ | 5 container log records at 17:57, 3 at 17:52, 5 at 17:46 |
| Connection string in container env | ✅ | `APPLICATIONINSIGHTS_CONNECTION_STRING` injected |

### 4.5 Cold-Start Diagnosis
| Finding | Detail |
|---|---|
| `min-replicas` | 0 (scale-to-zero) |
| `restartCount` | 0 (no crash loops) |
| Container started | 2026-05-29T17:46:21 UTC |
| Coordinator health timeout | Was during a cold start period (container was idle, first request triggered scale-up) |
| Fix applied | None needed — cold start is expected at min-replicas=0 |

**Recommendation:** For demos or load testing, set `min-replicas=1` to eliminate cold starts.
For POC cost control, 0 is acceptable.

---

## 5. Fixes Applied

None required. The deployment was valid as-is:
- Adapter mode is correctly wired (real Azure data + mock LLM)
- No container env vars were changed
- No redeploy was triggered

---

## 6. Known POC Limitations

| Limitation | Impact | Resolution path |
|---|---|---|
| AI Search indexes not seeded | `GET /similar-projects` returns 500 (Search_FAILURE) | Run `data` workspace seed job: `cd agents/advisor && npm run seed` (pending Wave 3) |
| MockCopilotSessionService | No real LLM reasoning — deterministic responses | Set `ADVISOR_AGENT_MODE=copilot` + inject `GITHUB_TOKEN` |
| `min-replicas=0` | Cold starts (30-60s on first request after idle) | Set `min-replicas=1` for demos |
| No authentication gate | API is public, no bearer token/APIM guard | Deferred per Ghost (AD-06, AD-07) |
| Cosmos TTL=-1 on sessions | Sessions persist indefinitely unless items set TTL | Set `defaultTtl` to positive value (e.g. 604800 = 7 days) in Wave 3 |
| East US 2 resource orphan risk | Partially created eastus2 resources (deployment 1780072974) may still exist | Verify no eastus2 orphan RG exists; if so, clean up manually |
| No APIM | Direct ACA ingress, no API gateway layer | Deferred per AD-07 |

---

## 7. Next Steps for Team

- **Tank / Researcher**: Implement and run the data seed job to populate `advisor-project-knowledge` and `framework-content` indexes in swedencentral.
- **Ghost**: Review public API exposure — add APIM or auth guard per AD-06/AD-07 before any external demo.
- **Coordinator**: Update any docs referencing eastus2 as the target region → swedencentral.
- **Dozer**: Set `min-replicas=1` in containerapp.bicep before any live demo. Consider updating Cosmos sessions TTL to 604800.


---

# Decision: Pre-Deployment Region Selection — Advisor Agent POC

**Status:** Recommended (pending azd up)
**Date:** 2026-05-29T17:06:14+01:00
**Author:** Dozer (DevOps/Infrastructure)
**Requested by:** Ha Duong (haduong)

---

## Context

Pre-deployment preflight run against subscription `ME-MngEnvMCAP734518-haduong-1`
(`3d2c527a-481d-4e13-b3a1-637924b33343`) using the new read-only script at:

```
agents/advisor/infra/scripts/preflight-availability.ps1
```

Candidate regions checked: `eastus2`, `swedencentral`, `westeurope`, `uksouth`.

---

## Preflight Summary

### Resource Providers
All 9 required providers are **Registered**. No action needed before `azd up`.

### Regional Availability

| Region | Result | AI Search Basic Quota |
|---|---|---|
| eastus2 | **GO** | 0 used / 12 limit |
| swedencentral | **GO** | 0 used / 12 limit |
| westeurope | **GO** | 0 used / 12 limit |
| uksouth | **GO** | 1 used / 12 limit |

All services pass in all four regions:
Container Apps, Cosmos DB, AI Search Basic, Key Vault Standard, ACR Basic,
Log Analytics PerGB2018, App Insights, VNet/private endpoints, managed identity.

### Azure Policy
- Policy `797b37f7` (Cosmos DB public network access deny) **not found** at
  subscription scope. May be applied at Management Group level.
- Our Bicep sets `publicNetworkAccess='Disabled'` + private endpoint — **aligned**
  with this policy regardless of where it is assigned. Creation should succeed.
- 5 Cosmos DB policy state records exist from prior resources; non-blocking.
- **No blockers detected.**

---

## Decision

### Recommended region: `eastus2`

**Rationale:**
1. First candidate in the default list — matches azd/team convention of preferring
   `eastus2` for US-based managed environments.
2. Zero AI Search Basic instances consumed (12 available). Maximum headroom.
3. No prior Advisor infra resources in this region — clean slate.
4. All 7 service checks pass cleanly.

### Alternative: `swedencentral`
- Equal GO status, zero quota used.
- Preferred if EU data residency is required.
- Use: `azd env set AZURE_LOCATION swedencentral`

### AI Search quota fallback
If Basic SKU quota is ever exhausted in the chosen region:
1. Try `swedencentral` or `westeurope` (0/12 each).
2. Request quota increase: https://aka.ms/azuresearchquota
3. Or set `deploySearch=false` (infra note from Wave 1 — param to add if needed).

---

## Action Required Before `azd up`

```bash
# Set the region (eastus2 is the recommendation)
azd env set AZURE_LOCATION eastus2

# Run the deployment
azd up
```

No provider registrations, quota requests, or policy remediations needed.

---

## Open Items (carry forward)

- Policy 797b37f7 confirmed NOT at subscription scope. If Cosmos DB creation fails
  with a policy error, check Management Group assignments in the Azure portal.
  Our private-endpoint design is aligned — escalate to MCAP tenant admin if blocked.
- Key Vault purge protection is ENABLED (7-day soft-delete). Plan for this in teardown
  procedures — purged KVs cannot be immediately recreated with the same name.


## Reviewer flag R1 — IConversationStore breaking change

**Affects:** `shared/src/interfaces/IConversationStore.ts`
**Type:** Interface extension (breaking for existing implementors)

Two new methods were added to `IConversationStore`:
- `submitFeedback(sessionId: string, feedback: ProjectFeedback): Promise<void>`
- `loadFeedback(sessionId: string): Promise<ProjectFeedback | null>`

`InMemoryConversationStore` implements both. **Any future Cosmos DB or other adapter must also implement these two methods** or the build will fail. This should be tracked in the Wave 3 adapter implementation checklist.

---

## Note N1 — `_intake` session pattern is temporary

The orchestrator attaches `_intake` as a non-typed property via `session as AdvisorSession & { _intake?: IntakeSubmission }`. Tests mirror this pattern. Tank's history notes this should become an explicit field in `AdvisorSession` in Wave 3 — when that happens, test helpers (`makeSession`, `makeEvalSession`) should be updated to set the field directly rather than casting.




---

# Decision: Web Frontend Hosting — Azure Storage Static Website

**Date:** 2026-06-03  
**Author:** Mouse (Frontend / UX)  
**Status:** Implemented  
**Stakeholder:** Ha Duong

---

## Problem

Deploy the Advisor React SPA so it is publicly reachable and wired to the live Container App API — with no existing web hosting infrastructure.

## Options Evaluated

| Option | Pros | Cons |
|--------|------|------|
| **(a) Azure Static Web Apps** | Native Vite/React fit, free tier, GitHub Actions integration | SWA CLI binary has had ARM issues (noted team learning); adds a new resource type with its own auth rules |
| **(b) Azure Storage static website** ✅ | Dead-simple, zero proprietary tooling, `az` CLI only, dirt cheap, fully deterministic | No edge CDN by default (can add later), custom domain needs CDN |
| **(c) Container App (nginx)** | Same infra as API, consistent Bicep model | Overkill for static files; builds docker image; adds ACR push step |

## Decision

**Chosen: Option (b) — Azure Storage static website**

### Why

1. **Simplest possible path.** The entire deploy is two `az` commands: `blob service-properties update` (enable static website) + `blob upload-batch`. No extra CLI tools, no Bicep additions, no image builds.
2. **Avoids known SWA CLI risk.** Team history notes the SWA CLI `StaticSitesClient` binary had ARM issues. Even if it would work on Windows x86, the Storage path is more reliable and has no moving parts.
3. **Already in the same RG.** `rg-advisor-advisor-poc` / `swedencentral` — consistent with the rest of the POC infra.
4. **RBAC-only auth on storage.** Key-based auth is disabled on the subscription; `--auth-mode login` works cleanly.
5. **SPA routing works.** Setting `404-document = index.html` handles React Router deep-links without a CDN.

### What was NOT chosen and why

- SWA: unnecessary complexity and binary risk for a POC.
- Container App nginx: image build + ACR push overhead; no benefit for pure static assets.

## Resources Created

| Resource | Name | Region | RG |
|----------|------|--------|----|
| Storage Account | `advisorwebpoc` | swedencentral | rg-advisor-advisor-poc |

Static website endpoint: `https://advisorwebpoc.z1.web.core.windows.net/`

## CORS Behaviour

The API Container App uses `app.use(cors())` (no origin filter). Verified via OPTIONS preflight that the API returns:

```
Access-Control-Allow-Origin: https://advisorwebpoc.z1.web.core.windows.net
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
```

No additional CORS config is required on either the SPA or the API.

## Repeatability

Redeploy script: `agents/advisor/infra/scripts/deploy-web.ps1`  
Full instructions in: `agents/advisor/web/README.md` (Deploying to Azure section)

## Future Improvements

- Add Azure CDN in front of the storage endpoint for custom domain + HTTPS (custom cert) + edge caching.
- Consider SWA if GitHub Actions CI/CD integration is needed (preview deployments per PR).
- Add the storage account to Bicep `main.bicep` + `azure.yaml` if infra-as-code for the web tier is required.


---

# Decision: AI Search Seeding Approach — `advisor-project-knowledge`

**Date:** 2026-06-03  
**Author:** Switch (Data Engineer)  
**Status:** Implemented and validated

---

## Context

The live POC deployment (RG `rg-advisor-advisor-poc`, swedencentral) had AI Search service `srch-advisor-33wfyfewrvjcg` with no index populated. `GET /sessions/:id/similar-projects` returned a Search 404. Two root causes:

1. **Index name mismatch bug**: `AzureAiSearchProjectSearch.ensureIndex()` used the hardcoded name from the static `PROJECT_KNOWLEDGE_INDEX_DEFINITION` (`project-knowledge`), not the configured `SEARCH_INDEX` env var (`advisor-project-knowledge`). Fixed by passing `{ ...DEFINITION, name: this.options.indexName }` to `createOrUpdateIndex`.

2. **No seeding had been run**: The seed loader existed (`data/src/seed/loader.ts`) but had never been executed against the live environment.

---

## Constraint: Private Endpoints

Azure AI Search confirmed via `az rest` (2023-11-01 API):
- `publicNetworkAccess: "Disabled"`
- `disableLocalAuth: true` (RBAC only — managed identity required)

This means dev machines cannot reach the Search or Cosmos endpoints directly. Only the Container App (which is VNet-integrated, acaSubnetId outbound) can reach these services.

> Note: `az search service show` returned null for both fields — it uses an older API version. Always use `az rest` with `api-version=2023-11-01` to inspect AI Search network config accurately.

---

## Options Considered

| Option | Decision |
|---|---|
| **(a) Guarded admin endpoint inside running container** | ✅ **Chosen** |
| (b) Container Apps Job (one-off seed job) | Viable but more setup; container already running |
| (c) Temporarily enable public access + IP firewall | ❌ Against Azure Policy; risk of forgetting to re-disable |

---

## Chosen Approach: Option (a) — Admin Endpoint Inside Container

### Why

- The container app is already running and VNet-integrated.
- It uses the managed identity (`e7054a1b-...`) which already has Search Index Data Contributor RBAC.
- No new infrastructure, no credential exposure, no public access risk.
- The endpoint re-uses the existing `AzureAiSearchProjectSearch` and `SEED_PROJECT_KNOWLEDGE_DOCUMENTS` — single source of truth for seed data.
- Idempotent: safe to run multiple times (upsert semantics via Azure AI Search `uploadDocuments`).

### Implementation

Added `POST /admin/seed/project-knowledge` to `@advisor/api/src/app.ts`:
- Guarded by `process.env['ENABLE_ADMIN_SEED'] === 'true'` — returns 403 otherwise.
- Dynamically imports `@advisor/data` (same pattern as existing Azure adapter path).
- Calls `projectSearch.ensureIndex()` (with the name-override fix), then `projectSearch.uploadDocuments()`.
- Returns `{ ok: true, data: { indexName, documentsSeeded, idempotent: true } }`.

### Workflow for re-seeding

```bash
# 1. Enable
az containerapp update --name ca-advisor-33wfyfewrvjcg --resource-group rg-advisor-advisor-poc --set-env-vars ENABLE_ADMIN_SEED=true

# 2. Seed
curl -X POST https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io/admin/seed/project-knowledge \
  -H "Content-Type: application/json" -d '{}'

# 3. Disable (important — do this immediately after seeding)
az containerapp update --name ca-advisor-33wfyfewrvjcg --resource-group rg-advisor-advisor-poc --remove-env-vars ENABLE_ADMIN_SEED
```

Or use the PowerShell script: `agents/advisor/data/scripts/seed-via-admin-endpoint.ps1`

---

## State After This Work (2026-06-03)

- ✅ `advisor-project-knowledge` index created and seeded with 6 documents
- ✅ NFU Mutual guidance (`instr-nfum-claims-001`) seeded into Cosmos `guidance` container for `org-nfum`
- ✅ `GET /sessions/:id/similar-projects` returns ranked matches (top score 0.97 for insurance intake)
- ✅ `ENABLE_ADMIN_SEED` removed from container after seeding — endpoint locked down
- ✅ Fix committed: `ensureIndex()` now uses `this.options.indexName`

---

## Artefacts

- `agents/advisor/data/src/search/AzureAiSearchProjectSearch.ts` — ensureIndex fix
- `agents/advisor/api/src/app.ts` — admin seed router
- `agents/advisor/data/scripts/seed-via-admin-endpoint.ps1` — repeatable seed script
- `agents/advisor/data/docs/seeding.md` — full seeding documentation


---

# Decision: Advisor API — Search Failure Swallowed in buildRecommendationOutput

**Date:** 2026-06-03  
**Author:** Tank (Backend / Agent Engineer)  
**Status:** Implemented

---

## Context

During live end-to-end demo validation against the deployed Container App, `POST /sessions/:id/messages` and `GET /sessions/:id/recommendation` both returned `500 INTERNAL_ERROR` when the AI Search index (`advisor-project-knowledge`) didn't yet exist.

Root cause: `AgentOrchestrator.buildRecommendationOutput()` called `this.deps.projectSearch.similarProjects()` without a try/catch. An unhandled `RestError` from the Azure Search SDK propagated up through the Phase 3 message handler and the recommendation endpoint, crashing both.

This was masked during local development because `InMemoryProjectSearch` never throws.

---

## Decision

Wrap the `projectSearch.similarProjects()` call in `buildRecommendationOutput` in a try/catch. On any error, return `{ noMatchFound: true, reason: 'Search index unavailable or not yet seeded' }` and log a warning. The recommendation proceeds without similar-project highlights rather than crashing.

This aligns with the existing pattern in `AzureAiSearchFrameworkRetrieval.retrieve()`, which already swallows Search failures and falls back to local content.

---

## Rationale

- **Recommendation delivery must not be gated on Search availability.** The core value — technology selection guidance — comes from the framework logic and intake analysis, not from prior project matches.
- **Similar project highlights are enrichment, not requirement.** The `RecommendationOutput.similarProjectHighlights` field is already optional.
- **Defensive posture for the POC phase.** The Search index seed is a separate operation that Switch owns. A deployment window where the index doesn't exist (or is being rebuilt) should not break the advisor flow.

---

## Files Changed

- `agents/advisor/api/src/agent/AgentOrchestrator.ts` — `buildRecommendationOutput()` method
- `agents/advisor/api/dist/agent/AgentOrchestrator.js` — compiled output (auto-generated)

---

## Related Known Issue (NOT fixed here)

`processMessage` returns `readinessState` from `evaluateReadiness()` (a computed function) rather than from `session.conversationCapture.readinessState` (the stored value). This causes the returned `readinessState` to show `phase1InProgress` even after Phase 3 recommendation delivery.

The GET `/recommendation` endpoint works correctly because it reads the stored state. Demo scripts can detect recommendation delivery via `agentTurn.messageType === 'recommendation'`.

**Proposed fix (Wave 5):** Update `processMessage` return value to use `finalSession.conversationCapture.readinessState` directly.


---

### 2026-06-03T16:19:19+01:00: User directive — AI Search public access authorized for seeding
**By:** Ha Duong (via Copilot)
**What:** Switch is authorized to TEMPORARILY enable public network access on AI Search (srch-advisor-33wfyfewrvjcg) in order to seed the `advisor-project-knowledge` index from a dev box, if an in-network path proves impractical. Must RE-DISABLE / restore the locked-down (private-endpoint-only) state immediately after seeding completes.
**Why:** User request — unblocks the search index seeding work. Authorization is scoped to the seeding task only; public access must not be left enabled.

