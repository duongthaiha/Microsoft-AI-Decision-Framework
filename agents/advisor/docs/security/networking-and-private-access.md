# Networking and Private Access

**AI Framework Advisor Agent POC**  
_Author: Ghost (Security/Networking)_  
_Date: 2026-05-29_  
_Status: Audit complete. One Bicep fix applied (RBAC scope). Developer access path decided. Resolves OPEN-SEC-01._

---

## Topology Summary

```
Internet
   │
   ▼
Container App (public ingress, external = true)
   │ outbound via VNet
   ▼
VNet 10.0.0.0/16
├── aca-subnet     10.0.0.0/23   ← ACA Consumption profile (delegated)
└── pe-subnet      10.0.4.0/24   ← Private endpoints (PE network policies disabled)
        ├── pe-cosmos-advisor-{token}    → Cosmos DB NoSQL
        ├── pe-srch-advisor-{token}      → AI Search
        └── pe-kv-{token}               → Key Vault
```

The Container App environment has `internal: false` (AD-07 / D-INFRA-03): apps in the environment receive public FQDN and public ingress. The ACA environment itself is VNet-integrated via `aca-subnet`, so all **outbound** traffic (to Cosmos DB, AI Search, Key Vault) routes through the VNet to the private endpoints — never over the public internet.

---

## Audit: Private Networking Guarantees in Bicep

### Cosmos DB — `modules/cosmosdb.bicep`

| Guarantee | Where in Bicep | Status |
|-----------|---------------|--------|
| Public network access disabled | `publicNetworkAccess: 'Disabled'` — line 45 | ✅ |
| IP rules empty | `ipRules: []` — line 47 | ✅ |
| VNet filter disabled (PE-only path) | `isVirtualNetworkFilterEnabled: false` — line 48 | ✅ |
| NetworkAclBypass = None | `networkAclBypass: 'None'` — line 46 | ✅ |
| Private endpoint in pe-subnet | `resource privateEndpoint` — lines 190–210 | ✅ |
| Private DNS zone `privatelink.documents.azure.com` | `resource privateDnsZone` — lines 170–174 | ✅ |
| DNS zone linked to VNet | `resource dnsZoneVnetLink` — lines 177–187 | ✅ |
| DNS zone group on PE NIC | `resource dnsZoneGroup` — lines 213–226 | ✅ |
| Minimum TLS 1.2 | `minimalTlsVersion: 'Tls12'` — line 64 | ✅ |

**Result: PASS.** All private networking guarantees are in place.

### Azure AI Search — `modules/search.bicep`

| Guarantee | Where in Bicep | Status |
|-----------|---------------|--------|
| Public network access disabled | `publicNetworkAccess: 'disabled'` — line 37 | ✅ |
| IP rules empty | `networkRuleSet: { ipRules: [] }` — line 38 | ✅ |
| Local (key-based) auth disabled | `disableLocalAuth: true` — line 41 | ✅ |
| Private endpoint in pe-subnet | `resource privateEndpoint` — lines 88–108 | ✅ |
| Private DNS zone `privatelink.search.windows.net` | `resource privateDnsZone` — lines 68–72 | ✅ |
| DNS zone linked to VNet | `resource dnsZoneVnetLink` — lines 75–85 | ✅ |
| DNS zone group on PE NIC | `resource dnsZoneGroup` — lines 111–124 | ✅ |

**Result: PASS.** `disableLocalAuth: true` is a bonus hardening not all teams remember — this forces all callers to use RBAC-issued tokens; API key auth is not available even from within the VNet.

### Key Vault — `modules/keyvault.bicep`

| Guarantee | Where in Bicep | Status |
|-----------|---------------|--------|
| Public network access disabled | `publicNetworkAccess: 'Disabled'` — line 36 | ✅ |
| Network ACL default action = Deny | `networkAcls.defaultAction: 'Deny'` — line 39 | ✅ |
| RBAC authorization model | `enableRbacAuthorization: true` — line 33 | ✅ |
| Soft delete enabled (7 days) | `enableSoftDelete: true`, `softDeleteRetentionInDays: 7` — lines 34–35 | ✅ |
| Purge protection enabled | `enablePurgeProtection: true` — line 36 | ✅ |
| Private endpoint in pe-subnet | `resource privateEndpoint` — lines 92–112 | ✅ |
| Private DNS zone `privatelink.vaultcore.azure.net` | `resource privateDnsZone` — lines 72–76 | ✅ |
| DNS zone linked to VNet | `resource dnsZoneVnetLink` — lines 79–89 | ✅ |
| DNS zone group on PE NIC | `resource dnsZoneGroup` — lines 115–128 | ✅ |

**Result: PASS.** `networkAcls.bypass: 'AzureServices'` (line 38) allows Key Vault diagnostic/monitoring traffic from Azure-native services — this is correct and expected; it does not open Key Vault to developer laptops.

### ACR — `modules/acr.bicep`

| Guarantee | Where in Bicep | Status |
|-----------|---------------|--------|
| Public network access | `publicNetworkAccess: 'Enabled'` — line 24 | ⚠️ Accepted exception |
| Admin account disabled | `adminUserEnabled: false` — line 23 | ✅ |

**Result: ACCEPTED EXCEPTION (D-INFRA-06).** ACR is public because Container Apps Consumption profile pulls images over the internet. Admin account is disabled; image pull uses `AcrPull` role on the managed identity. This is documented and accepted for POC. For production: add ACR private endpoint and IP allowlist.

