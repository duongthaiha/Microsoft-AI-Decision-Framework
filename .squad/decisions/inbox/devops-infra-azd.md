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
