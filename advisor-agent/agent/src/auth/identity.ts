/**
 * Identity helpers for the AI Project Advisor Agent.
 *
 * Two concerns:
 *   1. getModelCredential() — what credential the agent uses to call Azure services
 *      (Cosmos DB, AI Search, model endpoint).  Always ManagedIdentityCredential in
 *      production; DefaultAzureCredential locally.
 *
 *   2. resolveCallerId(req) — who is making this request.  Reads the Entra `oid`
 *      claim from the validated JWT on the incoming HTTP request.  Falls back to an
 *      opaque demo id when ADVISOR_DEMO_MODE === 'true'.  Throws when neither is
 *      available — the agent should never process a request it cannot attribute.
 *
 * Microsoft Learn — Entra ID token `oid` claim:
 * https://learn.microsoft.com/entra/identity-platform/id-token-claims-reference
 *
 * Microsoft Learn — ManagedIdentityCredential:
 * https://learn.microsoft.com/azure/active-directory/managed-identities-azure-resources/overview
 *
 * FR-016 — managed identity for Azure service access (no secrets in config).
 * FR-019/FR-020 — Entra oid is the ownership key; demo id is isolated from Entra traffic.
 */

import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from "@azure/identity";
import type { Request as ExpressRequest } from "express";

// ---------------------------------------------------------------------------
// Opaque demo id — never overlaps with a real Entra oid because Entra oids are GUIDs
// without this prefix.
// ---------------------------------------------------------------------------
const DEMO_OWNER_ID = "demo::anonymous";

// ---------------------------------------------------------------------------
// Caller identity
// ---------------------------------------------------------------------------

export interface CallerIdentity {
  /** Entra oid (Entra-authenticated traffic) or opaque demo id (demo mode). */
  ownerId: string;
  /** True when running in demo mode — session is isolated under the demo id. */
  isDemo: boolean;
}

/**
 * Returns the model credential for this runtime environment.
 * ManagedIdentityCredential in production; DefaultAzureCredential locally.
 */
export function getModelCredential(): TokenCredential {
  if (process.env.ADVISOR_LOCAL_DEV === "true") {
    return new DefaultAzureCredential();
  }
  // Production: user-assigned managed identity.
  // AZURE_CLIENT_ID is the clientId injected by Bicep; required when the Container App
  // uses a user-assigned (not system-assigned) identity.
  // https://learn.microsoft.com/azure/container-apps/managed-identity
  const clientId = process.env.AZURE_CLIENT_ID;
  return clientId ? new ManagedIdentityCredential(clientId) : new ManagedIdentityCredential();
}

/**
 * Resolves the caller's identity from the incoming request.
 *
 * In a real Entra-authenticated environment the JWT is validated by the hosting
 * layer (Foundry / API Management / middleware) before reaching here; this helper
 * reads the already-validated `oid` claim from request context.
 *
 * In demo mode (ADVISOR_DEMO_MODE === 'true') the function returns a fixed demo id
 * without touching any JWT, as required by FR-015 and §11 demo mode rules.
 *
 * Throws if neither an authenticated oid nor demo mode is available — the agent
 * must never process unauthenticated traffic in production.
 */
export function resolveCallerId(req: ExpressRequest): CallerIdentity {
  if (process.env.ADVISOR_DEMO_MODE === "true") {
    // Demo mode — skip Entra sign-in.  Hosted agent identity / managed identity
    // still applies for Azure service calls (FR-015, §11 demo mode).
    return { ownerId: DEMO_OWNER_ID, isDemo: true };
  }

  // JWT validation middleware (jwt-middleware.ts) runs upstream and attaches req.user.
  // Some host adapters attach claims at req.auth.payload; keep both conventions.
  const reqWithAuth = req as ExpressRequest & { auth?: { payload?: { oid?: string } } };
  const oid: string | undefined = req.user?.oid ?? reqWithAuth.auth?.payload?.oid;

  if (!oid) {
    throw new Error(
      "resolveCallerId: no Entra oid found on request and ADVISOR_DEMO_MODE is not 'true'. " +
        "Ensure JWT validation middleware runs before this handler (FR-014, FR-019)."
    );
  }

  return { ownerId: oid, isDemo: false };
}
