# Seeding the AI Search Index and Cosmos Guidance

## Overview

The POC uses two data stores:

| Store | Purpose | Seeding path |
|---|---|---|
| Azure AI Search — `advisor-project-knowledge` | Similar-project lookup | Admin endpoint inside container |
| Cosmos DB — `guidance` container | Org-level custom instructions | Admin endpoint inside container |

Both stores are **behind private endpoints** — public network access is disabled by Azure Policy on this subscription. Your dev machine cannot reach either endpoint directly.

The container app is **VNet-integrated** and can reach both endpoints privately. The seed strategy is therefore to expose guarded admin endpoints on the container and call them via the public Container App URL.

---

## Quick Start: Seed the Live Deployment

### Prerequisites

1. The container image must be the version with the admin seed endpoint (commit 2026-06-03+).
2. The container app must have `ENABLE_ADMIN_SEED=true` set.
3. No Azure credentials needed on your machine — auth happens inside the container via managed identity.

### Step 1 — Enable the seed endpoint on the container

```bash
az containerapp update \
  --name ca-advisor-33wfyfewrvjcg \
  --resource-group rg-advisor-advisor-poc \
  --set-env-vars ENABLE_ADMIN_SEED=true
```

### Step 2 — Run the seed script

```powershell
cd agents/advisor/data/scripts
./seed-via-admin-endpoint.ps1
```

This seeds both:
- **AI Search** — creates/updates `advisor-project-knowledge` index and uploads 6 seed projects
- **Cosmos DB** — upserts `instr-nfum-claims-001` guidance for `org-nfum` and demo org guidance

Both operations are **idempotent** — safe to run multiple times.

### Step 3 — Disable the seed endpoint (security hygiene)

```bash
az containerapp update \
  --name ca-advisor-33wfyfewrvjcg \
  --resource-group rg-advisor-advisor-poc \
  --remove-env-vars ENABLE_ADMIN_SEED
```

### Step 4 — Validate

```bash
BASE=https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io

# Create a session
SESSION=$(curl -s -X POST $BASE/sessions \
  -H "Content-Type: application/json" \
  -d '{"customerOrganizationId":"org-nfum"}' | jq -r '.data.sessionId')

echo "Session: $SESSION"

# Submit a minimal intake
curl -s -X POST "$BASE/sessions/$SESSION/intake" \
  -H "Content-Type: application/json" \
  -d '{"intake":{"problem_plain_english":"Claims handlers need guidance on policy documents","main_users":"claims handlers","user_experience_level":"mixed"}}' | jq .

# Check similar projects
curl -s "$BASE/sessions/$SESSION/similar-projects" | jq .
```

Expected: `matches` array with scored results (not `noMatchFound: true`).

---

## Seed Data: What's Included

Six projects are seeded into `advisor-project-knowledge`. All are fictitious reference cases — no real customer-sensitive data.

| Project ID | Title | Industry |
|---|---|---|
| `proj-nfum-rural-claims-advisor-001` | Rural Claims Advisor Agent — NFU Mutual | Insurance |
| `proj-insurance-guidance-assistant-014` | Policy Guidance Assistant for Commercial Insurance | Insurance |
| `proj-claims-triage-copilot-022` | Claims Triage Copilot for Weather Events | Insurance |
| `proj-hr-policy-advisor-031` | HR Policy Advisor Agent | Human Resources |
| `proj-banking-compliance-assistant-007` | Regulatory Compliance Q&A Assistant | Financial Services |
| `proj-retail-inventory-agent-045` | Inventory Replenishment Recommendation Agent | Retail |

Source: [`data/src/seed/projects.ts`](../src/seed/projects.ts)

Diversity is intentional: insurance queries should score highly on the insurance projects; a retail/supply-chain query should return `noMatchFound` (honest no-match behaviour).

---

## Index Schema

The `advisor-project-knowledge` index schema is defined in [`data/src/search/projectKnowledgeIndexDefinition.ts`](../src/search/projectKnowledgeIndexDefinition.ts).

Key design decisions:

- **Flat document shape** — `similarProjectSignals` are flattened to top-level fields (`interactionPattern`, `dataPattern`, `governancePattern`, `actionSafety`, `proactivity`) for simpler query construction.
- **`searchableText`** — primary BM25 keyword field; manually crafted per-project to surface the most important concepts.
- **Semantic config** (`project-semantic`) — optional re-ranking on `searchableText` + `title` + `summary`. Active only on Standard S1+ tier. Basic tier falls back to BM25.
- **Index name vs definition name** — the static definition has `name: 'project-knowledge'` as a default. `ensureIndex()` overrides this with `this.options.indexName` so the `SEARCH_INDEX` env var (`advisor-project-knowledge`) is respected.

---

## Why the Container Is the Seeding Path

Azure Policy on this subscription disables public network access for Cosmos DB and AI Search. Private endpoints are the only network path in.

Options evaluated:
| Option | Verdict |
|---|---|
| (a) Admin endpoint inside container (chosen) | ✅ Container is VNet-integrated; uses managed identity; no credential exposure |
| (b) Container Apps Job | Viable but more setup; container already running |
| (c) Temporarily enable public access | ❌ Against Azure Policy; risk of leaving open |

The `ENABLE_ADMIN_SEED=true` guard means the endpoint is off by default and must be explicitly enabled for a seed run, then disabled afterward.

---

## Adding New Seed Projects

1. Add a new `ProjectKnowledgeDocument` to [`data/src/seed/projects.ts`](../src/seed/projects.ts).
2. Build: `npm run build --workspace=@advisor/data`
3. Deploy the updated container image: `azd deploy` from `agents/advisor/`
4. Re-run the seed script.

The `uploadDocuments` call uses Azure AI Search's merge-or-upload semantics — existing documents are updated, new ones added.

---

## Repeatable Seed Command Reference

```powershell
# Full seed (Search + Cosmos)
cd agents/advisor/data/scripts
./seed-via-admin-endpoint.ps1

# Search only
./seed-via-admin-endpoint.ps1 -SkipGuidance

# Guidance only
./seed-via-admin-endpoint.ps1 -SkipSearch

# Custom base URL
./seed-via-admin-endpoint.ps1 -BaseUrl https://your-container.azurecontainerapps.io
```
