# Decision: AOAI text-embedding-3-small Deployment

**By:** Parker (Infrastructure Engineer)  
**Date:** 2026-05-26  
**Status:** ✅ COMPLETE — deployment `provisioningState: Succeeded`

---

## Summary

`text-embedding-3-small` (1536 dims) has been deployed to the AOAI account in `rg-advisor-dev`.
This unblocks AI Search integrated vectorization for the `system-inventory-v1` index.

---

## Deployment Details

| Field | Value |
|-------|-------|
| AOAI Account | `advisor-aoai-uwmrjzgkhs2hk` |
| Endpoint | `https://advisor-aoai-uwmrjzgkhs2hk.openai.azure.com/` |
| Deployment Name | `text-embedding-3-small` |
| Model Name | `text-embedding-3-small` |
| Model Version | `1` |
| SKU | `GlobalStandard` (Standard SKU not available for this model in swedencentral) |
| Capacity | 10K TPM |
| Region | `swedencentral` |
| State | `Running` / `provisioningState: Succeeded` |
| Dimensions | 1536 |

**SKU Note:** `text-embedding-3-small` only supports `GlobalStandard` and `DataZoneStandard`
in `swedencentral` — `Standard` SKU is not available for this model in this region.
The existing `gpt-4.1-mini` deployment uses `Standard`; this embedding deployment uses `GlobalStandard`.

---

## What Dallas Needs to Wire the Vectorizer

The `system-inventory-v1` index has been **re-PUT with the `vectorizers` block** pointing at this
deployment. Dallas does NOT need to wire the vectorizer manually — integrated vectorization is now
active on the index. For explicit embedding calls (ingest path), use:

| Config Key | Value |
|-----------|-------|
| `AZURE_OPENAI_ENDPOINT` | `https://advisor-aoai-uwmrjzgkhs2hk.openai.azure.com/` |
| Deployment ID | `text-embedding-3-small` |
| Model name | `text-embedding-3-small` |
| API version | `2024-02-01` (stable embeddings) |
| Auth | `ManagedIdentityCredential` — no API key in code |

Search index vectorizer config (already applied to the live index):
```json
{
  "name": "aoai-text-embedding-3-small",
  "kind": "azureOpenAI",
  "azureOpenAIParameters": {
    "resourceUri": "https://advisor-aoai-uwmrjzgkhs2hk.openai.azure.com/",
    "deploymentId": "text-embedding-3-small",
    "modelName": "text-embedding-3-small"
  }
}
```

---

## Bicep Module Updated

`infra/modules/aoai.bicep` now includes the `embeddingDeployment` resource with `GlobalStandard` SKU
and a `dependsOn: [modelDeployment]` guard to prevent simultaneous deployment conflicts.
Output `embeddingDeploymentName` is exported.
