# Decision: JWT Validation Middleware — Entra ID v2 Token Enforcement

**By:** Dallas (Backend & Agent Developer)  
**Date:** 2026-05-26T22:52:00Z  
**Status:** ✅ COMPLETE — deployed to revision `advisor-agent-app--azd-1779836350`

---

## Summary

Wired JWT validation on the Express backend so protected routes (`/v1/responses`, `/sessions`, `/admin/*`) require a valid Microsoft Entra ID access token.  `/health` remains unauthenticated for liveness probes.

---

## §A — Middleware library chosen

**Library:** [`jose`](https://github.com/panva/jose) v6 (installed via `npm install jose`)

**Rationale:**
- Lightweight, zero-dependency, RFC-clean implementation of JWS/JWE/JWT.
- `createRemoteJWKSet` handles JWKS fetching and caching automatically (10-minute TTL by default) — no manual cache management required.
- `jwtVerify` validates `exp`, `iss`, and `aud` natively; no additional steps needed for those claims.
- Recommended by the spec task; avoids the heavier `passport` + `passport-azure-ad` stack, which brings in `@azure/identity` conflicts.

---

## §B — Claim validations enforced

| Claim | Validation | Notes |
|-------|-----------|-------|
| `iss` | `https://login.microsoftonline.com/{tenantId}/v2.0` | v2 endpoint; v1 tokens (`/v2.0` suffix absent) are rejected |
| `aud` | `api://4f4f4a4d-e60f-4b86-a681-86059aae4597` | Full `api://` URI — **not** the bare GUID.  v2 access tokens with custom scopes carry the `api://` form; bare GUID audience = v1 token, rejected. |
| `exp` | Enforced automatically by jose | Expired tokens return 401 |
| `scp` | Space-split; must contain `access_as_user` | If scope is absent or doesn't include the expected value, 401 is returned |
| `oid` | Present and non-empty | Missing oid → 401; oid is the stable ownership key for Cosmos partitioning |

**On success:** `req.user = { oid, name?, email?, roles[] }` is attached.  
**On failure:** `401 { error: 'unauthorized', reason: '<short>' }`.

---

## §C — Route protection map

| Route | JWT required | Role required | Notes |
|-------|-------------|--------------|-------|
| `GET /health` | ❌ | — | Liveness probe; always open |
| `POST /v1/responses` | ✅ | — | Main Responses protocol entry point |
| `GET /sessions` | ✅ | — | Per-user session list |
| `POST /sessions` | ✅ | — | Create session |
| `GET /admin/*` | ✅ | `AdvisorAdmin` | Role gate via `requireRole('AdvisorAdmin')` |
| `PUT /admin/*` | ✅ | `AdvisorAdmin` | Same |

Middleware is mounted in `index.ts` using `app.use(['/v1', '/sessions', '/admin'], jwtMiddleware)` — Express path prefix matching covers all sub-paths.

---

## §D — Demo mode behaviour

When `ADVISOR_DEMO_MODE=true`:
- JWT middleware **bypasses** token validation and sets `req.user = { oid: 'demo::anonymous', roles: [] }`.
- `requireRole('AdvisorAdmin')` returns `403` with `"admin access is not available in demo mode"` — the demo identity carries no roles.
- Result: non-admin routes work without a token; admin routes are blocked.

The Container App is currently running with `ADVISOR_DEMO_MODE=true`.  Switching to production mode requires unsetting this flag and ensuring the frontend sends valid Entra tokens (Lambert's parallel work).

---

## §E — Env var contract

| Env var | Default | Required in prod | Notes |
|---------|---------|-----------------|-------|
| `ENTRA_TENANT_ID` | `cdfe81b5-821e-4f07-9ea7-516efc8497e4` | Yes (override if tenant changes) | Used to derive JWKS URI and expected issuer |
| `ENTRA_API_AUDIENCE` | `api://4f4f4a4d-e60f-4b86-a681-86059aae4597` | Yes (override if app reg changes) | Must be the full `api://` URI — see §B note |

Both vars are now set on the Container App (`az containerapp update --set-env-vars`).  They are also added to `agent/.env.local` and the new `agent/.env.local.example` template.

**Derived values (not configurable separately — computed from `ENTRA_TENANT_ID`):**
- JWKS URI: `https://login.microsoftonline.com/{ENTRA_TENANT_ID}/discovery/v2.0/keys`
- Expected issuer: `https://login.microsoftonline.com/{ENTRA_TENANT_ID}/v2.0`

---

## §F — AdvisorAdmin role gap (assigned to Parker)

⚠️ **Action required — Parker / Infra:**

The `AdvisorAdmin` app role is **not yet defined** on the Entra app registration `advisor-agent-web` (appId `4f4f4a4d-e60f-4b86-a681-86059aae4597`).

The `requireRole('AdvisorAdmin')` middleware is wired and **will work correctly** once the role exists and is assigned to admin users, but until then all `/admin/*` requests from non-demo traffic will return `403 { error: 'forbidden', reason: "role 'AdvisorAdmin' is required" }`.

**Parker must (before M1 ships):**
1. Add an `AdvisorAdmin` app role to the app registration manifest via Azure Portal → App registrations → `advisor-agent-web` → App roles → Create app role.
2. Assign the role to the admin user(s) or groups via Enterprise Applications → `advisor-agent-web` → Users and groups.
3. Confirm the `roles` claim appears in access tokens for assigned users.

Reference: [Add app roles to your application (Microsoft Learn)](https://learn.microsoft.com/entra/identity-platform/howto-add-app-roles-in-apps)

---

## §G — Files changed

| File | Change |
|------|--------|
| `agent/src/auth/jwt-middleware.ts` | **New** — JWT validation middleware + `requireRole` helper |
| `agent/src/index.ts` | Added `app.use(['/v1', '/sessions', '/admin'], jwtMiddleware)` |
| `agent/src/admin/admin-api.ts` | Replaced `requireAdminRole` stub with `requireRole('AdvisorAdmin')` from middleware |
| `agent/src/auth/identity.ts` | Cleaned up M1 stub comment; reads `req.user?.oid` (type-safe) |
| `agent/package.json` | Added `jose ^6.2.3` to dependencies |
| `agent/.env.local` | Added `ENTRA_TENANT_ID` and `ENTRA_API_AUDIENCE` |
| `agent/.env.local.example` | **New** — env template for local setup |

---

## §H — Deployed image / revision

| Field | Value |
|-------|-------|
| Container App | `advisor-agent-app` |
| Resource group | `rg-advisor-dev` |
| Revision | `advisor-agent-app--azd-1779836350` |
| Deploy command | `azd deploy agent` |
| Deploy time | 2026-05-26T22:52:00Z |

**Live smoke test results:**
- `GET /health` → `200 {"status":"ok"}` ✅
- `POST /v1/responses` (demo mode, no token) → `501` (stub, expected — demo bypasses JWT) ✅
- `GET /admin/org-context` (demo mode) → `403` "admin access is not available in demo mode" ✅
- Local (non-demo) `POST /v1/responses` (no token) → `401 {"error":"unauthorized","reason":"missing bearer token"}` ✅
- Local (non-demo) `POST /v1/responses` (malformed token) → `401 {"error":"unauthorized","reason":"JWS Protected Header is invalid"}` ✅

---

## §I — Integration path for real token testing

Lambert's frontend will acquire tokens via MSAL PKCE for scope `api://4f4f4a4d-e60f-4b86-a681-86059aae4597/access_as_user` and send them as `Authorization: Bearer <jwt>`.  The backend is ready to validate those tokens.  Full end-to-end test requires the frontend integration (parallel, Lambert) and `ADVISOR_DEMO_MODE` to be set to `false` on the Container App.