### Networking Subnet — `modules/network.bicep`

| Guarantee | Where in Bicep | Status |
|-----------|---------------|--------|
| ACA subnet delegated to `Microsoft.App/environments` | lines 33–38 | ✅ |
| PE subnet network policies disabled | `privateEndpointNetworkPolicies: 'Disabled'` — line 48 | ✅ |
| PE subnet link service policies disabled | `privateLinkServiceNetworkPolicies: 'Disabled'` — line 49 | ✅ |

**Result: PASS.**

---

## Bicep Fix Applied: RBAC Scope Hardening

**Finding:** In the original `roleassignments.bicep`, both Search role assignments used `scope: resourceGroup()`. This granted `Search Index Data Contributor` and `Search Service Contributor` at the resource group level — broader than needed and inconsistent with how Key Vault scoping is handled in the same file.

**Fix applied:** Both search role assignments now reference the AI Search service as an `existing` resource and use `scope: searchService`. A new `searchServiceName` parameter was added to the module.

Changed files:
- `agents/advisor/infra/modules/roleassignments.bicep` — lines 19–20 (new param), 23–26 (new existing resource reference), 37 and 49 (scope changed from `resourceGroup()` to `searchService`)
- `agents/advisor/infra/main.bicep` — roleAssignments module call: added `searchServiceName: search.outputs.name`

This aligns all ARM RBAC assignments with least-privilege scoping (Key Vault scoped to KV, Search scoped to Search service, ACR scoped to RG due to `acrId` guid uniqueness — acceptable).

---

## Developer Access Path Decision

**Decision (OPEN-SEC-01): Azure Portal built-in explorers (zero cost, no infra) for data validation + Point-to-Site VPN for code-level debugging.**

### Why Not the Other Options

| Option | Verdict | Reason |
|--------|---------|--------|
| **Azure Bastion** | ❌ Not for POC | ~$140/month for a POC is unjustified |
| **Jumpbox VM** | ❌ Not preferred | Adds a persistent VM to manage and patch; cost without significant benefit over P2S VPN |
| **Temporary public access** | ❌ Rejected | Defeats the private-endpoint model; cannot be "temporary" in practice |
| **Dev Tunnel** | ❌ Not applicable here | Dev Tunnels expose local ports to the internet; they do not tunnel developer traffic into a VNet to reach private endpoints |

### Recommended Path: Two Tiers

**Tier 1 — Zero cost, zero infra: Azure Portal data explorers**

The Azure Portal's built-in data explorers for Cosmos DB (Data Explorer tab) and AI Search (Search Explorer tab) run within Azure's control plane and reach private endpoint services directly — no VPN required. This covers:

- Cosmos DB: browsing containers, running SQL queries, inspecting documents
- AI Search: running index queries, inspecting schema and document counts
- Key Vault: reading secret names and metadata (not values) in Portal

This is sufficient for 90% of day-to-day data validation in the POC sprint.

**Tier 2 — P2S VPN (~$30/month): Code-level debugging**

When developers need to run `@advisor/api` locally against cloud Cosmos DB / AI Search (e.g., to test a new Cosmos query without deploying), a Point-to-Site VPN Gateway (Basic SKU) provides the connection. The VPN client routes traffic for `10.0.0.0/16` through the gateway, resolves `privatelink.documents.azure.com` through Azure Private DNS, and reaches the private endpoints as if running inside the VNet.

Setup notes (when Tier 2 is needed):
1. Provision a VPN Gateway in the VNet (new subnet `gw-subnet 10.0.2.0/27` — does not conflict with existing subnets).
2. Generate root CA + client certificates; distribute client cert to dev team.
3. Azure VPN client on developer laptops.
4. Add a `gw-subnet` to `network.bicep` when this is provisioned.

> **POC sprint decision:** Defer VPN provisioning to the sprint where local debugging against cloud services is explicitly needed. Use Tier 1 (Portal explorers) and the Cosmos DB Emulator / local mock mode for day-to-day development. If a developer needs Tier 2 before it is provisioned, use Azure Cloud Shell (portal-hosted, already inside Azure's backbone) as a bridge — `az cosmosdb sql document list` and `az search query` work from Cloud Shell without VPN.

### Exception Policy

If any team member temporarily enables public network access on a data service for debugging:

1. Raise a PR comment tagged `[SEC-EXCEPTION]` before making the change.
2. Time-box to 24 hours maximum.
3. Immediately revert via Bicep (do not use Portal toggle — Bicep must remain the source of truth).
4. Record the exception in `.squad/decisions/inbox/security-identity-networking.md`.

---

## Production Gaps (Not POC-Blocking)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| ACR has public access | Image layer metadata accessible publicly | Add ACR private endpoint + IP allowlist for production |
| ACA CORS `allowedOrigins: ['*']` (`containerapp.bicep` line 85) | Any origin can call the API | Lock down to front-end hostname before external demo |
| KV soft-delete retention = 7 days | Short recovery window | Increase to 90 days for production |
| No NSG on pe-subnet | Lateral movement within VNet is unrestricted | Add NSG to pe-subnet allowing only inbound from aca-subnet for production |
| App Insights ingestion is public | Log data goes over public internet | Acceptable for POC; use App Insights with VNet integration for production |
| VPN Gateway not provisioned | Developers cannot run local code against cloud data services | Provision Basic SKU VPN Gateway when code-level cloud debugging is needed |
