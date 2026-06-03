# Skill: Seed a Private-Endpoint Azure AI Search Index

## When to Use This Skill

Use this pattern when you need to create an Azure AI Search index and upload seed documents, but:
- The AI Search service has **public network access disabled** (private endpoint only)
- Your dev machine is NOT in the VNet and cannot reach the Search endpoint
- You have a running compute resource (Container App, App Service, AKS pod) that IS in the VNet and uses managed identity

---

## The Pattern: Guarded Admin Endpoint Inside the Container

The running container is VNet-integrated → it can reach Search via private endpoint → expose a guarded admin endpoint → call it via the container's public URL.

### Key advantages
- No new infrastructure (container already running)
- No credential exposure (auth via managed identity inside container)
- No public access risk (guard env var controls the endpoint)
- Idempotent (upsert semantics — safe to run multiple times)

---

## Implementation Steps

### Step 1 — Fix index name handling (common bug)

If your index definition has a hardcoded `name` property, and your app uses an env var for the index name, you must override it when calling `createOrUpdateIndex`:

```typescript
async ensureIndex(): Promise<void> {
  await this.indexClient.createOrUpdateIndex({
    ...INDEX_DEFINITION,
    name: this.options.indexName,  // override static name with configured name
  });
}
```

Without this, `ensureIndex()` creates a different index than the one the search client queries.

### Step 2 — Add a guarded seed endpoint to the API

```typescript
// In your Express app (or equivalent):
app.use('/admin/seed', buildAdminSeedRouter());

function buildAdminSeedRouter(): express.Router {
  const router = express.Router();

  // Guard — disabled unless ENABLE_ADMIN_SEED=true
  router.use((_req, res, next) => {
    if (process.env['ENABLE_ADMIN_SEED'] !== 'true') {
      res.status(403).json({ ok: false, error: { code: 'FORBIDDEN' } });
      return;
    }
    next();
  });

  router.post('/my-index', async (req, res) => {
    const endpoint = process.env['SEARCH_ENDPOINT']!;
    const indexName = process.env['SEARCH_INDEX'] ?? 'my-default-index';

    const searchClient = new MySearchAdapter({ endpoint, indexName });
    await searchClient.ensureIndex();
    await searchClient.uploadDocuments(SEED_DOCUMENTS.map(MySearchAdapter.toSearchDocument));

    res.json({ ok: true, data: { indexName, documentsSeeded: SEED_DOCUMENTS.length } });
  });

  return router;
}
```

### Step 3 — Seed workflow

```bash
BASE_URL="https://your-container.azurecontainerapps.io"

# 1. Enable the seed endpoint
az containerapp update \
  --name <app-name> --resource-group <rg> \
  --set-env-vars ENABLE_ADMIN_SEED=true

# 2. Trigger the seed
curl -X POST "$BASE_URL/admin/seed/my-index" \
  -H "Content-Type: application/json" -d '{}'

# 3. IMPORTANT: Disable immediately after seeding
az containerapp update \
  --name <app-name> --resource-group <rg> \
  --remove-env-vars ENABLE_ADMIN_SEED
```

---

## Diagnosing Network Access

To reliably check whether AI Search public access is disabled, use `az rest` (not `az search service show` — it uses an older API version that returns null):

```bash
az rest \
  --method GET \
  --url "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Search/searchServices/{name}?api-version=2023-11-01" \
  --query "properties.{publicNetworkAccess:publicNetworkAccess,disableLocalAuth:disableLocalAuth}"
```

---

## Why Not Alternative Options?

| Option | Notes |
|---|---|
| Container Apps Job | Viable for batch/CI pipelines; more setup than needed when container is already running |
| Temporarily enable public access | Against Azure Policy on regulated subscriptions; risk of forgetting to re-disable; leaves a firewall change history |
| Jumpbox / bastion | Works but heavy; overkill for a one-off seed |
| `az network private-endpoint` tunnel | Complex; not needed if container is already accessible |

---

## Reference Implementation

See `agents/advisor/data/src/search/AzureAiSearchProjectSearch.ts` and `agents/advisor/api/src/app.ts` (`buildAdminSeedRouter`) for the reference implementation used in the AI Framework Advisor POC.

Repeatable seed script: `agents/advisor/data/scripts/seed-via-admin-endpoint.ps1`  
Full seeding docs: `agents/advisor/data/docs/seeding.md`
