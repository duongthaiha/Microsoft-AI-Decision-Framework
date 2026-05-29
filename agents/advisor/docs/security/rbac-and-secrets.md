# RBAC and Secrets Handling

**AI Framework Advisor Agent POC**  
_Author: Ghost (Security/Networking)_  
_Date: 2026-05-29_  
_Status: RBAC audit complete. One scope fix applied. Secrets model confirmed. Resolves OPEN-SEC-02._

---

## Managed Identity: The Single Service Identity

One user-assigned managed identity (`id-advisor-{resourceToken}`) is the sole service identity for the POC. It is declared in `modules/identity.bicep`, attached to the Container App in `modules/containerapp.bicep` (line 65–68), and receives all data-service RBAC assignments.

**Why user-assigned, not system-assigned?**  
User-assigned identities exist independently of the Container App lifecycle. If the app is deleted and recreated (common during POC iteration), the managed identity and its RBAC assignments survive. System-assigned identities are deleted with the resource, requiring all role assignments to be recreated.

**DefaultAzureCredential disambiguation:**  
The `AZURE_CLIENT_ID` environment variable is set to `identity.outputs.clientId` in `containerapp.bicep` (line 119). When multiple managed identities are attached or when DefaultAzureCredential probes multiple credential sources, this env var pins it to the correct user-assigned identity. Without it, DefaultAzureCredential falls back to system-assigned identity lookup and may fail.

---

## RBAC Matrix

### ARM RBAC — `modules/roleassignments.bicep`

| Role | Built-in Role ID | Scope | Principal | Bicep Lines |
|------|-----------------|-------|-----------|-------------|
| **Search Index Data Contributor** | `8ebe5a00-799e-43f5-93ac-243d3dce84a7` | AI Search service resource | Managed Identity | 37–48 |
| **Search Service Contributor** | `7ca78c08-252a-4471-8644-bb5ff32d4ba0` | AI Search service resource | Managed Identity | 50–61 |
| **Key Vault Secrets User** | `4633458b-17de-408a-b874-0445c86b69e6` | Key Vault resource | Managed Identity | 67–77 |
| **AcrPull** | `7f951dda-4ed3-4680-a7ca-43fe172d538d` | Resource group | Managed Identity | 83–93 |
| **Monitoring Metrics Publisher** | `3913510d-42f4-4e42-8a64-420c390055eb` | Resource group | Managed Identity | 99–109 |

> **Scope note:** Search roles were previously scoped to `resourceGroup()`. This was a least-privilege gap — the managed identity held Search RBAC over all Search services in the RG (even if none existed today). Fixed in this PR: both search roles are now scoped to the specific `searchService` existing resource. See `networking-and-private-access.md` Bicep Fix section.

> **AcrPull scope:** AcrPull at resource group scope is acceptable — there is only one ACR in the resource group. The `guid()` uniqueness still incorporates the specific ACR ID, so this assignment is deterministic and idempotent.

### Cosmos DB Data-Plane RBAC — `modules/cosmosdb.bicep`

Cosmos DB uses a separate RBAC system (`Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments`) that is **not** ARM RBAC. It cannot be managed in `roleassignments.bicep` because role definition IDs are scoped to the Cosmos DB account.

| Role | Cosmos Role Definition ID | Scope | Principal | Bicep Lines |
|------|--------------------------|-------|-----------|-------------|
| **Cosmos DB Built-in Data Contributor** | `00000000-0000-0000-0000-000000000002` | Cosmos DB account | Managed Identity | 230–238 |

This role grants read/write/delete on all documents across the account. For production, narrow this to the specific database or container level by specifying a more precise `scope` value on the `sqlRoleAssignment`.

### What is NOT in RBAC (and why)

| Access | Why Not RBAC |
|--------|-------------|
| Container App reading Cosmos endpoint URL | It's a URL, not a secret. Passed as env var from Bicep output. |
| Container App reading AI Search endpoint URL | Same — passed as env var. |
| Application Insights connection string | This is a connection string but contains only an instrumentation key (not a data-access credential). Passed as env var. Not a secret by Azure's classification. |
| Key Vault secrets (when added) | Key Vault Secrets User role covers this via Key Vault reference in ACA secret config. |

---

## Secrets Handling

### Current State: No Secrets in Source

As of the current POC, **no secrets are stored anywhere in source, Bicep parameters, or azd `.env` files.** All configuration passed to the Container App is endpoint URLs and non-sensitive identifiers:

| Env Var | Value Type | Source | Contains Secret? |
|---------|-----------|--------|-----------------|
| `PORT` | Port number | Bicep literal | No |
| `NODE_ENV` | Mode string | Bicep literal | No |
| `ADVISOR_AGENT_MODE` | `mock` or `copilot` | azd parameter | No |
| `AZURE_CLIENT_ID` | Managed identity client ID | Bicep output | No — it's a public identifier |
| `COSMOS_ENDPOINT` | HTTPS URL | Bicep output | No |
| `COSMOS_DATABASE` | Database name | azd parameter | No |
| `SEARCH_ENDPOINT` | HTTPS URL | Bicep output | No |
| `SEARCH_INDEX` | Index name | azd parameter | No |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Instrumentation string | Bicep output | No — instrumentation key only |

All data-plane access uses managed identity tokens, so no connection strings or keys are needed for Cosmos DB, AI Search, or Key Vault.

### When Secrets Will Be Needed

