# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Active Learnings (M2+)

### 2026-05-27 — Admin Write API: Org-Context Versioning (FR-024, M2)

**What was built:**
- `OrgContextVersion` model extended with `createdAt` / `createdBy` audit fields.
- `CosmosOrgContextVersionStore.createDraft()` stamps `createdAt`/`createdBy` from author param + server time.
- Admin API routes: `POST /admin/org-context` (create draft), `PUT /admin/org-context/:id/publish` (publish), `GET /admin/org-context` (list all), `GET /admin/org-context/published` (get active version envelope). Legacy `/versions` routes preserved for backward compat.
- Body validation helper `validateOrgContextBody()` gates required fields on POST.
- Bicep: added `org_contexts` container (partition key `/id`, indexed on `/version/?` and `/published/?`) alongside existing `org-context` container.
- OrgCtx TTL cache (60s) in `getOrgCtx()` — reduces Cosmos RUs on hot path while keeping publish latency ≤60s.
- 10 new contract tests in `admin-write-contract.test.ts` (AW-1 through AW-10): 401, 403, 201 draft, 400 validation, publish atomicity, GET /published semantics. All 48 tests pass.

**Publish atomicity invariant:**
Cosmos transactional batch requires same partition key — each version is its own `/id` partition, so cross-partition batch is not possible. Read-modify-write loop is correct for single-org, rare admin operation. Documented in `.squad/skills/cosmos-atomic-publish/SKILL.md`. If concurrent publish becomes a real concern (M4+), refactor to `/orgId` partition key + transactional batch.

**Container naming note:**
`org_contexts` (underscore) is the versioning container. `org-context` (hyphen, legacy) remains but is unused by the versioning store. Parker's Bicep now has both. The versioning store creates the container via `createIfNotExists` on first use, so it's safe before next AZD deploy.

**Lambert contract:**
Full request/response shapes written to `.squad/decisions/inbox/dallas-admin-write-contract.md`. Key point: field is `published` (bool), not `isPublished` (task spec alias). Wire format uses `published`.

**Version-conflict edge cases found:**
- Two admins publishing simultaneously: last write wins. Window is ~100ms. Acceptable for MVP single-admin-per-org assumption.
- If `createDraft` is called during `publish` loop: the new draft has `published=false` and is safely ignored by the un-publish pass.
- Cosmos error mid-publish loop: if step 2 (un-publish old) succeeds but step 3 (publish target) fails, the old version remains un-published and the target stays as draft. Admin retries the PUT call. No stuck-published state is possible — only stuck-unpublished (safe).

**Decisions:** `.squad/decisions/inbox/dallas-admin-backend-write.md`, `.squad/decisions/inbox/dallas-admin-write-contract.md`  
**Skill:** `.squad/skills/cosmos-atomic-publish/SKILL.md`

---

### 2026-05-27 — Dual-Audience JWT Validation (bare GUID vs api:// URI)

**Root cause of persistent `GET /sessions` 401 after dual-issuer fix:**
Diagnostic logging from revision 0000005 showed clearly:
```
reason: 'unexpected "aud" claim value'
aud: '4f4f4a4d-e60f-4b86-a681-86059aae4597'   ← bare GUID
```
The backend expected `api://4f4f4a4d-e60f-4b86-a681-86059aae4597` but Entra was issuing the bare GUID as `aud`. This happens when the Entra app registration's **Application ID URI** has NOT been set to the `api://` prefix form — Entra falls back to the raw GUID as the audience.

**The invariant — dual-audience acceptance:**
Always pass `audience: [...new Set([API_AUDIENCE_URI, APP_ID])]` (array with both forms) to `jose.jwtVerify` when the resource is an Entra-registered API. Both `api://4f4f4a4d-e60f-4b86-a681-86059aae4597` and `4f4f4a4d-e60f-4b86-a681-86059aae4597` are unique to this app registration, so accepting both carries no security trade-off but eliminates the entire class of Application ID URI misconfiguration breakage.

**Root fix (longer-term):** Parker should set the Application ID URI to `api://4f4f4a4d-e60f-4b86-a681-86059aae4597` in the Entra portal manifest. After that, tokens will always carry the `api://` form and the bare GUID fallback becomes a silent safety net.

**The `/v1/whoami` diagnostic endpoint:**
Added `GET /v1/whoami` — public, no auth guard, requires an Authorization header, decodes the token WITHOUT signature verification and echoes back `{header, claims}`. Registered BEFORE the JWT middleware so it is reachable with any token (even an invalid one). Invaluable for diagnosing future auth breakage without needing browser DevTools network tab access.

**Deployed:** revision `advisor-agent-app--azd-1779868342` (34/34 tests passing)
**Decision:** `.squad/decisions/inbox/dallas-401-deep-dive.md`

