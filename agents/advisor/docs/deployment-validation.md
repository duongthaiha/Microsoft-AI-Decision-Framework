# Deployment Validation Checklist

**AI Framework Advisor Agent POC — post-`azd up` validation**

Run these checks after every deployment to confirm the application is healthy and all
external connectivity is working. Each check should return a clear PASS or FAIL within
2 minutes of execution.

---

## Prerequisites

- `azd up` (or equivalent) completed with exit code 0
- Azure CLI authenticated with permissions on the target resource group
- Shell access (PowerShell or bash) on the deployment machine
- Values from the `.azure/<env>/.env` file or Key Vault references loaded

---

## 1. Public App / API health

| Check | Command | Expected result |
|---|---|---|
| API HTTP health endpoint | `curl -sf https://<API_HOST>/health` | HTTP 200, body `{"ok":true}` |
| API returns typed error on unknown route | `curl -sf https://<API_HOST>/unknown-path` | HTTP 404, body contains `"code":"INTERNAL_ERROR"` or route not found |
| Web UI loads (if deployed) | `curl -sf https://<WEB_HOST>/` | HTTP 200, HTML response |
| API CORS header present | `curl -I https://<API_HOST>/health` | `Access-Control-Allow-Origin` header present |

**Manual check:** Open `https://<WEB_HOST>/` in a browser and confirm the intake form renders without JS errors.

---

## 2. Cosmos DB reachability

| Check | Command | Expected result |
|---|---|---|
| Cosmos DB account accessible | `az cosmosdb show --name <COSMOS_ACCOUNT> --resource-group <RG>` | `provisioningState: Succeeded` |
| Database and container exist | `az cosmosdb sql container show --account-name <COSMOS_ACCOUNT> --database-name advisor --name sessions --resource-group <RG>` | Container metadata returned |
| API can create + load a session | POST `/sessions` → GET `/sessions/:id` via curl | Session ID returned and loadable |
| Sessions TTL is configured | Container metadata `defaultTtl` field | Non-null value (e.g. `86400` for 24 h) |

**Note:** In Wave 2 (in-memory) this check is always green. Wire these checks in Wave 3 when Cosmos DB adapters are active.

---

## 3. Azure AI Search reachability over private connectivity

| Check | Command | Expected result |
|---|---|---|
| Search service is running | `az search service show --name <SEARCH_SERVICE> --resource-group <RG>` | `provisioningState: Succeeded`, `status: running` |
| Index exists | `az search index show --service-name <SEARCH_SERVICE> --name advisor-project-knowledge --resource-group <RG>` | Index schema returned |
| API search query succeeds | GET `/sessions/:id/similar-projects` with a valid session | `searchResult` in response, or `noMatchFound: true` with reason |
| Private endpoint resolves (if VNet-injected) | `nslookup <SEARCH_SERVICE>.search.windows.net` from deployment subnet | Private IP returned (not public IP) |

**Note:** In Wave 2 the `InMemoryProjectSearch` is used. Activate these checks in Wave 3 when `AzureAISearchProjectSearch` is wired.

---

## 4. Application Insights telemetry

| Check | Command | Expected result |
|---|---|---|
| App Insights resource exists | `az monitor app-insights component show --app <AI_NAME> --resource-group <RG>` | Resource metadata returned |
| Connection string in API env | `echo $APPLICATIONINSIGHTS_CONNECTION_STRING` | Non-empty string |
| Telemetry is flowing | App Insights → Live Metrics tab | Requests and dependencies visible within 60 s of a test call |
| No high error rate | App Insights → Failures blade | < 1% error rate after a successful flow test |

---

## 5. End-to-end smoke test

Run the NFU Mutual regression directly against the deployed API:

```bash
# Set API_BASE to the deployed API URL
export ADVISOR_API_BASE=https://<API_HOST>

# Run the programmatic regression
cd agents/advisor
npm run regression
```

Expected output: all assertions PASS, exit code 0.

If the regression is not yet wired for HTTP mode, run the CLI harness locally with the production Cosmos/Search env vars:

```bash
ADVISOR_AGENT_MODE=cosmos \
COSMOS_ENDPOINT=https://<COSMOS_ACCOUNT>.documents.azure.com:443/ \
AZURE_SEARCH_ENDPOINT=https://<SEARCH_SERVICE>.search.windows.net \
node agents/advisor/cli/dist/index.js --org org-nfum
```

---