When `ADVISOR_AGENT_MODE=copilot`, the GitHub Copilot SDK requires a **GitHub token** to authenticate to the Copilot SDK endpoint. This is the first real secret in this system.

**Mandatory path:** GitHub token → Key Vault secret → ACA secret reference → env var.

```
Key Vault
  └── secret: github-copilot-token
        │
        ▼ (Key Vault reference)
Container App secret config
  └── name: "github-copilot-token-ref"
      keyVaultUrl: "${keyVault.properties.vaultUri}secrets/github-copilot-token"
      identity: managedIdentityId
        │
        ▼ (ACA secret env var)
Container App env var
  └── GITHUB_TOKEN → secretRef: "github-copilot-token-ref"
```

This pattern keeps the secret value entirely in Key Vault. The Container App platform resolves it at startup using the managed identity's Key Vault Secrets User role. No human ever sees the value in the Bicep, in az env, or in source code.

**Adding Key Vault secrets in Bicep:**  
When the GitHub token is added, the `containerapp.bicep` module needs two additions:
1. A `secrets` block in `configuration` referencing the Key Vault URI
2. An env var using `secretRef` (not `value`) pointing to the secret name

Neither the Key Vault URI nor the secret name is sensitive — only the secret _value_ is.

### Secrets That Must Never Appear in Source

- GitHub Copilot SDK tokens / API keys
- Any third-party API keys (if added later)
- Cosmos DB primary/secondary keys (not used — managed identity only)
- AI Search API keys (not used — `disableLocalAuth: true` in `search.bicep` line 41)

The `.gitignore` in `agents/advisor/` must exclude `.env` files. The `main.parameters.json` uses `${ENV_VAR}` interpolation for azd-managed values only — no secrets are ever in this file.

### Rotation Policy

**For POC (Key Vault soft-delete = 7 days):**

There are no secrets to rotate today. When `GITHUB_TOKEN` is added:

1. **Detection:** Key Vault Expiry event (set `expiryDate` on the secret when created: 90 days from creation).
2. **Trigger:** Azure Event Grid emits `Microsoft.KeyVault.SecretNearExpiry` 30 days before expiry.
3. **POC rotation (manual):** Developer generates new GitHub token, updates Key Vault secret via `az keyvault secret set`, increments the `version` reference in ACA if using a versioned reference. Container App automatically picks up the new version on next restart (or ACA rolling restart can be triggered).
4. **Production rotation (automated):** Wire the Event Grid event to a Logic App or Azure Function that calls the GitHub API to generate a new token, writes it to Key Vault, and triggers an ACA revision rollout. This is a production hardening item, not POC-blocking.

**Key Vault audit log retention:**  
Diagnostic settings in `keyvault.bicep` (lines 47–69) send all Key Vault `audit` and `allLogs` categories to Log Analytics. Log Analytics retention is 30 days (set in `monitoring.bicep` line 18). For compliance, increase Log Analytics retention to 90 days for production.

---

## App Uses Managed Identity: Cross-Check

### Container App → Managed Identity

`containerapp.bicep`, lines 64–69:
```bicep
identity: {
  type: 'UserAssigned'
  userAssignedIdentities: {
    '${managedIdentityId}': {}
  }
}
```

`AZURE_CLIENT_ID` env var set at line 119 — required for `@azure/identity` `DefaultAzureCredential` to select the correct user-assigned identity (not attempt system-assigned or environment credentials).

### API Code → DefaultAzureCredential

The adapters in `@advisor/api` (Switch's work in `agents/advisor/api/`) must use `DefaultAzureCredential` from `@azure/identity` when constructing clients:

```typescript
// Cosmos DB
const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT!,
  aadCredentials: new DefaultAzureCredential(),
});

// AI Search
const searchClient = new SearchClient(
  process.env.SEARCH_ENDPOINT!,
  process.env.SEARCH_INDEX!,
  new DefaultAzureCredential(),
);

// Key Vault (when secrets are added)
const secretClient = new SecretClient(
  process.env.KEY_VAULT_ENDPOINT!,
  new DefaultAzureCredential(),
);
```

`DefaultAzureCredential` in Azure Container Apps uses IMDS to retrieve the managed identity token, pinned to the user-assigned identity by `AZURE_CLIENT_ID`. No connection strings, no API keys, no environment credential files.

**Local development:** `DefaultAzureCredential` falls back to Azure CLI credentials (`az login`) when IMDS is not available. Developers running locally use their own Entra ID identity — they need appropriate RBAC assignments on their user principal (Cosmos DB Built-in Data Contributor, Search Index Data Contributor, Key Vault Secrets User) on the development resource group.

---

## Production Gaps (Not POC-Blocking)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| Cosmos DB RBAC scoped to account level | Managed identity can access all containers | Narrow `sqlRoleAssignment.scope` to specific container for production |
| KV soft-delete retention = 7 days | Short recovery window if accidentally deleted | Increase to 90 days for production |
| No automated secrets rotation wired | Expired token causes silent outage | Wire Event Grid → Logic App rotation for production |
| Log Analytics retention = 30 days | Key Vault audit logs expire before most investigations | Increase to 90 days for compliance |
| No developer-identity RBAC assignments in Bicep | Developers must manually assign their own RBAC for local dev | Add an optional `developerPrincipalId` param + conditional role assignments for `azd up` in dev environments |
| `SearchServiceContributor` may be broader than needed at POC | Allows managing service config, not just data | Evaluate whether only `SearchIndexDataContributor` is sufficient once indexing is wired |
