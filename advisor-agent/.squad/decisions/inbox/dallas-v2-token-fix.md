# Decision: Dual-Issuer JWT Validation (v1 + v2 Entra Tokens)

**Author:** Dallas  
**Date:** 2026-05-27T07:22:12Z  
**Status:** Decided — deployed revision `advisor-agent-app--0000005`  
**Refs:** FR-014, FR-019

---

## Context

`GET /sessions` returned 401 after Ha signed out and back into the SPA. The Entra app registration (`appId: 4f4f4a4d-e60f-4b86-a681-86059aae4597`) had `requestedAccessTokenVersion: 2` confirmed via Graph API. The deployed SPA was correctly sending real Entra tokens (not demo mode).

## Root Cause

`jwt-middleware.ts` was set up with a single `EXPECTED_ISSUER`:

```
https://login.microsoftonline.com/cdfe81b5-821e-4f07-9ea7-516efc8497e4/v2.0
```

Microsoft Entra can issue tokens with **either** of these issuers depending on when the `requestedAccessTokenVersion: 2` setting propagates, cached sessions, or tenant-level policy overrides:

| Format | Issuer |
|--------|--------|
| v2     | `https://login.microsoftonline.com/{tenantId}/v2.0` |
| v1     | `https://sts.windows.net/{tenantId}/` |

When the backend only accepted v2, any token issued with the v1 issuer format silently produced a `401 { reason: "issuer mismatch" }`. The SPA showed no useful error — just "API GET /sessions failed: 401".

## Secondary Issue: `azure.yaml` predeploy hook

The predeploy hook was building the web SPA with `VITE_ADVISOR_DEMO_MODE=true`:

```sh
VITE_ADVISOR_DEMO_MODE=true npm run build --workspace=web
```

This bakes `isDemoMode = true` into the bundle. `getAccessToken()` returns `''` immediately in demo mode — no `Authorization` header is ever sent. Future `azd deploy` runs would silently regress auth.

Fixed: removed demo mode from the web build; added real `VITE_` vars and reads `VITE_AZURE_REDIRECT_URI` / `VITE_API_BASE_URL` from AZD env.

## Decision

### §A — Dual-issuer acceptance (defensive pattern)

Accept **both** v1 and v2 issuers in `jose`'s `jwtVerify` options:

```ts
const ACCEPTED_ISSUERS = [
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  `https://sts.windows.net/${TENANT_ID}/`,
];

await jwtVerify(token, JWKS, {
  issuer: ACCEPTED_ISSUERS,  // jose v5+ accepts string[]
  audience: API_AUDIENCE,
});
```

**Security rationale:** The `aud` claim is unique to our app (`api://4f4f4a4d-...`). A rogue v1 token from a different app cannot satisfy our audience check. Accepting both issuer formats carries zero security trade-off.

### §B — JWT failure diagnostics

On `jwtVerify` failure, decode the token without signature verification and log `iss`, `aud`, `ver`, `scp`, `alg`, `kid` to stderr. This makes future auth regressions self-diagnosing without needing to capture live tokens from users.

### §C — `azure.yaml` predeploy hook fix

Never build the web SPA with `VITE_ADVISOR_DEMO_MODE=true`. The hook now passes:
- `VITE_ADVISOR_DEMO_MODE=false`
- `VITE_ADVISOR_TENANT_ID` and `VITE_ADVISOR_CLIENT_ID` hardcoded (public identifiers)
- `VITE_AZURE_REDIRECT_URI="${STATIC_WEB_APP_URL}"` from AZD env
- `VITE_API_BASE_URL="${CONTAINER_APP_URL}"` from AZD env

## Deployment

- **Backend:** `az acr build` → image `jwt-dual-issuer` → `az containerapp update` → revision `advisor-agent-app--0000005` (Running, 100% traffic)
- **Tests:** 30/30 passing including 4 new dual-issuer tests
- **Frontend:** No web redeploy needed; current SPA was already built correctly by GitHub Actions (without demo mode)

## Action Required from Ha

1. In browser DevTools → Application → Storage → click **"Clear site data"** (or open an incognito window)
2. Navigate to `https://polite-mushroom-0a09fa803.7.azurestaticapps.net/`
3. Sign in with your Microsoft account
4. `GET /sessions` should now succeed

The middleware now accepts both v1 and v2 tokens, so even if Entra's token version propagation is delayed you will be unblocked.
