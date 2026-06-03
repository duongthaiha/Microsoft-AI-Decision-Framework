# Dozer — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework — AI Framework Advisor Agent POC.
- **Guardrails:** Bicep under `infra/`; azd (`azure.yaml`, provision/deploy/up); managed identity preferred; secrets only in Key Vault/platform config; data services private (private endpoint + private DNS, public network access disabled); only app/API tier public.
- **Output root:** infra under `agents/advisor/infra/`.
- **Hosting default:** Azure Container Apps.
- **User:** Ha Duong.

## Learnings

### Wave 1: Bicep Infrastructure + azd Wiring (2026-05-29)

**What was built:**

```
agents/advisor/
├── azure.yaml                         ← azd project manifest
├── Dockerfile                         ← two-stage TypeScript build, workspace-aware
└── infra/
    ├── main.bicep                     ← subscription scope; creates RG + calls modules
    ├── main.parameters.json           ← azd ${ENV_VAR} interpolation pattern
    ├── scripts/
    │   └── validate-deployment.ps1   ← post-deploy validation (5 checks)
    └── modules/
        ├── identity.bicep             ← user-assigned managed identity
        ├── network.bicep              ← VNet 10.0.0.0/16 + aca-subnet (/23) + pe-subnet (/24)
        ├── monitoring.bicep           ← Log Analytics + Application Insights
        ├── keyvault.bicep             ← Key Vault + private endpoint + DNS zone
        ├── cosmosdb.bicep             ← Cosmos DB (Serverless, NoSQL) + private endpoint + DNS + Cosmos RBAC
        ├── search.bicep               ← AI Search (Basic SKU) + private endpoint + DNS
        ├── acr.bicep                  ← Container Registry (Basic, public pull)
        ├── containerapp.bicep         ← ACA environment (VNet-integrated) + app (public ingress)
        └── roleassignments.bicep      ← RBAC: Search Index Data Contributor, KV Secrets User, AcrPull, Monitoring
```

**Resource naming convention:**
- `resourceToken = toLower(uniqueString(subscription().id, environmentName, location))`
- Abbreviation prefix + `advisor` + token: e.g. `ca-advisor-abc123`, `kv-abc123`

**Env vars passed to Container App (from Bicep outputs):**
- `PORT=3000`
- `NODE_ENV=production`
- `ADVISOR_AGENT_MODE` ← azd env param
- `AZURE_CLIENT_ID` ← user-assigned identity clientId (required for DefaultAzureCredential disambiguation)
- `COSMOS_ENDPOINT` ← cosmosdb.outputs.endpoint
- `COSMOS_DATABASE` ← param cosmosDatabaseName
- `SEARCH_ENDPOINT` ← search.outputs.endpoint
- `SEARCH_INDEX` ← param searchIndexName
- `APPLICATIONINSIGHTS_CONNECTION_STRING` ← monitoring.outputs.appInsightsConnectionString

**Private networking choices:**
- VNet: `10.0.0.0/16`
- ACA subnet: `10.0.0.0/23` (minimum /23 for Consumption; delegated to `Microsoft.App/environments`)
- PE subnet: `10.0.4.0/24` (privateEndpointNetworkPolicies: Disabled)
- Private DNS zones linked to VNet: `privatelink.documents.azure.com`, `privatelink.search.windows.net`, `privatelink.vaultcore.azure.net`
- `publicNetworkAccess: 'Disabled'` on Cosmos DB, AI Search, and Key Vault
- Container App environment: `internal: false` (so apps can have public ingress)
- ACR: public access enabled (ACA pulls images over internet via managed identity AcrPull)

**Cosmos DB RBAC note:**
Cosmos DB data-plane RBAC uses `Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments` — NOT ARM RBAC. Built-in Data Contributor role ID `00000000-0000-0000-0000-000000000002` is assigned inside `cosmosdb.bicep`. ARM RBAC `roleassignments.bicep` covers Search, Key Vault, ACR, and Monitoring only.

**Cosmos DB — duplicate `capabilities` block:**
Fixed at authoring time. Single `capabilities: [{ name: 'EnableServerless' }]` block in cosmosdb.bicep.

