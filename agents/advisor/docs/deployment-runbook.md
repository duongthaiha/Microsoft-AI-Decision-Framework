# Deployment Runbook — AI Framework Advisor Agent POC

_Owner: Dozer (DevOps)_  
_Last updated: 2026-05-29_  
_Scope: `agents/advisor/` workspace_

---

## Overview

This runbook covers provisioning the Azure infrastructure, deploying the `@advisor/api` container, and tearing it all down. Infrastructure is Bicep; deployment is driven by the **Azure Developer CLI (`azd`)** from the `agents/advisor/` directory.

The architecture follows **AD-01 through AD-07** (see `docs/architecture-decisions.md`):

- Hosting: **Azure Container Apps** (scale-to-zero for POC cost control)
- Data services: **Cosmos DB** (conversation state) + **Azure AI Search** (project knowledge)
- Security: **User-assigned managed identity** for all service access; data services **private endpoint only**; public network access disabled on Cosmos DB, AI Search, and Key Vault
- Public ingress: API container only

---

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Azure Developer CLI (`azd`) | 1.9+ | `winget install microsoft.azuredeveloper` or `brew install azd` |
| Azure CLI (`az`) | 2.57+ | Used by azd internally; `az bicep install` to get Bicep |
| Bicep CLI | 0.28+ | Installed automatically by `az bicep install` |
| Node.js | 20+ | For local build/dev only; Azure builds in ACR Tasks |
| Docker (optional) | 24+ | For local image testing only; azd uses remote build |
| Azure subscription | — | Contributor + User Access Administrator at subscription scope |

### Required permissions

Your Azure identity needs:

- **Contributor** on the target subscription (to create resource group and resources)
- **User Access Administrator** on the subscription (to assign RBAC roles in Bicep)

---

## First-time setup

### 1. Clone the repository

```bash
git clone https://github.com/duongthaiha/Microsoft-AI-Decision-Framework.git
cd Microsoft-AI-Decision-Framework/agents/advisor
```

### 2. Log in with azd

```bash
azd auth login
# Follow the browser prompt — use your Azure AD work account
```

### 3. Initialize the azd environment

```bash
azd env new poc-dev
# azd will prompt for:
#   AZURE_ENV_NAME  (e.g. poc-dev)
#   AZURE_LOCATION  (e.g. eastus2 or uksouth)
```

### 4. Set optional environment values

```bash
# All values below are optional — defaults shown in main.parameters.json
azd env set ADVISOR_AGENT_MODE mock          # or copilot
azd env set COSMOS_DATABASE_NAME advisor
azd env set SEARCH_INDEX_NAME advisor-project-knowledge
azd env set CONTAINER_APP_MIN_REPLICAS 0
azd env set CONTAINER_APP_MAX_REPLICAS 3
```

> **No secrets here.** `COSMOS_ENDPOINT`, `SEARCH_ENDPOINT`, and
> `APPINSIGHTS_CONNECTION_STRING` are Bicep outputs wired automatically
> as env vars on the Container App — you never set them manually.

---

## Provision infrastructure

```bash
# From agents/advisor/
azd provision
```

This runs `az deployment sub create` with `infra/main.bicep` and creates:

| Resource | Purpose |
|---|---|
| Resource group `rg-advisor-{env}` | Container for all resources |
| User-assigned managed identity | Service identity for Container App |
| VNet `10.0.0.0/16` with two subnets | Private network backbone |
| Log Analytics + Application Insights | Observability |
| Key Vault (private endpoint) | Secret store (future secrets rotation) |
| Cosmos DB for NoSQL — Serverless (private endpoint) | Session + guidance store |
| Azure AI Search — Basic SKU (private endpoint) | Project knowledge index |
| Azure Container Registry — Basic | Container image store |
| Container Apps Environment (VNet-integrated) | Hosting environment |
| Container App `ca-advisor-{token}` | API service |
| RBAC assignments | Grant managed identity access to each data service |

**Expected duration:** 15–25 minutes (private endpoints and DNS zones are the slowest).

---

## Deploy the API service

After infrastructure is provisioned:

```bash
# From agents/advisor/
azd deploy
```

This:
1. Builds the Docker image from `agents/advisor/Dockerfile` using ACR Tasks (remote build — no local Docker required).
2. Pushes the image to ACR.
3. Updates the Container App to pull the new image using the managed identity.

**Expected duration:** 5–10 minutes.

---

## Full provision + deploy in one command

```bash
azd up
```

Equivalent to `azd provision && azd deploy`. Use for the first run or after infra changes.

---

## Post-deploy validation

Run the validation script to confirm the deployed app is healthy and can reach private data services from the Container App host:

