# M2 Foundry Hosted Agent — Current State & M2.1 Handoff

**Status:** M2.1 Follow-up — Preview API not yet IaC-stable  
**Owner:** Parker (DevOps/SRE)  
**Date:** 2026-05-27  
**Spec ref:** FR-003, product-spec.md §9

---

## What "Foundry Hosted Agent" actually means

Foundry Hosted Agent is **a container hosting service, not an endpoint registry.** When you "register" an agent with Foundry, you give it a container image URI, and Foundry's platform provisions its own isolated sandbox (with a dedicated Entra agent identity) to run that container. It is analogous to Azure Container Apps but managed by the Foundry gateway, which handles the protocol routing, SSE streaming, and health checks.

This means the advisor container must be deployed **twice** — once to our Azure Container Apps environment (for internal callers and the SWA front-end), and once to Foundry (so Copilot/M365 ecosystem callers can invoke it via the Foundry gateway).

---

## Current blockers (why M2.1)

### Blocker 1 — No Foundry project provisioned

Foundry Hosted Agent requires a **Microsoft.CognitiveServices/accounts** resource of `kind=AIServices` with project management enabled, plus a child `projects` resource. Neither exists in our current infra.

What needs to be added to `infra/modules/foundry.bicep`:

```bicep
resource aiServicesAccount 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: '${namePrefix}-foundry-${uniqueString(resourceGroup().id)}'
  location: location
  kind: 'AIServices'
  sku: { name: 'S0' }
  properties: {
    allowProjectManagement: true
    publicNetworkAccess: 'Enabled'
  }
  identity: { type: 'SystemAssigned' }
}

resource foundryProject 'Microsoft.CognitiveServices/accounts/projects@2025-04-01-preview' = {
  parent: aiServicesAccount
  name: '${namePrefix}-project'
  location: location
  properties: {
    description: 'Advisor Agent Foundry Project'
    displayName: 'Advisor Agent'
  }
}
```

> ⚠️ The `2025-04-01-preview` API version is the latest as of 2026-05-27 — verify against
> [Microsoft Learn Bicep types](https://learn.microsoft.com/azure/templates/microsoft.cognitiveservices/accounts)
> before applying.

### Blocker 2 — Container does not implement the Foundry protocol library

Foundry Hosted Agent requires containers to use the **`azure-ai-agentserver-responses`** (Python) or **`Azure.AI.AgentServer.Responses`** (.NET) protocol library. This library:

- Exposes a `/responses` endpoint (NOT `/v1/responses` as we have today)
- Handles SSE streaming, request lifecycle (created → in_progress → completed)
- Exposes `/readiness` for platform health checks

Our current Express app uses a custom `/v1/responses` route. This route works for direct callers and the SWA front-end, but the Foundry gateway will not route to it correctly.

**M2.1 work:** Either (a) add the Node.js `@azure/ai-agent-server-responses` library alongside the existing Express route (dual-protocol container), or (b) create a separate Foundry-flavoured container image.

### Blocker 3 — No Bicep resource type for agent version registration

There is no GA Bicep/ARM resource type for registering a Foundry Hosted Agent **version** (image + protocol definition). The only supported methods are:

- **Python SDK** — `azure.ai.projects>=2.1.0` `project.agents.create_version(...)`
- **azd + VS Code extension** — handles build, push, RBAC, and version registration
- **REST API** — direct HTTP to the Foundry data-plane

Bicep can provision the Foundry *project* (Blocker 1), but the agent version lifecycle must be driven post-deployment via script or SDK.

---

## What IS working today

| Layer | Status | Notes |
|---|---|---|
| App Insights | ✅ M2 shipped | Log Analytics + App Insights, `requestProcessed` custom events |
| ACA endpoint `/v1/responses` | ✅ Live | Used by SWA + direct API callers |
| `monitoring.bicep` | ✅ | Workspace-based, 30-day retention |
| `foundry.bicep` placeholder | ✅ | Documented, ready to expand |
| `scripts/register-foundry-agent.sh` | 🟡 Reference | Runs when Blockers 1+2 are resolved |

---

## M2.1 handoff — what to do next

### Step 1 — Provision Foundry project (infra)

Add the `Microsoft.CognitiveServices/accounts` + project resource to `infra/modules/foundry.bicep` (see snippet above). Run `azd provision`.

Verify:
```bash
az cognitiveservices account show \
  -n advisor-foundry-<suffix> \
  -g rg-advisor-dev \
  --query "properties.provisioningState"
```

### Step 2 — Grant RBAC

The advisor agent managed identity (`advisor-agent-identity`) needs **Foundry User** on the project:
```bash
az role assignment create \
  --role "Azure AI User" \
  --assignee <agent-mi-principal-id> \
  --scope /subscriptions/<sub>/resourceGroups/rg-advisor-dev/providers/Microsoft.CognitiveServices/accounts/<account>
```

### Step 3 — Implement protocol library in the container

Add the Node.js Foundry Agent Server library (when available for JS) or implement the `/responses` endpoint shape manually per the [Responses protocol spec](https://learn.microsoft.com/azure/foundry/agents/how-to/deploy-hosted-agent#responses-protocol-library). Expose both `/v1/responses` (existing) and `/responses` (Foundry protocol).

### Step 4 — Register agent version (post-deploy)

With Blocker 1+2 resolved, run the reference script:
```bash
export FOUNDRY_PROJECT_ENDPOINT="https://advisor-foundry-<suffix>.services.ai.azure.com/api/projects/advisor-project"
export CONTAINER_IMAGE="<acr-login-server>/advisor-agent:<revision-tag>"
bash scripts/register-foundry-agent.sh
```

Or add to `azure.yaml` as a `postdeploy` hook:
```yaml
hooks:
  postdeploy:
    shell: sh
    run: bash scripts/register-foundry-agent.sh
    continueOnError: true   # Don't fail the deploy if Foundry is unavailable
    interactive: false
```

### Step 5 — Verify JWT audience

The Foundry gateway will invoke our ACA endpoint with an Entra token. The `aud` claim on Foundry-issued tokens must match `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`. Verify by inspecting an incoming token at the `/v1/responses` route. If the audience differs (Foundry may use its own app registration), update the `ENTRA_API_AUDIENCE` param in `infra/main.bicep` accordingly.

---

## Microsoft Learn references (2026)

- [Hosted agents in Foundry Agent Service (Preview)](https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents)
- [Deploy a hosted agent — Python SDK & REST](https://learn.microsoft.com/azure/foundry/agents/how-to/deploy-hosted-agent)
- [Quickstart: Create and deploy a Hosted agent (azd)](https://learn.microsoft.com/azure/foundry/agents/quickstarts/quickstart-hosted-agent)
- [Hosted agent permissions reference](https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agent-permissions)
- [Bicep: Microsoft.CognitiveServices/accounts](https://learn.microsoft.com/azure/templates/microsoft.cognitiveservices/accounts)

---

*Written by Parker — 2026-05-27T07:00:00Z*