**Validation commands (attempted):**
- `az bicep build` and `bicep build` were NOT available in this environment at authoring time.
- Manual Bicep review was performed; the duplicate `capabilities` block in cosmosdb.bicep is the one known issue.
- Command to validate after installing Bicep: `az bicep build --file agents/advisor/infra/main.bicep`

**azd wiring:**
- `azure.yaml` sets `infra.path: ./infra`, `services.api.host: containerapp`
- Container App tagged with `azd-service-name: api` to match azure.yaml service name
- Dockerfile placed at `agents/advisor/Dockerfile` with build context `agents/advisor/`

**Open items for Ghost (Security):**
1. Developer access path to private endpoints not decided (VPN / jumpbox / Dev Tunnel)
2. Key Vault secrets rotation policy not configured
3. Entra External ID auth not wired (AD-06 deferred)
4. APIM tier not included (AD-07 open question)

### Wave 2: Pre-Deployment Preflight Script (2026-05-29)

**What was built:**
```
agents/advisor/infra/scripts/
└── preflight-availability.ps1   ← READ-ONLY preflight check (new)
```

**Script purpose:** Service availability + quota check before `azd up`. Covers all 9
required resource providers, per-region availability for every Bicep resource type,
AI Search Basic quota via the Search usages REST API, and Azure Policy scan.
Always exits 0. Never creates or modifies anything.

**Live preflight results (run 2026-05-29T17:06:14+01:00 against sub 3d2c527a):**

| Check | Result |
|---|---|
| Subscription | ME-MngEnvMCAP734518-haduong-1 — matches expected |
| Resource Providers | All 9 Registered (Microsoft.App, .DocumentDB, .Search, .KeyVault, .ContainerRegistry, .Network, .ManagedIdentity, .OperationalInsights, .Insights) |
| eastus2 | **GO** — all services available; AI Search Basic quota 0/12 |
| swedencentral | **GO** — all services available; AI Search Basic quota 0/12 |
| westeurope | **GO** — all services available; AI Search Basic quota 0/12 |
| uksouth | **GO** — all services available; AI Search Basic quota 1/12 |
| Policy 797b37f7 | NOT found at subscription scope (may be at MG level) |
| Policy state | 5 Cosmos DB state records exist (prior resources) — non-blocking |
| Blockers | NONE |

**Recommended region: `eastus2`** (first GO, zero Search quota used, no prior resources).

**Key observations:**
- `swedencentral` is a strong alternative (EU data residency, 0/12 quota).
- `uksouth` already has 1 Basic Search service deployed in this sub.
- Policy 797b37f7 was not at subscription scope; likely applied at Management Group.
  Our Bicep uses `publicNetworkAccess='Disabled'` + private endpoint — aligned regardless.
- AI Search usages API (`/providers/Microsoft.Search/locations/{region}/usages`) is
  accessible and returned live quota data. Caching per RP significantly speeds the check.

**To proceed:**
```bash
azd env set AZURE_LOCATION eastus2
azd up
```

### Wave 3: Post-Deployment Validation (2026-05-29T18:44:22+01:00)

**What was validated:**

Performed full post-deployment validation for the `advisor-poc` environment deployed to **swedencentral**.

**Deployment URLs:**
- FQDN: `https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io`
- Health: `GET /health` → HTTP 200, `{"ok":true,"service":"@advisor/api"}`

## Learnings

### Region/Quota Gotchas

- **AI Search naming conflict (HTTP 409 Conflict)** is the most likely cause of an initial region failing.
  Search service names are globally unique. A prior partial deployment leaves the name in "Deleting"
  state. Fastest fix: change region. Do NOT retry the same region until the name fully releases (can
  take 5-15 minutes).
- **Deployment history `az deployment sub list`** is the definitive record of what failed and why.
  Query `az deployment operation sub list --name <name>` to get per-module failure codes.
- eastus2 quota was NOT the issue (0/12 Basic at time of writing). The 409 Conflict was name-based.

### Adapter-Mode Behavior (Critical)

`ADVISOR_AGENT_MODE` in composition.ts controls **only the LLM (Copilot SDK) service**.
The data-layer adapter selection is independent and driven by presence of `COSMOS_ENDPOINT` +
`SEARCH_ENDPOINT` env vars. So:

