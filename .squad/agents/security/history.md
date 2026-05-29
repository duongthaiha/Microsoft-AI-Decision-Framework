# Ghost — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework — AI Framework Advisor Agent POC.
- **Principle:** Public ingress only for app/API tier; data plane (Cosmos, AI Search, storage) stays private with public access disabled. Managed identity preferred; secrets only in Key Vault.
- **Auth:** Entra ID / Entra External ID for customer-facing users/admins; admin instructions scoped per customer org.
- **Output root:** security artifacts/docs under `agents/advisor/`.
- **User:** Ha Duong.

## Learnings

### Wave 1: Security Audit + Documentation (2026-05-29)

**Identity model:**
- Three principals: Customer User (Entra External ID, `organizationId` claim), Customer Org Admin (same + `OrgAdmin` role claim + org claim match on admin endpoints), Service Identity (user-assigned managed identity `id-advisor-{token}`).
- Multi-tenancy spine: `customerOrganizationId` flows from JWT claim → API middleware context → Cosmos DB partition key on both `sessions` and `guidance` containers. No query path can return cross-org data.
- Auth provider: **Entra External ID** resolves AD-06. Implementation deferred post-Wave 1; API key acceptable interim gate for first internal demo only.
- APIM not required for POC (OPEN-SEC-04 resolved): ACA built-in ingress is sufficient; APIM is a production hardening item.

**Private networking guarantees (all confirmed in Bicep):**
- Cosmos DB: `publicNetworkAccess: 'Disabled'` (`cosmosdb.bicep` line 45) + PE (`pe-cosmos-*`) + DNS zone `privatelink.documents.azure.com` + VNet link + DNS zone group.
- AI Search: `publicNetworkAccess: 'disabled'` (`search.bicep` line 37) + `disableLocalAuth: true` (line 41) + PE + DNS zone `privatelink.search.windows.net` + VNet link + DNS zone group.
- Key Vault: `publicNetworkAccess: 'Disabled'` (`keyvault.bicep` line 36) + `networkAcls.defaultAction: 'Deny'` (line 39) + `enableRbacAuthorization: true` (line 33) + PE + DNS zone `privatelink.vaultcore.azure.net` + VNet link + DNS zone group.
- ACR: public access is an accepted POC exception (D-INFRA-06); admin disabled, AcrPull via managed identity.

**Developer access path decision (OPEN-SEC-01):**
- **Tier 1 (zero cost):** Azure Portal built-in data explorers (Cosmos DB Data Explorer, AI Search Explorer) for data validation — these reach private endpoint services through Azure's control plane without VPN.
- **Tier 2 (~$30/month when needed):** Point-to-Site VPN Gateway (Basic SKU) for code-level local debugging against cloud services. Defer provisioning until explicitly needed; use Cosmos DB Emulator and local mock mode for dev sprints.
- Temporary public access exceptions require PR comment tagged `[SEC-EXCEPTION]`, 24h time-box, and Bicep revert.

**Bicep fix applied:**
- **Gap found:** `roleassignments.bicep` had both Search role assignments scoped to `resourceGroup()` — overly broad.
- **Fix:** Added `param searchServiceName string`, added `existing` reference to the search service, changed `scope: resourceGroup()` to `scope: searchService` on both search role assignments.
- Updated `main.bicep` to pass `searchServiceName: search.outputs.name` to the roleAssignments module.
- `az bicep build --file agents/advisor/infra/main.bicep` exits 0 (clean build, only a version upgrade notice).

**Secrets model:**
- No secrets in source, Bicep params, or azd env today. All env vars are endpoint URLs and non-sensitive identifiers.
- Future: GitHub Copilot SDK token → Key Vault secret → ACA Key Vault reference → `secretRef` env var. Pattern documented in `docs/security/rbac-and-secrets.md`.

**Docs authored:**
- `agents/advisor/docs/security/identity-and-authorization.md`
- `agents/advisor/docs/security/networking-and-private-access.md`
- `agents/advisor/docs/security/rbac-and-secrets.md`