## 6. Alignment with `validate-deployment` script (Dozer)

If Dozer's `validate-deployment` script is present at `agents/advisor/scripts/validate-deployment.sh`:

```bash
bash agents/advisor/scripts/validate-deployment.sh
```

The script should run the checks in sections 1–4 above automatically. If the script is absent,
use the manual curl/az commands above and record results in the deployment run log.

---

## Sign-off checklist

Before marking a deployment as successful, confirm:

- [ ] API health endpoint returns HTTP 200
- [ ] Web UI loads without JavaScript errors
- [ ] Cosmos DB container exists with correct TTL
- [ ] AI Search index exists with `advisor-project-knowledge`
- [ ] App Insights telemetry is flowing
- [ ] NFU Mutual regression script passes (or is noted as deferred for this wave)
- [ ] No error rate > 1% in App Insights Failures blade
- [ ] Any open blockers logged in `.squad/decisions/inbox/`

---

---

## Wave 3 Actual Validation Results (2026-05-29)

**Validated by:** Dozer  
**Environment:** advisor-poc, swedencentral  
**Container App:** ca-advisor-33wfyfewrvjcg  
**FQDN:** `https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io`

### Section 1 — API Health

| Check | Result |
|---|---|
| `GET /health` | ✅ HTTP 200 — `{"ok":true,"service":"@advisor/api","ts":"..."}` in 1.86s |
| CORS header | ✅ `Access-Control-Allow-Origin: *` present |
| Cold-start note | Container runs min-replicas=0 — first request after idle takes ~30-60s |

### Section 2 — Cosmos DB Reachability (from container, over private endpoint)

| Check | Result |
|---|---|
| `provisioningState` | ✅ Succeeded |
| `publicNetworkAccess` | ✅ Disabled |
| `sessions` container | ✅ Exists, TTL=-1 |
| `guidance` container | ✅ Exists |
| `POST /sessions` | ✅ HTTP 201 — session created, Cosmos write confirmed |
| `POST /sessions/:id/intake` | ✅ HTTP 200 — intake processed, Cosmos read+write confirmed |
| **Private endpoint reachability** | ✅ PROVEN — live traffic flowing through PE |

### Section 3 — AI Search Reachability (from container, over private endpoint)

| Check | Result |
|---|---|
| `provisioningState` | ✅ succeeded |
| `status` | ✅ running |
| `publicNetworkAccess` | ✅ Disabled |
| **Private endpoint reachability** | ✅ PROVEN — container received `RestError: index not found` (application-level 404 from Search API; proves PE path is open) |
| Index `advisor-project-knowledge` | ❌ Not seeded — `GET /sessions/:id/similar-projects` → 500 `SEARCH_FAILURE` |
| Index `framework-content` | ❌ Not seeded |

**Action required:** Run the data seed job (`npm run seed` in agents/advisor) to create and populate both indexes.

### Section 4 — Application Insights

| Check | Result |
|---|---|
| App Insights resource | ✅ provisioningState=Succeeded |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` in env | ✅ Present |
| Log Analytics receiving telemetry | ✅ Container logs visible in Log Analytics workspace |

### Section 5 — End-to-End Smoke Test

| Check | Result |
|---|---|
| Create session | ✅ HTTP 201 |
| Submit intake | ✅ HTTP 200 — Phase 1 BXT question returned (MockCopilotSession) |
| Similar projects | ❌ Blocked — Search indexes not seeded |

### Adapter Mode Summary

- **Data adapters (Cosmos + Search):** REAL Azure adapters active (both endpoints injected by Bicep)
- **LLM service:** MockCopilotSessionService (deterministic; `ADVISOR_AGENT_MODE=mock`)
- To enable real LLM: set `ADVISOR_AGENT_MODE=copilot` + inject `GITHUB_TOKEN`

### Sign-off

- [x] API health endpoint returns HTTP 200
- [ ] Web UI loads without JavaScript errors — *not deployed (web service deferred)*
- [x] Cosmos DB containers exist (`sessions`, `guidance`)
- [ ] AI Search index exists — **BLOCKED: not seeded**
- [x] App Insights / Log Analytics telemetry flowing
- [ ] NFU Mutual regression script — deferred (Search not seeded)
- [ ] Error rate check — insufficient traffic to measure
- [x] Open blockers logged — see `.squad/decisions/inbox/dozer-deploy.md`

*Last updated: 2026-05-29T18:44:22+01:00 by Dozer (post-deployment validation)*
