# Skill: Managed-Identity-First Azure Credential Pattern

**Author:** Dallas  
**Date:** 2026-05-26  
**Applies to:** Any TypeScript/Node.js module that calls an Azure service (Cosmos DB, AI Search, Key Vault, Storage, etc.)

---

## The pattern

Use `ManagedIdentityCredential` in production.  Fall back to `DefaultAzureCredential` only when an explicit opt-in environment variable is set (`ADVISOR_LOCAL_DEV === 'true'` in this project).  Never use connection strings or API keys in application code.

```typescript
import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from "@azure/identity";

function resolveCredential(): TokenCredential {
  if (process.env.ADVISOR_LOCAL_DEV === "true") {
    // Covers VS Code session, Azure CLI, environment variables for local dev.
    return new DefaultAzureCredential();
  }
  // Production: hosted agent identity / managed identity only — no fallback.
  return new ManagedIdentityCredential();
}
```

Then pass the credential to the Azure SDK client:

```typescript
// Cosmos DB
new CosmosClient({ endpoint, aadCredentials: resolveCredential() });

// AI Search
new SearchClient(endpoint, indexName, resolveCredential());
```

---

## Why this works

`DefaultAzureCredential` tries multiple credential sources in order (environment variables, workload identity, managed identity, VS Code, Azure CLI, etc.).  In production this is fine, but it means a misconfigured managed identity silently falls back to developer credentials, which can mask deployment errors.  Using `ManagedIdentityCredential` directly in production removes the ambiguity: if the managed identity is not configured, the call fails fast and visibly.

---

## Bicep / role assignment requirement

The managed identity must be granted the appropriate data-plane role before any code runs.  For Cosmos DB:

```
Microsoft Learn: https://learn.microsoft.com/azure/cosmos-db/nosql/security/how-to-grant-data-plane-role-based-access
```

For AI Search:

```
Microsoft Learn: https://learn.microsoft.com/azure/search/search-security-rbac
```

Parker's Bicep modules must include these role assignments; the code assumes they are in place.

---

## Files in this project that use this pattern

- `agent/src/data/cosmos-client.ts` — `createCosmosClient()`
- `agent/src/auth/identity.ts` — `getModelCredential()`
