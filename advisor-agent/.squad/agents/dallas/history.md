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

---

## M1 Auth Wiring — JWT Middleware Deployed (2026-05-26T22:52:00Z)

### jose patterns

- Use `createRemoteJWKSet(new URL(jwksUri))` **once at module load** (not per request).  jose caches the key set with a 10-minute TTL.  Constructing it inside the middleware function re-fetches on every call.
- `jwtVerify<T>(token, JWKS, { issuer, audience })` returns `{ payload, protectedHeader }`.  `exp` is validated automatically — no manual clock check needed.
- Type the Entra-specific claims with a local interface (`EntraTokenClaims`) intersected with `JWTPayload`.  jose's `JWTPayload` only covers RFC 7519 standard claims; `oid`, `scp`, `roles`, `preferred_username` must be typed separately.

### JWKS caching

- `createRemoteJWKSet` uses an in-memory cache (default 10 min).  No Redis or external cache needed for typical Container App workloads.
- The JWKS URL for Entra v2 is: `https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys`.

### v2 audience format gotcha

- **v2 access tokens with custom scopes carry `aud = "api://{appId}"`** — the full URI form, NOT the bare GUID.
- If `aud` is validated against the bare GUID (`4f4f4a4d-…`), all token validations will fail with "audience mismatch" because Entra sets `aud` to the `api://` URI when an `api://` scope is requested.
- Always set `ENTRA_API_AUDIENCE=api://{appId}` (not the GUID alone).

### Express middleware ordering

- Mount `app.use(['/v1', '/sessions', '/admin'], jwtMiddleware)` **before** `app.use('/', createResponsesAdapter(...))` so the JWT check runs for protected paths without touching `/health`.
- Express prefix matching on `app.use('/admin', middleware)` covers all sub-paths, so a single `use` call protects the entire admin sub-router.

### Demo mode interaction

- JWT middleware should bypass token validation in demo mode and set a synthetic demo identity.  This keeps demo environments working without Entra tokens while admin routes remain blocked (demo identity has no roles).
- `requireRole('AdvisorAdmin')` should explicitly check `ADVISOR_DEMO_MODE` and return 403 regardless of token contents — the demo identity must never acquire admin access.

### AdvisorAdmin role gap (for Parker)

- `requireRole('AdvisorAdmin')` is wired in `admin-api.ts` but the app role is **not yet defined** on the app registration.  Until Parker adds it to the manifest and assigns it to users, all admin routes will return 403 for real Entra users.  See decision file `dallas-jwt-validation-middleware.md §F`.


---

## M1 Reasoning Loop — AOAI Direct Client + Full Stack Wiring (2026-05-26)

### @github/copilot-sdk is the wrong package for Azure AI agents

- `@github/copilot-sdk@1.0.0-beta.8` (latest on npm) is the **GitHub Copilot CLI JSON-RPC SDK** for editor plugin integration. It has zero overlap with Azure OpenAI inference or agent orchestration.
- FR-002 spec was written when an Azure AI agent SDK for Node.js was anticipated. No such package exists publicly as of 2026-05-26.
- **Correct approach:** `openai@^4.104.0` exports `AzureOpenAI` with `azureADTokenProvider` for managed identity. This is the canonical path per Microsoft Learn.
- Document the substitution in the decision file. The advisor must function — do not block delivery on a preview SDK.

### AOAI client patterns (Node.js / TypeScript)

- `AzureOpenAI` class is exported from `openai`, not from `@azure/openai`. `@azure/openai@^2.0.0` is a wrapper that re-exports Azure extension types but does NOT export the client class.
- `azureADTokenProvider: async () => (await credential.getToken("https://cognitiveservices.azure.com/.default"))!.token` — this is the full token injection pattern. Never hardcode the scope.
- Use `apiVersion: "2024-12-01-preview"` for tool calling support.
- Mock pattern in Vitest: `{ chat: { completions: { create: vi.fn() } } } as unknown as AzureOpenAI` — duck-typed, no module mock required.
- Test 7 contract (AOAI error → 502 Bad Gateway): wrap `runAdvisorLoop` in its own try-catch to distinguish model failures from Cosmos/internal failures. Return `{ error: "advisor_unavailable", reason: msg }` on 502.

### Cosmos data-plane RBAC pitfalls

- Container App MI needs `Cosmos DB Built-in Data Contributor` role on the database scope, NOT just the account scope — the role assignment must target the correct resource scope.
- `createIfNotExists` at boot is idempotent and safe. No manual container provisioning needed.
- Partition key `/ownerId` must be set at container creation — it cannot be changed later without data migration.
- `accessCondition: { type: "IfMatch", condition: etag }` is the Cosmos SDK v4 ETag pattern for optimistic concurrency (not an `If-Match` header string — it's a structured options object).
- Cross-partition queries (`listAllRequestsAdmin`) require no special flag in the query itself — the SDK's `query()` options accept `maxItemCount` but NOT `enableCrossPartitionQuery` in SDK v4 (this is handled automatically). The partition key must be omitted from the options to allow cross-partition reads.

### System prompt design patterns

- **Dynamic construction from org context is essential:** Hard-coded system prompts are stale on every org context version bump. Construct the prompt at call time from the active OrgContext document.
- **Instruction injection order matters:** Put unavailable products and hard constraints BEFORE preferences in the system prompt. LLMs attend more strongly to earlier tokens in long prompts.
- **Exit signal in the prompt:** Explicitly instruct the model to call `produceReadinessBrief` as the last step. Without this, models may produce text answers without calling the final tool.
- **Tool naming:** Use verb-noun names (`scoreBXT`, `searchSimilarProjects`). Avoids ambiguity when the model decides which tool to call.
- **Agentic loop cap:** 8 iterations is sufficient for the 4-tool framework flow. Increase only if adding more tools. Log a warning if the cap is hit — it signals a prompt design issue.

### Transactional Cosmos write design

- FR-007 says "persist a Request record throughout the conversation" — initial intuition is to create the request before the model call.
- Test 7 contract (written by Brett) specifies the DESIRED behavior: no orphaned Draft documents if the model fails.
- Resolution: Create the request AFTER `runAdvisorLoop` succeeds. Model failure → 502, nothing written to Cosmos. This is cleaner operationally and avoids GC complexity for orphaned documents.
- Brett's test suite was written proactively for this contract gap — it correctly identifies the design tension. Always check Brett's tests before finalising the write order in route handlers.

### Package workspace gotchas (monorepo)

- npm workspaces hoist packages to the root `node_modules`. If `openai` is installed at the root workspace but not in `agent/node_modules`, TypeScript compilation inside the agent still resolves it correctly (TypeScript follows Node.js module resolution which walks up the directory tree).
- Untracked test files (like Brett's `reasoning-loop.test.ts`) are NOT in git but ARE included in the Docker build context because `COPY agent/ ./agent/` in the Dockerfile copies all files. Always run `npm run build` locally before `azd deploy` to catch issues that will surface in the remote build.
- The Docker remote build runs `npm install --workspace=agent` which installs only the workspace's `package.json` deps into a single node_modules at the repo root level. Any package referenced in agent code must be in `agent/package.json` (not just `package.json`).

