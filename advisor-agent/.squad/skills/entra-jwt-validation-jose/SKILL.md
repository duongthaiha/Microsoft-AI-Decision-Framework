# Skill: Entra ID JWT Validation with jose (Node/TypeScript)

**Scope:** Express.js (or any Node HTTP framework) backend that needs to validate Microsoft Entra ID v2 access tokens issued for a custom API scope.

---

## When to use this skill

Use this pattern when:
- Your backend is a Node/TypeScript service receiving Bearer tokens from an Entra-protected SPA or service.
- Tokens are acquired via MSAL with a custom `api://{appId}/...` scope (v2 endpoint).
- You need a lightweight, zero-dependency JWT validator without `passport` or `@azure/msal-node`.

---

## Dependencies

```bash
npm install jose
```

`jose` is the only runtime dependency needed.

---

## Env var contract

| Var | Purpose | Example |
|-----|---------|---------|
| `ENTRA_TENANT_ID` | Tenant GUID — used to derive JWKS URI and issuer | `cdfe81b5-...` |
| `ENTRA_API_AUDIENCE` | Full `api://` audience URI | `api://4f4f4a4d-...` |

---

## Template: `src/auth/jwt-middleware.ts`

```typescript
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Request, Response, NextFunction } from "express";

// Entra-specific claims not in RFC 7519 JWTPayload
interface EntraTokenClaims {
  oid?: string;
  name?: string;
  preferred_username?: string;
  scp?: string;
  roles?: string[];
}
type EntraPayload = JWTPayload & EntraTokenClaims;

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: { oid: string; name?: string; email?: string; roles: string[] };
    }
  }
}

// --- Config (read once at module load) ---
const TENANT_ID = process.env.ENTRA_TENANT_ID ?? "<fallback-tenant-id>";
const API_AUDIENCE = process.env.ENTRA_API_AUDIENCE ?? "api://<fallback-app-id>";
const EXPECTED_ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const JWKS_URI = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;

// --- JWKS: created ONCE at module load; jose caches with 10-min TTL ---
const JWKS = createRemoteJWKSet(new URL(JWKS_URI));

// --- Middleware ---
export async function jwtMiddleware(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", reason: "missing bearer token" });
    return;
  }
  try {
    const { payload } = await jwtVerify<EntraPayload>(
      authHeader.slice(7), JWKS,
      { issuer: EXPECTED_ISSUER, audience: API_AUDIENCE }
    );
    // Validate delegated scope
    if (!(payload.scp ?? "").split(" ").includes("access_as_user")) {
      res.status(401).json({ error: "unauthorized", reason: "missing scope: access_as_user" });
      return;
    }
    if (!payload.oid) {
      res.status(401).json({ error: "unauthorized", reason: "oid claim missing" });
      return;
    }
    req.user = {
      oid: payload.oid,
      name: payload.name,
      email: payload.preferred_username,
      roles: payload.roles ?? [],
    };
    next();
  } catch (err) {
    res.status(401).json({
      error: "unauthorized",
      reason: err instanceof Error ? err.message : "token validation failed",
    });
  }
}

// --- Role gate ---
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!(req.user?.roles ?? []).includes(role)) {
      res.status(403).json({ error: "forbidden", reason: `role '${role}' is required` });
      return;
    }
    next();
  };
}
```

---

## Mounting in Express

```typescript
// index.ts — mount JWT check on protected path prefixes only
import { jwtMiddleware } from "./auth/jwt-middleware.js";

app.use(["/v1", "/sessions", "/admin"], jwtMiddleware);
app.use("/", mainRouter);
app.use("/admin", adminRouter);  // adminRouter uses requireRole('AdvisorAdmin')
```

`/health` is not in the list and remains unauthenticated.

---

## Gotchas

### ⚠️ v2 audience = `api://` URI, NOT bare GUID

When a user acquires a token for scope `api://{appId}/access_as_user` (v2 endpoint), Entra sets `aud = "api://{appId}"`.  If you validate against the bare GUID, every token fails with "audience mismatch."

**Always:** `ENTRA_API_AUDIENCE=api://{appId}` — the full URI form.

### ⚠️ Create JWKS outside the middleware function

`createRemoteJWKSet` must be called once at module load.  If called inside the middleware, it re-fetches the JWKS on every request and ignores the 10-minute cache.

### ⚠️ `oid` is the stable ownership key, not `sub`

In v2 tokens, `sub` is a pairwise identifier (unique per app).  `oid` is the stable, per-tenant object identifier.  Use `oid` as the Cosmos DB partition key / ownership key.

---

## Checklist for new projects

- [ ] `npm install jose`
- [ ] Set `ENTRA_TENANT_ID` and `ENTRA_API_AUDIENCE` in env (Container App, `.env.local`)
- [ ] JWKS instance created at module load (not per-request)
- [ ] Validate `iss`, `aud`, `exp` (jose), `scp`, `oid`
- [ ] Extend Express `Request` type so `req.user` is type-safe
- [ ] Mount JWT middleware on protected paths only (`/health` excluded)
- [ ] Add `requireRole` gate on admin routes
- [ ] Define app roles on Entra app registration before shipping admin features
- [ ] Document demo mode bypass behaviour (demo identity has no roles → admin blocked)

---

## Reference

- [Validate access tokens (Microsoft Learn)](https://learn.microsoft.com/entra/identity-platform/access-tokens#validate-tokens)
- [jose library (panva/jose)](https://github.com/panva/jose)
- [Entra ID token claims reference](https://learn.microsoft.com/entra/identity-platform/id-token-claims-reference)
- [Add app roles to your application](https://learn.microsoft.com/entra/identity-platform/howto-add-app-roles-in-apps)