---

### 2026-05-27 — /sessions 502: Cosmos DB publicNetworkAccess Disabled + handleError misclassification

`publicNetworkAccess` on Cosmos DB was manually set to `Disabled` after last deploy, blocking ACA's outbound IP (`135.116.244.51`) at the network level (HTTP 403). Secondary bug: `handleError()` in `responses.ts` returned 502 for all errors whose message contained `"Azure"` — this matched the Cosmos SDK error string `Microsoft.Azure.Documents.Common/...`, causing Cosmos failures to surface as 502 instead of 500. Fix: re-enabled Cosmos public network access via CLI; removed `errMsg.includes("Azure")` from `isModelError` discriminator. 34/34 tests pass. Deployed as revision `advisor-agent-app--azd-1779874793`. Decision: `.squad/decisions/inbox/dallas-sessions-502-diagnostics.md`

---

### 2026-05-27 — /sessions 500: ManagedIdentityCredential Missing clientId

`ManagedIdentityCredential()` without args targets system-assigned identity; Container App has only user-assigned identity (`AZURE_CLIENT_ID=141376cf…`). Fixed by passing `clientId` to `ManagedIdentityCredential` in both `cosmos-client.ts` and `identity.ts`. 34/34 tests pass. Deployed as revision `advisor-agent-app--azd-1779873274`. Decision: `.squad/decisions/inbox/dallas-sessions-500-diagnostics.md`

---

### 2026-05-27 — Dual-Issuer JWT Validation + Demo-Mode Web Build Fix

**Root cause of `GET /sessions` 401 regression:**  
`jwt-middleware.ts` strictly required the v2 issuer (`https://login.microsoftonline.com/{tenantId}/v2.0`). Microsoft Entra can issue access tokens with the v1 format (`https://sts.windows.net/{tenantId}/`) even after `requestedAccessTokenVersion: 2` is set, due to propagation delay or cached sessions. Any v1-format token produced a silent `issuer mismatch` 401.

**The invariant — dual-issuer acceptance:**  
Always pass `issuer: [v2Issuer, v1Issuer]` (array) to `jose.jwtVerify` when the resource is an Entra-registered API. The `api://` audience is unique to your app, so accepting both issuer formats carries no security trade-off but eliminates the entire class of issuer-version breakage.

**Diagnostic logging pattern:**  
On `jwtVerify` failure, call `decodeJwt(token)` and `decodeProtectedHeader(token)` (no signature verification needed) and log `iss`, `aud`, `ver`, `scp`, `kid` to stderr. This makes future auth failures self-diagnosing in ACA/AppInsights logs.

**Deployed:** revision `advisor-agent-app--0000005` (30/30 tests passing)  
**Skill:** `.squad/skills/dual-issuer-jwt-validation/SKILL.md`  
**Decision:** `.squad/decisions.md` → `dallas-v2-token-fix`

---

### 2026-05-27 — CORS Preflight + JWT Ordering

**The invariant:** CORS middleware MUST be mounted BEFORE any authentication middleware in Express. This is non-negotiable.

**The fix — three layers:**
1. `app.use(cors(...))` mounted **before** `app.use(['/v1', ...], jwtMiddleware)`.
2. Belt-and-braces in `jwtMiddleware`: `if (req.method === 'OPTIONS') { next(); return; }` at the very top.
3. Origin allowlist driven by `ADVISOR_ALLOWED_ORIGINS` env var (comma-separated).

**Deployed revision:** `advisor-agent-app--azd-1779864726`  
**Decision:** `.squad/decisions.md` → `dallas-cors-preflight-fix`

---

### 2026-05-27 — M2 Streaming + Admin Writes

**SSE on Express + ACA:** Set ALL response headers AND call `res.flushHeaders()` BEFORE any `await` in an SSE handler. Emit `: keepalive\n\n` comments every 15s to reset ACA's 30-second idle timeout.

**AOAI streaming:** Accumulate tool call deltas in `Map<index, AccumulatedToolCall>` by index field. Text deltas and tool calls are mutually exclusive — emit `text.delta` directly from `delta.content`.

**Cosmos publish-one:** Use read-modify-write loop. Eventual consistency acceptable for rare admin operations.

**Decision:** `.squad/decisions.md` → `dallas-m2-streaming-and-admin-writes`

---

### 2026-05-27 — Wave-1 Production Outage Resolved (Archived to decisions.md)

Wave-1 fixes (ManagedIdentityCredential clientId, error classification, Cosmos public-net access) have been archived to `.squad/decisions.md` for future onboarding and decision reference. See `dallas-sessions-500-diagnostics`, `dallas-sessions-502-diagnostics`.

---

## Historical Learnings Archive

See `.squad/agents/dallas/history-archive.md` for M0/M1 learnings and earlier context.
