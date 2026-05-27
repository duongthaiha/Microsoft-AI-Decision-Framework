# SKILL: CORS Preflight with JWT Middleware

**Category:** Security / Middleware Ordering  
**Signal:** High — this pattern recurs in every Express API that uses JWT auth and a browser SPA client.  
**Author:** Dallas  
**Created:** 2026-05-27  

---

## The Problem

When you add JWT authentication middleware to Express routes **before** CORS middleware,
browsers can never reach your API from a cross-origin SPA.

Why: browsers send an HTTP `OPTIONS` preflight request **without** an `Authorization` header
(W3C Fetch Standard §3.2 — non-negotiable, cannot be changed client-side). If your JWT
middleware runs first, it sees no token and returns `401`. The `401` carries no
`Access-Control-Allow-Origin` header. The browser treats this as a CORS failure and blocks
the real request. The SPA shows "Failed to fetch".

---

## The Fix (Three Layers)

### Layer 1: Mount `cors()` BEFORE any auth middleware

```typescript
import cors from 'cors';

// ✅ CORS FIRST — handles OPTIONS preflight before JWT sees the request
app.use(cors({
  origin: allowedOrigins,      // NEVER use '*' with credentials: true
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));

// JWT auth comes AFTER
app.use(['/v1', '/sessions', '/admin'], jwtMiddleware);
```

### Layer 2: Belt-and-braces bypass in the JWT middleware itself

Add this at the **very top** of your middleware function, before any auth logic:

```typescript
export async function jwtMiddleware(req, res, next) {
  // W3C CORS: browsers send OPTIONS preflight without Authorization.
  // CORS middleware handles these; skip auth unconditionally.
  if (req.method === 'OPTIONS') {
    next();
    return;
  }
  // ... rest of JWT validation
}
```

This belt-and-braces guard means that even if someone reorders the middleware stack in a
future refactor, preflights will never hit a 401.

### Layer 3: Env-driven origin allowlist (no wildcard)

```typescript
const DEFAULT_ORIGINS = [
  'https://your-swa-origin.azurestaticapps.net',
  'http://localhost:5173',
];

const allowedOrigins = (process.env.ADVISOR_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOrigins = allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ORIGINS;
```

- Deployed SWA origin lives in an env var → no code change needed to add origins later.
- Comma-separated format allows multiple origins in a single env var.
- Bicep injects `ADVISOR_ALLOWED_ORIGINS` via container env vars.

---

## Bicep Pattern

In `container-apps.bicep`:

```bicep
@description('Comma-separated list of allowed CORS origins.')
param allowedOrigins string = ''

// ... in env array:
{
  name: 'ADVISOR_ALLOWED_ORIGINS'
  value: allowedOrigins
}
```

In `main.bicep`:

```bicep
@description('Comma-separated list of allowed CORS origins.')
param allowedOrigins string = 'https://your-swa-origin.azurestaticapps.net'

// ... passed to containerApps module:
allowedOrigins: allowedOrigins
```

---

## Contract Test Pattern

Every protected route prefix should have a preflight test. Brett's pattern:

```typescript
it('OPTIONS preflight from SWA origin → 2xx with Access-Control-Allow-Origin', async () => {
  const res = await supertest(app)
    .options('/v1/responses')
    .set('Origin', SWA_ORIGIN)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');

  expect(res.status).toBeGreaterThanOrEqual(200);
  expect(res.status).toBeLessThan(300);
  expect(res.headers['access-control-allow-origin']).toBe(SWA_ORIGIN);
});

it('OPTIONS preflight from unlisted origin → no CORS header', async () => {
  const res = await supertest(app)
    .options('/v1/responses')
    .set('Origin', 'https://evil.example.com')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');

  expect(res.headers['access-control-allow-origin']).toBeUndefined();
});
```

---

## What NOT to Do

| ❌ Anti-pattern | Why it breaks |
|----------------|---------------|
| `cors({ origin: '*' })` with `credentials: true` | Browsers reject this combination — `*` and credentials are mutually exclusive in CORS spec. |
| Mounting `cors()` after `jwtMiddleware` | JWT middleware returns 401 on preflight before CORS headers are set. |
| Skipping the `OPTIONS` bypass in `jwtMiddleware` | Fragile — any future middleware reordering causes the regression to silently return. |
| Hardcoding origin in source | Origin changes with every new SWA deployment; env var is the right abstraction. |

---

## Real-World Evidence

This exact pattern caused a P0 regression (2026-05-27) where the SPA showed
"Failed to fetch" for all users despite the backend being healthy. Fixed by:

1. Installing `cors` npm package.
2. Mounting `cors()` before `jwtMiddleware` in `agent/src/index.ts`.
3. Adding `if (req.method === 'OPTIONS') return next()` at the top of `jwt-middleware.ts`.
4. Wiring `ADVISOR_ALLOWED_ORIGINS` through Bicep.
5. Verification: `curl OPTIONS` returned HTTP 204 with `access-control-allow-origin` header.

Decision file: `.squad/decisions/inbox/dallas-cors-preflight-fix.md`
