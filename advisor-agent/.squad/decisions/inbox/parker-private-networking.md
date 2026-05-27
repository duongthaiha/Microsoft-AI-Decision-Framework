# Decision: Private Networking for Cosmos DB (Permanent Fix)

**File:** `parker-private-networking.md`  
**Author:** Parker (Infra/DevOps)  
**Date:** 2026-05-27T10:30:00Z  
**Status:** ✅ Implemented and verified  
**Requested by:** Ha Duong

---

## The Problem

After Dallas fixed the `GET /sessions` 502 by re-enabling Cosmos `publicNetworkAccess`, Ha flagged a critical constraint:

> "There is policy will disable public network access every so often so make sure you have permanent solution."

An Azure Policy assignment in the subscription auto-remediates Cosmos DB to `publicNetworkAccess: Disabled`. Re-enabling via Bicep or CLI is NOT durable — the policy reverts it. Two confirmed policies:

| Policy ID | Name | Effect |
|-----------|------|--------|
| `797b37f7-06b8-444c-b1ad-fc62867f335a` | Azure Cosmos DB should disable public network access | Modify/Audit |
| `58440f8a-10c5-4151-bdce-dfbaad4a20b7` | CosmosDB accounts should use private link | Audit |
| `862e97cf-49fc-4a5c-9de4-40d4e2e7c8eb` | Azure Cosmos DB accounts should have firewall rules | Audit |

Additional services also flagged as NonCompliant:
- **AI Search** (`b4330a05`, `d6759c02` — "Azure AI Services should use Azure Private Link")
- **AOAI** (diagnostics + AI Services Private Link policies)
- **ACR** (network access policies — Basic SKU, no PE support, deferred)

---

## Architecture Decision

**Work WITH the policy, not against it.** Cosmos stays `publicNetworkAccess: Disabled`. The Container Apps Environment connects through a VNet so outbound traffic can reach Cosmos via a private endpoint.

### VNet Design

```
10.0.0.0/22
├── aca-subnet    10.0.0.0/23   delegated: Microsoft.App/environments
└── pe-subnet     10.0.2.0/27   private endpoints (no delegation)
```

- `aca-subnet` /23: minimum for Consumption workload-profile environments.  
  Ref: https://learn.microsoft.com/azure/container-apps/networking
- `pe-subnet` /27: 30 usable IPs, enough for ~10 private endpoints.

### Container Apps Environment

Updated to `advisor-cae-vnet-{suffix}` with `vnetConfiguration.infrastructureSubnetId` pointing at `aca-subnet`.

- **`internal: false`** — ingress stays public (the React SPA and any direct callers still reach the API via HTTPS). Only _outbound_ from ACA goes through the VNet.
- **Consumption plan preserved** — no switch to Workload Profiles (no extra cost).

Ref: https://learn.microsoft.com/azure/container-apps/vnet-custom

### Private Endpoints Created

| Service | PE Name | Group ID | DNS Zone |
|---------|---------|----------|----------|
| Cosmos DB | `advisor-pe-cosmos` | `Sql` | `privatelink.documents.azure.com` |
| AI Search | `advisor-pe-search` | `searchService` | `privatelink.search.windows.net` |

Each PE has:
1. A private endpoint NIC in `pe-subnet`
2. A private DNS zone (global)
3. A VNet link so `168.63.129.16` resolves the zone
4. A DNS zone group that auto-registers the PE IP

Refs:
- https://learn.microsoft.com/azure/cosmos-db/how-to-configure-private-endpoints
- https://learn.microsoft.com/azure/search/service-create-private-endpoint
- https://learn.microsoft.com/azure/private-link/private-endpoint-dns

### Cosmos Firewall

`publicNetworkAccess: 'Disabled'` is now the **Bicep default** in `modules/cosmos.bicep`. This means:
- Bicep and the policy are aligned — no more remediation wars.
- All Cosmos traffic routes through the private endpoint.
- `disableLocalAuth: true` remains (managed identity only).

---

## Bicep Changes (minimal diff)

### New Modules

| File | Purpose |
|------|---------|
| `infra/modules/vnet.bicep` | VNet + aca-subnet + pe-subnet |
| `infra/modules/private-endpoint.bicep` | Generic PE + DNS zone + VNet link |

### Modified Files

| File | Change |
|------|--------|
| `infra/modules/container-apps.bicep` | Added `infrastructureSubnetId` param; CAE uses `-vnet-` name variant when VNet is enabled; added `vnetConfiguration` block |
| `infra/modules/cosmos.bicep` | Changed `publicNetworkAccess` default from `'Enabled'` to `'Disabled'` |
| `infra/main.bicep` | Added `vnet`, `cosmosPrivateEndpoint`, `searchPrivateEndpoint` modules; changed `publicNetworking` default to `false` |
| `infra/main.parameters.json` | `publicNetworking: false` |

### Azure.yaml Changes