- `ADVISOR_AGENT_MODE=mock` + endpoints present = **real Azure data adapters + mock LLM** ✅
- `ADVISOR_AGENT_MODE=mock` + endpoints absent = **in-memory everything** (pure offline)
- `ADVISOR_AGENT_MODE=copilot` + endpoints present = **real Azure data + real LLM**

The azd env `ADVISOR_AGENT_MODE=mock` should NOT be read as "the container is in mock mode" —
it only affects the LLM service.

### Health and Cold-Start Findings

- `min-replicas=0` causes ~30-60s cold start after idle. The Coordinator's health timeout was a
  cold start, not a crash. Container logs show `restartCount=0`, no crash loops.
- **Definitive cold-start diagnosis command:**
  ```bash
  az containerapp replica list --name <app> --resource-group <rg>
  # Look for runningState=Running + restartCount=0 → container is alive, cold start was the delay
  ```
- Health path is `GET /health` (confirmed in `agents/advisor/api/src/app.ts`). No auth required.
- For demos: set `min-replicas=1` in `containerapp.bicep` to eliminate cold starts.

### AI Search Index-Not-Found ≠ Connectivity Failure

`RestError: The index 'X' was not found` from the running container means the **private endpoint
is working** — the container reached the Search API and got a legitimate application-level 404.
A real network/PE failure would produce a `ECONNREFUSED` or TCP timeout, not an HTTP 404 from
the Search REST API. Use this to distinguish PE connectivity issues from data seeding issues.

### Key Commands That Worked

```bash
# Get container env vars
az containerapp show --name <app> --resource-group <rg> --query "properties.template.containers[0].env"

# Check replica status (is it running / how many restarts)
az containerapp replica list --name <app> --resource-group <rg>

# Get recent console logs (when az containerapp logs hangs — use Log Analytics)
$wsId = "..."  # from az monitor log-analytics workspace list
az monitor log-analytics query --workspace $wsId \
  --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == '<app>' | order by TimeGenerated desc | take 40" \
  --timespan PT15M

# Deployment history (region/failure audit)
az deployment sub list --query "[?contains(name,'advisor')].{name:name, location:location, state:properties.provisioningState}"

# Deployment failure details
az deployment operation sub list --name <deployment-name> \
  --query "[].{resource:properties.targetResource.resourceType, status:properties.statusCode, error:properties.statusMessage.error.code}"

# Cosmos state (uses REST, not az cosmosdb show which has query issues)
az rest --method get \
  --url "https://management.azure.com/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.DocumentDB/databaseAccounts/<name>?api-version=2023-11-15" \
  --query "{provisioningState:properties.provisioningState, publicNetworkAccess:properties.publicNetworkAccess}"
```

### Open Items After Wave 3

1. AI Search indexes (`advisor-project-knowledge`, `framework-content`) not seeded — need data seed job.
2. `min-replicas=0` → cold starts. Update to `min-replicas=1` before any live demo.
3. Cosmos `sessions` TTL=-1 (no default expiry) — consider setting `defaultTtl=604800` for hygiene.
4. Ghost: add auth gate before any external demo (AD-06/AD-07 deferred).

### Wave 4: Frontend Deployment + Search Seeding (2026-06-03T16:35:54Z)

**What was delivered:**

1. **Web UI live** — React SPA deployed to Azure Storage static website
   - URL: `https://advisorwebpoc.z1.web.core.windows.net/`
   - CORS verified against live API
   - Intake screen HTTP 200 ✅

2. **Search index seeded** — `advisor-project-knowledge` now contains 6 project documents
   - Seeding via guarded admin endpoint inside running container (not public access)
   - Index name bug fixed: ensureIndex now respects SEARCH_INDEX env var
   - GET /sessions/:id/similar-projects returns ranked matches (top: 0.97 NFU Insurance)
   - Private endpoint connectivity proven working ✅

**Open items:**
- `min-replicas=0` still active (cold starts persist) — recommend setting to 1 for demos
- `framework-content` index not yet seeded (Wave 5 task)

