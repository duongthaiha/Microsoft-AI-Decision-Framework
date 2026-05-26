# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-05-26 — M0 scaffold (Dallas)

**Canonical partition key decisions**

| Container | Partition key | Rationale |
|-----------|--------------|-----------|
| `sessions` | `/ownerId` | Every session read/write is scoped to one user. Cosmos data-plane RBAC is the second line of defence. |
| `requests` | `/ownerId` | Same as sessions — requests are always submitted by and belong to one user. |
| `projects` | `/projectId` | Projects are organisation-wide artifacts; they must be readable without a user partition filter. |
| `org-context` | `/orgId` | Single `"default"` org in MVP; field reserved for multi-org without migration. |

**Identity model**

- `getModelCredential()` returns `ManagedIdentityCredential` in production (no secrets in config) and `DefaultAzureCredential` when `ADVISOR_LOCAL_DEV === 'true'` for local development.  This decision is locked in the spec (FR-016) and must not be reversed without a security review.
- `resolveCallerId(req)` reads the Entra `oid` JWT claim — validated by upstream middleware before reaching the handler.  Falls back to an opaque `demo::anonymous` id when `ADVISOR_DEMO_MODE === 'true'`.  Throws if neither is available, so the agent never processes unauthenticated traffic silently.
- Demo and Entra partitions are isolated by `ownerId` prefix convention; they should never be mixed in a single query.

**M1 stubs that hide real complexity**

- **`CosmosRequestStore.setStatusNew`**: The ETag-based optimistic concurrency pattern for the `Draft → New` status transition needs careful design.  The `_etag` from the `ReadyForConfirmation` read must be passed to the Cosmos replace call via `If-Match`.  A 412 Precondition Failed means the user double-submitted; the caller must surface a clean error and NOT claim success (spec §16 risk row).
- **`CosmosOrgContextStore.publishVersion`**: Making exactly one version `published: true` requires either a Cosmos DB transaction (same partition) or a two-step conditional patch with accepted eventual consistency.  The choice affects the admin UX for "publish while another version is live."
- **`requireAdminRole` middleware**: The M0 stub passes all non-demo requests through.  M1 must replace this with a real JWT role-claim check before any admin route is reachable.  The check must audit-log failed attempts with no content leakage (§11).
- **`listAllRequestsAdmin`**: The only cross-partition read in the codebase.  M1 must pass `enableCrossPartitionQuery: true` and gate it strictly behind role verification and audit logging (FR-030).
- **Copilot SDK wiring**: `@github/copilot-sdk` is a peer dependency with a TODO comment.  M1 must confirm the SDK session API shape and wire it through `responses.ts` before any framework phase can run.

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.

---

## M1 Auth Wiring — Backend JWT Validation (2026-05-26)

### Critical path for M2 production sign-in

Entra app registration now live (parker-4 phase 1 complete). Frontend will request access tokens scoped to `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`.

**Backend must validate:**
1. Token `aud` (audience) claim == `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`
2. Token `iss` (issuer) claim matches tenant `cdfe81b5-821e-4f07-9ea7-516efc8497e4` (format: `https://login.microsoftonline.com/{tenantId}/v2.0`)

**Location of M0 stub:** `agent/src/auth/identity.ts` — marked "M1: the JWT validation middleware will attach…"

**App IDs (safe to commit — public identifiers):**
- Client ID: `4f4f4a4d-e60f-4b86-a681-86059aae4597`
- Tenant ID: `cdfe81b5-821e-4f07-9ea7-516efc8497e4`
- Scope: `api://4f4f4a4d-e60f-4b86-a681-86059aae4597/access_as_user`

**Decision record:** `.squad/decisions.md` entry #260 (parker-entra-and-web-deploy, section §B &amp; §E)
