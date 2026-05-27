# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Active Learnings (M2+)

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

## Historical Learnings Archive

See `.squad/agents/dallas/history-archive.md` for M0/M1 learnings and earlier context.
