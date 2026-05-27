# Skill: Dual-Issuer JWT Validation for Microsoft Entra

**Author:** Dallas  
**Date:** 2026-05-27  
**Triggered by:** P0 regression — `GET /sessions` 401 after `requestedAccessTokenVersion: 2` patch

---

## The Problem

Microsoft Entra can issue access tokens with one of two `iss` claim formats:

| Format | Issuer value | When issued |
|--------|-------------|-------------|
| **v2** | `https://login.microsoftonline.com/{tenantId}/v2.0` | `requestedAccessTokenVersion: 2` on the app registration |
| **v1** | `https://sts.windows.net/{tenantId}/` | `requestedAccessTokenVersion: null` or `1` (default) |

If your middleware accepts only one format and Entra issues the other, every request gets a silent 401. The user can be fully authenticated, the token can be correctly scoped, and it still fails. This is extremely hard to diagnose without detailed token logging.

## The Fix — Accept Both Issuers

```typescript
import { jwtVerify } from "jose";

const TENANT_ID = process.env.ENTRA_TENANT_ID!;
const API_AUDIENCE = process.env.ENTRA_API_AUDIENCE!; // e.g. api://{appId}

// Accept both — eliminates the entire class of issuer-version breakage.
// The api:// audience is unique to your app so there is no security trade-off.
const ACCEPTED_ISSUERS = [
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  `https://sts.windows.net/${TENANT_ID}/`,
];

// jose v5+ accepts issuer as string[].
const { payload } = await jwtVerify(token, JWKS, {
  issuer: ACCEPTED_ISSUERS,
  audience: API_AUDIENCE,
});
```

## Why It's Safe

The `aud` (audience) claim is scoped to your specific app registration (`api://{appId}`). A token from a different app — even one in the same tenant, even one with a v1 issuer — cannot satisfy the audience check. Accepting both issuer formats does not widen the attack surface.

## Self-Diagnosing Failure Logging

Add this to your catch block. `decodeJwt` and `decodeProtectedHeader` from `jose` work without signature verification — they expose the actual claims of the rejected token so you can pinpoint the mismatch instantly in ACA/AppInsights logs.

```typescript
import { decodeJwt, decodeProtectedHeader } from "jose";

} catch (err) {
  const reason = err instanceof Error ? err.message : "token validation failed";
  try {
    const header = decodeProtectedHeader(token);
    const claims = decodeJwt(token) as Record<string, unknown>;
    console.error("[jwt] validation failed", {
      reason,
      alg: header.alg,
      kid: header.kid,
      iss: claims["iss"],   // ← is this v1 or v2?
      aud: claims["aud"],   // ← audience match?
      ver: claims["ver"],   // ← "1.0" or "2.0"
      scp: claims["scp"],   // ← scope present?
      exp: claims["exp"],
    });
  } catch {
    console.error("[jwt] validation failed — token not parseable", { reason });
  }
  res.status(401).json({ error: "unauthorized", reason });
}
```

## Testing Pattern

```typescript
it("accepts a v1 issuer token", async () => {
  vi.mocked(jwtVerify).mockResolvedValueOnce({
    payload: {
      oid: "test-oid",
      iss: `https://sts.windows.net/${TENANT_ID}/`,
      aud: AUDIENCE,
      scp: "access_as_user",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    protectedHeader: { alg: "RS256" },
  } as any);

  const res = await supertest(app)
    .get("/sessions")
    .set("Authorization", "Bearer header.payload.sig");
  expect(res.status).not.toBe(401);
});

it("passes BOTH issuers to jose.jwtVerify", async () => {
  // ...
  const options = vi.mocked(jwtVerify).mock.calls[0][2];
  expect(Array.isArray(options.issuer)).toBe(true);
  expect(options.issuer).toContain(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`);
  expect(options.issuer).toContain(`https://sts.windows.net/${TENANT_ID}/`);
});
```

## Checklist

- [ ] `ACCEPTED_ISSUERS` is an array, not a single string
- [ ] Audience validates against `api://{appId}` (full URI, not bare GUID)
- [ ] JWKS is constructed once at module load (not per request)
- [ ] Failure catch block decodes and logs `iss`, `aud`, `ver`, `scp`, `kid`
- [ ] Tests cover both v1 and v2 issuer tokens
- [ ] `VITE_ADVISOR_DEMO_MODE` is never `true` in production builds

## Reference

- [Microsoft Learn — Token versions](https://learn.microsoft.com/entra/identity-platform/access-tokens#token-formats)
- [Microsoft Learn — Validate tokens](https://learn.microsoft.com/entra/identity-platform/access-tokens#validate-tokens)
- [jose v6 jwtVerify options](https://github.com/panva/jose)
- Codebase: `agent/src/auth/jwt-middleware.ts`, `agent/src/__tests__/dual-issuer-jwt.test.ts`
