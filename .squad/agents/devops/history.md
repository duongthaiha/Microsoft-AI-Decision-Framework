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

