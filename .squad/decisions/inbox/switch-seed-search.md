# Decision: AI Search Seeding Approach — `advisor-project-knowledge`

**Date:** 2026-06-03  
**Author:** Switch (Data Engineer)  
**Status:** Implemented and validated

---

## Context

The live POC deployment (RG `rg-advisor-advisor-poc`, swedencentral) had AI Search service `srch-advisor-33wfyfewrvjcg` with no index populated. `GET /sessions/:id/similar-projects` returned a Search 404. Two root causes:

1. **Index name mismatch bug**: `AzureAiSearchProjectSearch.ensureIndex()` used the hardcoded name from the static `PROJECT_KNOWLEDGE_INDEX_DEFINITION` (`project-knowledge`), not the configured `SEARCH_INDEX` env var (`advisor-project-knowledge`). Fixed by passing `{ ...DEFINITION, name: this.options.indexName }` to `createOrUpdateIndex`.

2. **No seeding had been run**: The seed loader existed (`data/src/seed/loader.ts`) but had never been executed against the live environment.

---

## Constraint: Private Endpoints

Azure AI Search confirmed via `az rest` (2023-11-01 API):
- `publicNetworkAccess: "Disabled"`
- `disableLocalAuth: true` (RBAC only — managed identity required)

This means dev machines cannot reach the Search or Cosmos endpoints directly. Only the Container App (which is VNet-integrated, acaSubnetId outbound) can reach these services.

> Note: `az search service show` returned null for both fields — it uses an older API version. Always use `az rest` with `api-version=2023-11-01` to inspect AI Search network config accurately.

---

## Options Considered

| Option | Decision |
|---|---|
| **(a) Guarded admin endpoint inside running container** | ✅ **Chosen** |
| (b) Container Apps Job (one-off seed job) | Viable but more setup; container already running |
| (c) Temporarily enable public access + IP firewall | ❌ Against Azure Policy; risk of forgetting to re-disable |

---

## Chosen Approach: Option (a) — Admin Endpoint Inside Container

### Why

- The container app is already running and VNet-integrated.
- It uses the managed identity (`e7054a1b-...`) which already has Search Index Data Contributor RBAC.
- No new infrastructure, no credential exposure, no public access risk.
- The endpoint re-uses the existing `AzureAiSearchProjectSearch` and `SEED_PROJECT_KNOWLEDGE_DOCUMENTS` — single source of truth for seed data.
- Idempotent: safe to run multiple times (upsert semantics via Azure AI Search `uploadDocuments`).

### Implementation

Added `POST /admin/seed/project-knowledge` to `@advisor/api/src/app.ts`:
- Guarded by `process.env['ENABLE_ADMIN_SEED'] === 'true'` — returns 403 otherwise.
- Dynamically imports `@advisor/data` (same pattern as existing Azure adapter path).
- Calls `projectSearch.ensureIndex()` (with the name-override fix), then `projectSearch.uploadDocuments()`.
- Returns `{ ok: true, data: { indexName, documentsSeeded, idempotent: true } }`.

### Workflow for re-seeding

```bash
# 1. Enable
az containerapp update --name ca-advisor-33wfyfewrvjcg --resource-group rg-advisor-advisor-poc --set-env-vars ENABLE_ADMIN_SEED=true

# 2. Seed
curl -X POST https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io/admin/seed/project-knowledge \
  -H "Content-Type: application/json" -d '{}'

# 3. Disable (important — do this immediately after seeding)
az containerapp update --name ca-advisor-33wfyfewrvjcg --resource-group rg-advisor-advisor-poc --remove-env-vars ENABLE_ADMIN_SEED
```

Or use the PowerShell script: `agents/advisor/data/scripts/seed-via-admin-endpoint.ps1`

---

## State After This Work (2026-06-03)

- ✅ `advisor-project-knowledge` index created and seeded with 6 documents
- ✅ NFU Mutual guidance (`instr-nfum-claims-001`) seeded into Cosmos `guidance` container for `org-nfum`
- ✅ `GET /sessions/:id/similar-projects` returns ranked matches (top score 0.97 for insurance intake)
- ✅ `ENABLE_ADMIN_SEED` removed from container after seeding — endpoint locked down
- ✅ Fix committed: `ensureIndex()` now uses `this.options.indexName`

---

## Artefacts

- `agents/advisor/data/src/search/AzureAiSearchProjectSearch.ts` — ensureIndex fix
- `agents/advisor/api/src/app.ts` — admin seed router
- `agents/advisor/data/scripts/seed-via-admin-endpoint.ps1` — repeatable seed script
- `agents/advisor/data/docs/seeding.md` — full seeding documentation
