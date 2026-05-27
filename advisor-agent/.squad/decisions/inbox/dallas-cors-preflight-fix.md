# Decision: CORS Preflight Fix — P0 Regression

**Author:** Dallas (Backend Developer)  
**Date:** 2026-05-27  
**Status:** Deployed ✅  
**Revision:** `advisor-agent-app--azd-1779864726`

---

## Context

SPA at `https://polite-mushroom-0a09fa803.7.azurestaticapps.net/session/new` showed
"Backend not ready yet — Failed to fetch" for all users. Backend `/health` returned 200
but the SPA could not reach `/v1/responses`.

---

## Root Cause

**Middleware ordering + W3C CORS preflight spec.**

The W3C CORS specification (Fetch Standard §3.2) requires browsers to send an HTTP `OPTIONS`
preflight request **without** an `Authorization` header before any cross-origin request that
carries credentials. This is non-negotiable browser behaviour — it cannot be worked around
from the client side.

`jwtMiddleware` was mounted on `['/v1', '/sessions', '/admin']` in `index.ts` **before any
CORS middleware existed**. When the browser sent `OPTIONS /v1/responses` with no `Authorization`
header, `jwtMiddleware` responded with `HTTP 401 { error: "unauthorized", reason: "missing
bearer token" }`. The response carried no `Access-Control-Allow-Origin` header, so the browser
blocked the actual `POST` request entirely — producing "Failed to fetch" in the SPA.

---

## Fix

### 1. CORS middleware mounted BEFORE `jwtMiddleware` (`agent/src/index.ts`)

```typescript
app.use(cors({
  origin: corsOrigins,          // from ADVISOR_ALLOWED_ORIGINS env var
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));
// jwtMiddleware comes AFTER cors()
app.use(['/v1', '/sessions', '/admin'], jwtMiddleware);
```

Origins are loaded from `ADVISOR_ALLOWED_ORIGINS` (comma-separated). Default: deployed SWA
origin + `http://localhost:5173`. `cors({origin: '*'})` is explicitly NOT used — it is
incompatible with `credentials: true` and violates the allowlist security policy.

### 2. Belt-and-braces bypass in `jwtMiddleware` (`agent/src/auth/jwt-middleware.ts`)

```typescript
if (req.method === 'OPTIONS') {
  next();
  return;
}
```

Added at the very top of the middleware, before any auth logic. Even if CORS middleware
ordering ever regresses, preflight requests will pass through without a 401.

### 3. Bicep wiring (`infra/modules/container-apps.bicep`, `infra/main.bicep`)

- `container-apps.bicep` gains `param allowedOrigins string = ''`, wired to
  `ADVISOR_ALLOWED_ORIGINS` env var on the Container App.
- `main.bicep` gains `param allowedOrigins string = 'https://polite-mushroom-0a09fa803.7.azurestaticapps.net'`
  and passes it through to the `containerApps` module call.

### 4. Tests added (`agent/src/__tests__/auth-contract.test.ts`)

- **Test 12:** `OPTIONS /v1/responses` from SWA origin → HTTP 2xx with
  `Access-Control-Allow-Origin: <swa>` (no auth required).
- **Test 13:** `OPTIONS /v1/responses` from unlisted origin → no `Access-Control-Allow-Origin`
  header (origin blocked by allowlist).

---

## Verification

```
curl -i -X OPTIONS https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io/v1/responses \
  -H "Origin: https://polite-mushroom-0a09fa803.7.azurestaticapps.net" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

**Response (2026-05-27):**
```
HTTP/2 204
access-control-allow-origin: https://polite-mushroom-0a09fa803.7.azurestaticapps.net
vary: Origin
access-control-allow-credentials: true
access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS
access-control-allow-headers: Authorization,Content-Type
```

✅ HTTP 204 with correct `Access-Control-Allow-Origin`. SPA can now send credentialed POST
requests. The "Failed to fetch" regression is resolved.

---

## Deployed Revision

`advisor-agent-app--azd-1779864726`

---

## Lesson: CORS Preflight MUST Bypass Auth (Pattern for Brett)

This is a classic Express footgun. The invariant is:

> **CORS middleware MUST precede any authentication middleware.**  
> Belt-and-braces: add `if (req.method === 'OPTIONS') return next()` at the top of every
> auth middleware regardless of outer ordering.

Brett should codify this as a standing contract test: any new route prefix added to
`jwtMiddleware`'s path list must have a corresponding preflight test asserting 2xx +
`access-control-allow-origin` from the allowed origin.

See also: `.squad/skills/cors-preflight-with-jwt/SKILL.md` for the reusable pattern.

---

## Auth Invariant Preserved

POST/GET/etc. requests to `/v1/*` still require a valid Bearer token. The bypass is
**OPTIONS-only**. No authentication was removed from real requests.