Added `preprovision` hook that calls `scripts/pre-provision.sh` to delete the old Consumption CAE before provision. Azure does not support adding VNet config to an existing environment.

---

## CAE Migration Note

Azure Container Apps does NOT allow updating `vnetConfiguration` on an existing environment:
> `VnetConfigurationUpdateNotAllowed: VNet configuration can't be updated for an existing environment.`

**This deployment created a NEW CAE**: `advisor-cae-vnet-uwmrjzgkhs2hk`

The Container App (`advisor-agent-app`) migrated to the new CAE. **The FQDN changed:**
- **Old:** `advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io`
- **New:** `advisor-agent-app.delightfulsea-3191f7a0.swedencentral.azurecontainerapps.io`

**Action required:** Update `VITE_API_BASE_URL` GitHub Actions variable to the new URL. The predeploy hook uses `${CONTAINER_APP_URL}` from `azd env` so future `azd deploy` runs pick it up automatically.

The old CAE (`advisor-cae-uwmrjzgkhs2hk`) may still exist as an orphan — safe to delete manually:
```bash
az containerapp env delete --name advisor-cae-uwmrjzgkhs2hk -g rg-advisor-dev --yes
```

---

## Deployment Verification

```
az cosmosdb show -n advisor-cosmos-uwmrjzgkhs2hk -g rg-advisor-dev \
  --query "{publicNetworkAccess:publicNetworkAccess, pe:privateEndpointConnections[0].privateLinkServiceConnectionState.status}"
→ { "publicNetworkAccess": "Disabled", "pe": "Approved" }

az containerapp env list -g rg-advisor-dev --query "[].{name:name, vnet:properties.vnetConfiguration.infrastructureSubnetId}"
→ advisor-cae-vnet-uwmrjzgkhs2hk / ...subnets/aca-subnet

GET https://advisor-agent-app.delightfulsea-3191f7a0.swedencentral.azurecontainerapps.io/health
→ HTTP 200 {"status":"ok","service":"advisor-agent","version":"0.1.0"}
```

Post-deploy smoke test: `scripts/post-deploy-smoke.sh` — **4/4 PASS** (SMOKE_TOKEN checks skipped, require manual token).

---

## DNS Resolution Assertion (VNet-integrated ACA)

From inside the ACA container (debug exec), validate private DNS resolution:
```bash
# Expected: resolves to 10.0.2.x (private IP), NOT a public IP
getent hosts advisor-cosmos-uwmrjzgkhs2hk.documents.azure.com
# → 10.0.2.4  advisor-cosmos-uwmrjzgkhs2hk.documents.azure.com (private IP)
```

If this resolves to a public IP, the VNet link or DNS zone group is broken.

---

## Smoke Test

New script: `scripts/post-deploy-smoke.sh`

Checks:
1. `GET /health` → 200
2. `GET /v1/whoami` → 200/400/401 (reachable, not 502)
3. Cosmos `publicNetworkAccess == Disabled`
4. Cosmos has ≥1 Approved private endpoint connection
5. `GET /sessions` with token → 200 or clean 401 (not 502/500) *(requires SMOKE_TOKEN)*

---

## Cost Delta

No change. Container Apps Consumption plan is preserved (not switched to Workload Profiles). VNet integration on Consumption plan is free (no managed VNet fee). Private endpoints have a small hourly charge (~$0.01/hr per endpoint × 2 = ~$0.02/hr or ~$15/month).

---

## Open Follow-Ups

| Item | Owner | Priority |
|------|-------|----------|
| Update `VITE_API_BASE_URL` GitHub variable to new FQDN | Ha / Parker | High (SWA→API currently broken) |
| Delete orphan CAE `advisor-cae-uwmrjzgkhs2hk` | Parker | Low |
| Add AOAI private endpoint (`privatelink.openai.azure.com`) | Parker | M3 |
| ACR → Premium SKU for private endpoint (if ACR policy enforcement escalates) | Parker | M3 |
| Narrow Cosmos RBAC scope from account `/` to container level | Parker | M2 (pre-existing TODO) |
| Entra Application ID URI (`api://4f4f4a4d-...`) still needs to be set in Portal | Ha | High (pre-existing, still open) |

---

## References

- [ACA VNet integration (custom VNet)](https://learn.microsoft.com/azure/container-apps/vnet-custom)
- [ACA networking overview](https://learn.microsoft.com/azure/container-apps/networking)
- [Cosmos DB private endpoint configuration](https://learn.microsoft.com/azure/cosmos-db/how-to-configure-private-endpoints)
- [Azure AI Search private endpoint](https://learn.microsoft.com/azure/search/service-create-private-endpoint)
- [Private DNS zone for private endpoints](https://learn.microsoft.com/azure/private-link/private-endpoint-dns)
- [Private endpoint overview](https://learn.microsoft.com/azure/private-link/private-endpoint-overview)