```powershell
# From agents/advisor/
.\infra\scripts\validate-deployment.ps1 `
  -EnvironmentName poc-dev `
  -ResourceGroupName (azd env get-values | Select-String 'AZURE_RESOURCE_GROUP' | ForEach-Object { ($_ -split '=')[1].Trim('"') })
```

Or pass values explicitly:

```powershell
.\infra\scripts\validate-deployment.ps1 `
  -AppFqdn "<FQDN from azd env get-values>" `
  -ResourceGroupName "rg-advisor-poc-dev" `
  -ContainerAppName "ca-advisor-<token>"
```

See [validate-deployment.ps1](../infra/scripts/validate-deployment.ps1) for full documentation.

---

## Checking outputs

```bash
azd env get-values
# Prints all environment outputs including:
#   AZURE_CONTAINER_APP_FQDN
#   COSMOS_ENDPOINT
#   SEARCH_ENDPOINT
#   KEY_VAULT_ENDPOINT
#   AZURE_CLIENT_ID
#   APPINSIGHTS_CONNECTION_STRING
```

---

## Re-provisioning after Bicep changes

```bash
azd provision
# Bicep is idempotent — re-running updates changed resources only
```

If you change the Bicep and want to validate syntax before deploying:

```bash
az bicep build --file infra/main.bicep
# Fix any errors shown before running azd provision
```

---

## Teardown

```bash
# Deletes all resources and the resource group
azd down
# azd will ask for confirmation — type 'y'
```

> **Warning:** This permanently deletes Cosmos DB data. For POC, that's
> fine. For shared environments, export data first.

---

## Troubleshooting

### "Unable to reach private endpoint" during provisioning

Container Apps VNet integration requires the subnet to be at least `/23` and delegated to `Microsoft.App/environments`. This is configured in `infra/modules/network.bicep`. If you see delegation errors, confirm no other resource is using the `aca-subnet`.

### "403 Forbidden" from Cosmos DB or AI Search

The managed identity RBAC assignments take up to 5 minutes to propagate. Wait and retry. If the issue persists, check that the Container App is using the correct `AZURE_CLIENT_ID` from `azd env get-values`.

### Container App shows placeholder page after `azd provision` (before `azd deploy`)

Expected — the initial container image is `mcr.microsoft.com/azuredocs/containerapps-helloworld`. Run `azd deploy` to push the real API image.

### Cosmos DB write access denied in application logs

The Cosmos DB data-plane RBAC assignment (Built-in Data Contributor) is done inside `infra/modules/cosmosdb.bicep` using `sqlRoleAssignments`. ARM RBAC alone is not sufficient for Cosmos DB data plane operations.

---

## Developer access to private services

> **Open item for Ghost (Security):** The private endpoints for Cosmos DB, AI Search, and Key Vault are only reachable from within the VNet. Developers cannot query these services directly from their laptops without one of: a VPN gateway connected to the VNet, a jumpbox VM in the VNet, Azure Bastion, or a Dev Tunnel. Options and trade-offs:

| Option | Cost | Security | Dev Experience |
|---|---|---|---|
| VPN Gateway (P2S) | ~$30/month | High | Good after setup |
| Jumpbox VM (B2s) | ~$35/month | High | Requires RDP/SSH |
| Azure Bastion | ~$140/month | Highest | Good UX |
| Dev Tunnel (`azd tunnel`) | Free | Medium | Best DX, POC only |
| Temporary PE exception | $0 | Low | Avoid in shared env |

For the POC, `ADVISOR_AGENT_MODE=mock` allows local development without any Azure connectivity. The real adapters (Cosmos DB, AI Search) are not yet wired — when Tank wires them (Wave 3), a dev access decision is needed.

---

## POC limitations

| Limitation | Impact | Production path |
|---|---|---|
| No Entra External ID auth | API is unauthenticated; anyone with the FQDN can call it | Add Entra External ID middleware (AD-06) |
| Scale-to-zero (`minReplicas: 0`) | Cold start latency 5–30s | Set `minReplicas: 1` or use Copilot SDK warm-up |
| Cosmos DB Serverless | No provisioned throughput; latency spikes under burst | Switch to Provisioned for production |
| AI Search Basic SKU | Single replica, no SLA | Upgrade to Standard with replicas |
| Single region | No geo-redundancy | Add secondary region + failover |
| Container App — no custom domain / TLS cert | HTTPS works via *.azurecontainerapps.io | Add custom domain + managed cert |
| No secrets rotation automation | Key Vault rotation is manual | Wire Key Vault rotation policies + Event Grid trigger |
| No API Management | No rate limiting, no API versioning | Add APIM tier (AD-07 open question) |
