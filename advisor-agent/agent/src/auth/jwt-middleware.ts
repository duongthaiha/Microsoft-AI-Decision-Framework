/**
 * Entra ID JWT validation middleware for the AI Project Advisor Agent.
 *
 * Validates Bearer tokens issued by Microsoft Entra ID (v2 endpoint) against
 * the tenant's JWKS endpoint.  Attaches `req.user` on success so downstream
 * handlers (and `resolveCallerId`) can read identity claims without touching
 * raw JWT again.
 *
 * Claim validations enforced:
 *   - `iss`  — must match `https://login.microsoftonline.com/{tenantId}/v2.0`
 *   - `aud`  — must match `api://{appId}` (v2 access token audience for custom scopes)
 *   - `exp`  — enforced automatically by jose
 *   - `scp`  — must contain `access_as_user`
 *
 * Configuration (env vars):
 *   ENTRA_TENANT_ID    — Entra tenant ID (default: cdfe81b5-821e-4f07-9ea7-516efc8497e4)
 *   ENTRA_API_AUDIENCE — Full api:// audience URI (default: api://4f4f4a4d-e60f-4b86-a681-86059aae4597)
 *
 * JWKS keys are fetched once and cached with jose's default 10-minute TTL —
 * `createRemoteJWKSet` is called once at module load, not per-request.
 *
 * Microsoft Learn — Validate tokens:
 * https://learn.microsoft.com/entra/identity-platform/access-tokens#validate-tokens
 *
 * FR-014, FR-019 — Entra authentication required on all non-health routes.
 * FR-021 — AdvisorAdmin role gate (see requireRole below).
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Entra-specific JWT claims (beyond the RFC 7519 standard set).
// ---------------------------------------------------------------------------

interface EntraTokenClaims {
  /** Entra object identifier — stable, per-tenant unique user ID.  Use as ownerId. */
  oid?: string;
  /** Display name. */
  name?: string;
  /** UPN / email-style login hint. */
  preferred_username?: string;
  /** Space-delimited delegated scopes granted. */
  scp?: string;
  /** App roles assigned to the user / service principal. */
  roles?: string[];
}

type EntraPayload = JWTPayload & EntraTokenClaims;

// ---------------------------------------------------------------------------
// Augment the Express Request type so callers get type-safe access.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by jwtMiddleware after successful token validation. */
      user?: {
        /** Entra object ID (oid) — the stable, per-tenant user identifier. */
        oid: string;
        name?: string;
        email?: string;
        /** App roles assigned to this principal (from `roles` claim). */
        roles: string[];
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Configuration — read once at module load.
// ---------------------------------------------------------------------------

const TENANT_ID =
  process.env.ENTRA_TENANT_ID ?? "cdfe81b5-821e-4f07-9ea7-516efc8497e4";

const API_AUDIENCE =
  process.env.ENTRA_API_AUDIENCE ??
  "api://4f4f4a4d-e60f-4b86-a681-86059aae4597";

const EXPECTED_ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

const JWKS_URI = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;

// ---------------------------------------------------------------------------
// JWKS — created once; jose caches the key set with a 10-minute TTL.
// Must not be constructed inside the middleware function (would re-fetch per request).
// ---------------------------------------------------------------------------

const JWKS = createRemoteJWKSet(new URL(JWKS_URI));

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Validates the `Authorization: Bearer <jwt>` header on every incoming request.
 *
 * In demo mode (`ADVISOR_DEMO_MODE === 'true'`) JWT validation is bypassed and
 * the request is attributed to the opaque demo identity.  Admin routes remain
 * protected because the demo identity carries no roles.
 *
 * On success: sets `req.user` and calls `next()`.
 * On failure: responds 401 with `{ error: 'unauthorized', reason: '<short>' }`.
 */
export async function jwtMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // W3C CORS spec: browsers send OPTIONS preflight WITHOUT an Authorization header.
  // The CORS middleware (mounted before this) handles preflights; belt-and-braces
  // here ensures ordering regressions never cause a 401 on OPTIONS.
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  // Demo mode — bypass JWT; identity is the opaque demo id.
  if (process.env.ADVISOR_DEMO_MODE === "true") {
    req.user = { oid: "demo::anonymous", roles: [] };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", reason: "missing bearer token" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify<EntraPayload>(token, JWKS, {
      issuer: EXPECTED_ISSUER,
      audience: API_AUDIENCE,
      // `exp` is validated automatically by jose.
    });

    // Validate delegated scope.
    const scopes = (payload.scp ?? "").split(" ").filter(Boolean);
    if (!scopes.includes("access_as_user")) {
      res
        .status(401)
        .json({ error: "unauthorized", reason: "missing required scope: access_as_user" });
      return;
    }

    const oid = payload.oid;
    if (!oid) {
      res.status(401).json({ error: "unauthorized", reason: "oid claim missing from token" });
      return;
    }

    req.user = {
      oid,
      name: payload.name,
      email: payload.preferred_username,
      roles: payload.roles ?? [],
    };

    next();
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "token validation failed";
    res.status(401).json({ error: "unauthorized", reason });
  }
}

// ---------------------------------------------------------------------------
// Role gate helper
// ---------------------------------------------------------------------------

/**
 * Returns an Express middleware that enforces the given Entra app role.
 *
 * Runs after `jwtMiddleware` (which populates `req.user`).  Returns 403 if the
 * user's `roles` claim does not include the expected role.
 *
 * ⚠️  AdvisorAdmin is not yet defined on the app registration (appId
 * 4f4f4a4d-e60f-4b86-a681-86059aae4597).  Parker must add the `AdvisorAdmin`
 * app role to the manifest before M1 ships — see decision file
 * dallas-jwt-validation-middleware.md for the tracked gap.
 *
 * FR-021 — admin backend gated by AdvisorAdmin Entra app role.
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.ADVISOR_DEMO_MODE === "true") {
      // Admin access is explicitly blocked in demo mode regardless of identity.
      res
        .status(403)
        .json({ error: "forbidden", reason: "admin access is not available in demo mode" });
      return;
    }

    const roles = req.user?.roles ?? [];
    if (!roles.includes(role)) {
      res
        .status(403)
        .json({ error: "forbidden", reason: `role '${role}' is required` });
      return;
    }

    next();
  };
}
