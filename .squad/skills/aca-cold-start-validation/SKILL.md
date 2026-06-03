# Skill: ACA Cold-Start Validation & Mock-vs-Real Adapter Detection

**Category:** DevOps / Azure Container Apps  
**Extracted from:** advisor-poc Wave 3 post-deployment validation (2026-05-29)

---

## Problem Pattern

After a `azd up` or `azd deploy`, the deployed Container App appears unresponsive:
- `/health` times out or returns a connection error
- You don't know if: (a) the container crashed, (b) it's a cold start, or (c) the health path is wrong
- The azd env shows `ADVISOR_AGENT_MODE=mock` and you're unsure if real Azure services are actually being used

---

## Diagnostic Runbook

### Step 1 — Check replica state (crash loop vs cold start vs not started)

```bash
az containerapp replica list --name <app-name> --resource-group <rg> --output json
```

**Interpret:**
- `runningState: Running` + `restartCount: 0` → container is **alive**, timeout was a cold start
- `runningState: Running` + `restartCount: N (N>3)` → **crash loop** — check logs
- Empty array → no replicas — `min-replicas=0` and container scaled to zero → **cold start pending**

### Step 2 — Pull container env vars (determines adapter mode)

```bash
az containerapp show --name <app> --resource-group <rg> \
  --query "properties.template.containers[0].env" --output json
```

**Key variables to check:**
| Variable | Present? | Effect |
|---|---|---|
| `COSMOS_ENDPOINT` | Yes + `SEARCH_ENDPOINT` | Real Azure data adapters active |
| `COSMOS_ENDPOINT` absent | — | In-memory adapters (offline mode) |
| `ADVISOR_AGENT_MODE=mock` | — | Only affects LLM service, NOT data adapters |
| `AZURE_CLIENT_ID` | Required | Enables DefaultAzureCredential to use managed identity |

**Critical insight:** `ADVISOR_AGENT_MODE=mock` ≠ in-memory mode if endpoint vars are present.
The composition root uses two independent gates.

### Step 3 — Get recent console logs (when `az containerapp logs` hangs)

`az containerapp logs show` can hang indefinitely. Use Log Analytics directly:

```powershell
$wsId = $(az monitor log-analytics workspace list --resource-group <rg> --query "[0].customerId" --output tsv)
az monitor log-analytics query --workspace $wsId `
  --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == '<app>' | order by TimeGenerated desc | take 40 | project TimeGenerated, Log_s" `
  --timespan PT15M --output json
```

**What to look for in startup logs:**
- `"COSMOS_ENDPOINT + SEARCH_ENDPOINT detected — using real Azure adapters"` → real data adapters active
- `"Azure adapters initialised"` → Cosmos + Search connections succeeded at startup
- `"Using MockCopilotSessionService"` → LLM is mock
- `"@advisor/api listening on port 3000"` → startup complete

### Step 4 — Probe health with generous timeout

Allow for cold start (ACA Consumption plan can take 30-60s to start a container):

```powershell
$url = "https://<fqdn>/health"
$response = Invoke-WebRequest -Uri $url -TimeoutSec 120 -UseBasicParsing
# Expected: HTTP 200, body {"ok":true,"service":"@advisor/api"}
```

### Step 5 — Prove private endpoint connectivity from the container

**Cosmos DB:** Issue a real API call that triggers a Cosmos write/read:
```bash
POST /sessions  {"customerOrganizationId":"validate-org"}
# HTTP 201 + sessionId returned → Cosmos private endpoint is reachable
```

**AI Search:** Issue a search-dependent call. A `SEARCH_FAILURE` with the message
`index 'X' was not found` (vs a TCP timeout or connection error) **proves** the private
endpoint path is open — the container reached the Search REST API.

```bash
GET /sessions/:id/similar-projects
# "RestError: The index 'X' was not found" → PE works, index not seeded
# "ECONNREFUSED" or connection timeout → PE broken
```

---

## Common Failure Patterns & Fixes

### Pattern: Search index not found (500 SEARCH_FAILURE)
- **Cause:** Index never seeded
- **Fix:** Run data seed job: `cd agents/advisor && npm run seed`
- **NOT a connectivity issue** — PE is working

### Pattern: Health timeout on first probe after deploy
- **Cause:** `min-replicas=0` cold start
- **Fix:** Wait 90s and retry. For demos, set `min-replicas=1` in Bicep.

### Pattern: `az containerapp logs show` hangs
- **Fix:** Use Log Analytics query (Step 3 above)

### Pattern: `ADVISOR_AGENT_MODE=mock` shows in azd env but you need real adapters
- **Reality:** Check for `COSMOS_ENDPOINT` + `SEARCH_ENDPOINT` — if present, real adapters ARE active
- The `ADVISOR_AGENT_MODE` only controls the LLM/Copilot SDK service

---

## Region Selection Gotcha: HTTP 409 Conflict on AI Search

AI Search service names are **globally unique** within Azure. A prior partial deployment can
leave a service name in "Deleting" state for 5-15 minutes, causing `HTTP 409 Conflict` on redeploy.

**Diagnosis:**
```bash
az deployment operation sub list --name <failed-deployment-name> \
  --query "[?properties.statusCode!='OK'].{resource:properties.targetResource.resourceType, status:properties.statusCode}"
# Look for: Microsoft.Resources/deployments + Conflict → check if it's the search module
```

**Fix options:**
1. Wait 15 minutes for the name to release and retry same region
2. Change region immediately (fastest for POC iteration)

**Note:** This is NOT a quota issue — quota errors appear as `QuotaExceeded`, not `Conflict`.
