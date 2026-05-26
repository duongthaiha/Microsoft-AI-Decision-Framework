# Decision: M1 Infra — Roles, Search Index, Embedding Deployment

**By:** Parker (Infrastructure Engineer)  
**Date:** 2026-05-26  
**Status:** ✅ ALL THREE TASKS COMPLETE

---

## Summary

All three M1 infra deliverables executed in one run:

1. **`AdvisorAdmin` Entra app role** — defined and assigned to Ha Duong ✅  
2. **`system-inventory-v1` AI Search index** — provisioned + vectorizers wired ✅  
3. **`text-embedding-3-small` AOAI deployment** — live, integrated vectorization enabled ✅

---

## Task 1: AdvisorAdmin Entra App Role

### What was done

- **App role added** to `advisor-agent-web` (appId `4f4f4a4d-e60f-4b86-a681-86059aae4597`) via:
  ```bash
  az ad app update --id 4f4f4a4d-e60f-4b86-a681-86059aae4597 \
    --app-roles @infra/app-roles.json
  ```
  Role definition file committed at `infra/app-roles.json`.

- **Service principal created** (it did not previously exist):
  ```
  SP object ID: 2f3a486a-03fe-4d0e-8d8e-17926105849f
  displayName:  advisor-agent-web
  appId:        4f4f4a4d-e60f-4b86-a681-86059aae4597
  ```

- **Role assigned to Ha Duong** via Microsoft Graph `appRoleAssignments`:
  ```
  principalId:         3cff1542-912f-4f64-b2f0-1c254dd4ad3c  (System Administrator)
  resourceId:          2f3a486a-03fe-4d0e-8d8e-17926105849f  (advisor-agent-web SP)
  appRoleId:           d64375c5-5a38-41a3-9f36-f68f8a4c2674  (AdvisorAdmin)
  assignment ID:       QhX_PC-RZE-y8BwlTdStPADDO79R1sxHnYSExUnok1s
  createdDateTime:     2026-05-26T23:12:31Z
  ```

### Role manifest (committed at `infra/app-roles.json`)

```json
[
  {
    "id": "d64375c5-5a38-41a3-9f36-f68f8a4c2674",
    "value": "AdvisorAdmin",
    "displayName": "Advisor Admin",
    "description": "Can manage org context, projects, and inspect all advisor requests.",
    "allowedMemberTypes": ["User"],
    "isEnabled": true
  }
]
```

### Verification / next steps for Ha Duong

- Ha Duong must **sign out and sign back in** to get a fresh token with the `roles` claim.
- Once the Container App is running with `ADVISOR_DEMO_MODE=false`, the `roles: ["AdvisorAdmin"]`
  claim will appear in the token and Dallas's `requireRole('AdvisorAdmin')` middleware will pass.
- Admin consent is not required separately — `appRoleAssignments` is a direct role assignment, not
  a delegated permission grant.

---

## Task 2: AI Search `system-inventory-v1` Index

### What was done

- **Index provisioned** via REST PUT against `advisor-search-uwmrjzgkhs2hk`:
  ```
  PUT https://advisor-search-uwmrjzgkhs2hk.search.windows.net/indexes/system-inventory-v1
  api-version: 2024-07-01
  HTTP 201 Created
  ```
  Index definition from `advisor-agent/data/system-inventory-v1-index.json` as authored by Ripley.

- **Index re-PUT with vectorizers** after AOAI embedding deployment landed:
  ```
  HTTP 204 No Content  (update to existing index)
  ```
  The `vectorSearch.profiles[0].vectorizer` is now wired to `aoai-text-embedding-3-small`.
  `system-inventory-v1-index.json` updated in-place (no new file — Ripley's file is canonical).

- **`Search Index Data Contributor` granted** to agent MI `advisor-agent-identity`:
  ```
  Role:         Search Index Data Contributor (8ebe5a00-799e-43f5-93ac-243d3dce84a7)
  Principal:    c8c13fe3-325a-439b-8aa8-d365f3ebe285  (advisor-agent-identity)
  Scope:        /subscriptions/.../rg-advisor-dev/providers/Microsoft.Search/searchServices/advisor-search-uwmrjzgkhs2hk
  Assignment:   da63719e-20a7-47e3-b476-b2ee23ca2917
  ```
  (Agent MI already had `Search Index Data Reader` from M0; `Contributor` adds write/admin path.)

### Index state

| Property | Value |
|---------|-------|
| Name | `system-inventory-v1` |
| Fields | 13 (id, name, description, description_vector, capabilities, domain, owner_team, status, stack, data_sources, last_reviewed, confidence_score, org_id) |
| Vector profile | `default-vector-profile` → `default-hnsw` (cosine, m=4, efC=400, efS=500) |
| Vectorizer | `aoai-text-embedding-3-small` → integrated vectorization active |
| Semantic config | `default-semantic-config` (title: name, content: description, keywords: capabilities/domain/data_sources) |
| API version used | `2024-07-01` (stable) |

---

## Task 3: AOAI text-embedding-3-small Deployment

### What was done

- **Deployed** `text-embedding-3-small` version `1` to `advisor-aoai-uwmrjzgkhs2hk`:
  ```
  SKU: GlobalStandard (Standard SKU not available for this model in swedencentral)
  Capacity: 10K TPM
  provisioningState: Succeeded
  deploymentState: Running
  ```

- **Bicep module updated** — `infra/modules/aoai.bicep` now contains the `embeddingDeployment`
  resource with `GlobalStandard` SKU, `dependsOn: [modelDeployment]`, and exports
  `embeddingDeploymentName` output. Future `azd provision` will idempotently manage both deployments.

- **Full deployment record** in `.squad/decisions/inbox/parker-aoai-embedding-deploy.md`.

---

## Permissions / Blockers

None — all three tasks completed without missing permissions.

---

## Files Changed

| File | Change |
|------|--------|
| `infra/app-roles.json` | **New** — AdvisorAdmin app role manifest |
| `infra/modules/aoai.bicep` | Added `embeddingDeployment` resource + updated comment + `embeddingDeploymentName` output |
| `advisor-agent/data/system-inventory-v1-index.json` | Added `vectorizers` block + wired `vectorizer` in profile |
| `.squad/decisions/inbox/parker-aoai-embedding-deploy.md` | **New** — AOAI embedding deployment details for Dallas |

---

## M1 Status After This Run

| Item | Status |
|------|--------|
| AdvisorAdmin app role defined | ✅ |
| AdvisorAdmin assigned to Ha Duong | ✅ |
| system-inventory-v1 index provisioned | ✅ |
| Search Index Data Contributor on agent MI | ✅ |
| text-embedding-3-small AOAI deployment | ✅ |
| Integrated vectorization wired in index | ✅ |
| Bicep module updated for future provisions | ✅ |
| Dallas reuse-gate query implementation | 🔲 Dallas |
| Container App ADVISOR_DEMO_MODE=false | 🔲 Ha Duong (requires Lambert MSAL wiring first) |
