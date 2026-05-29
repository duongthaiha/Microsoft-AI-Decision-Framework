# Identity and Authorization Model

**AI Framework Advisor Agent POC**  
_Author: Ghost (Security/Networking)_  
_Date: 2026-05-29_  
_Status: POC design complete. Auth implementation deferred to post-Wave 1 (AD-06). Resolves OPEN-SEC-03._

---

## The Three Principals

Every request to the advisor touches one of three distinct identities. Getting these wrong means one customer's instructions bleed into another customer's session — the single biggest correctness risk in a multi-tenant advisor.

### 1. Customer User

A person at a client organization who submits an intake form, holds an advisor conversation, and reviews recommendations. They have no administrative rights. They can:

- Create and continue their own advisor sessions
- Read framework recommendations from their sessions
- View (but not modify) their organization's active custom instructions if exposed via UI

**Auth principal:** Entra External ID user account (see [Auth Provider](#auth-provider) below).  
**Token claims used:** `sub` (user identity), `oid` (Entra object ID), `organizationId` (custom claim bound at sign-up — see [Org Scoping](#org-scoping)).

### 2. Customer Organization Admin

A designated person within a client organization who manages the organization's advisor configuration. They can:

- Read, write, and activate per-organization custom instructions in Cosmos DB (`guidance` container)
- Read and update the organization context document
- View session metadata for their organization (not other orgs)

**Auth principal:** Entra External ID user account, elevated to `OrgAdmin` role for their tenant/organization.  
**Token claims used:** `sub`, `oid`, `organizationId`, `roles` (must contain `OrgAdmin`).  
**Endpoint requirement:** All admin instruction endpoints (`POST /orgs/{orgId}/guidance`, `PUT /orgs/{orgId}/guidance/{id}`) require `OrgAdmin` role **AND** the token's `organizationId` must match the `{orgId}` path parameter (see [Org Scoping](#org-scoping)).

### 3. Service Identity (Managed Identity)

The `@advisor/api` Container App itself, acting on behalf of all users when calling Cosmos DB, AI Search, and Key Vault. No user credentials ever flow to the data services — only the managed identity's OAuth token.

**Auth principal:** Azure user-assigned managed identity (`id-advisor-{token}`).  
**Token type:** Azure AD workload identity token, issued by IMDS.  
**Configured via:** `AZURE_CLIENT_ID` env var → `DefaultAzureCredential` in the application (see `containerapp.bicep` line 119).

---

## Auth Provider: Entra External ID

**Decision:** Use **Entra External ID** (formerly Azure AD B2C) for all customer-facing users and admins.

**Why Entra External ID, not standard Entra ID?**

The advisor is a customer-facing application — customers are not Microsoft employees, not AAD-joined, and not members of the organization's corporate tenant. Entra External ID is Microsoft's CIAM (Customer Identity and Access Management) platform built precisely for this pattern. It provides:

- Self-service sign-up and branded login UX without IT involvement
- Organization-to-user binding via custom claims at sign-up
- Role claim injection (so `OrgAdmin` can be assigned per-user without touching the corporate directory)
- OIDC/OAuth 2.0 compliance → integrates with standard JWT middleware in Node.js/Express

Standard Entra ID (corporate tenant) is wrong here because: it requires IT admins to create guest accounts for every customer user, mixes customer identities into the corporate directory, and has no built-in CIAM patterns for self-service onboarding.

> **AD-06 resolution:** Entra External ID is confirmed as the auth provider. Implementation is deferred post-Wave 1; an API key header (`X-Api-Key`) is an acceptable interim gate-keeping mechanism for the first internal demo only. The interface-shaped auth middleware placeholder in `@advisor/api` must validate JWTs from the Entra External ID OIDC endpoint when real auth is wired.

**Entra External ID tenant setup (when implemented):**

1. Create a new External ID tenant (separate from the Microsoft corporate tenant).
2. Configure sign-up user flow: email + password with `organizationId` custom attribute.
3. Configure app registration for `@advisor/api` with scope `advisor.read` (customer user) and `advisor.admin` (org admin).
4. Add `roles` claim to the token: `OrgAdmin` role defined in the app manifest, assigned per-user via the Entra portal or Graph API.
5. Token issuer: `https://{tenant-name}.ciamlogin.com/{tenant-id}/v2.0`

---

## Role → Endpoint Mapping

| Role | Token Claims Required | Permitted Endpoints | Denied |
|------|----------------------|---------------------|--------|
| **Customer User** | `organizationId` present | `POST /sessions`, `GET/POST /sessions/{id}/messages`, `GET /sessions/{id}/recommendation`, `GET /sessions/{id}/similar-projects` | Any `/orgs/` admin endpoint |
| **Customer Org Admin** | `organizationId` + `roles: [OrgAdmin]` | All user endpoints + `GET /orgs/{orgId}/guidance`, `POST /orgs/{orgId}/guidance`, `PUT /orgs/{orgId}/guidance/{id}`, `DELETE /orgs/{orgId}/guidance/{id}` | Other orgs' `/orgs/{otherId}/` endpoints |
| **Service Identity** | N/A (MI token) | Cosmos DB, AI Search, Key Vault (data plane via RBAC) | Public internet; no inbound role |

Admin endpoint authorization check pseudo-logic (enforced in API middleware):

```
if endpoint is /orgs/{orgId}/* then:
  require role = OrgAdmin
  require token.organizationId === route.orgId
  if either fails → 403 Forbidden
```

This double-check (role + org claim match) is what prevents org A's admin from accidentally or maliciously touching org B's guidance documents, even if they somehow have the `OrgAdmin` role.

---

## Org Scoping End-to-End {#org-scoping}

The `customerOrganizationId` is the spine of multi-tenancy in this system. It flows through every layer:

```
Token claim          API middleware            Cosmos DB partition
────────────         ──────────────            ────────────────────
organizationId  ──►  inject into              /customerOrganizationId
(from OIDC JWT)      session context   ──►    (partition key on both
                     on every request         `sessions` and `guidance`
                                              containers)
```

**Token → API:** The auth middleware extracts `organizationId` from the validated JWT. It is stored in the request context and never taken from the query string or request body (to prevent spoofing).

**API → Cosmos DB:** Every Cosmos DB read and write uses `customerOrganizationId` as a required query parameter. Reads always include a `WHERE c.customerOrganizationId = @orgId` clause. Writes always set `customerOrganizationId` from the middleware-injected value, not from user-supplied input.

**Partition guarantee:** Both `sessions` and `guidance` containers use `/customerOrganizationId` as the partition key (`cosmosdb.bicep` lines 86-90 and 119-123). Cosmos DB physically separates data per partition key value. There is no query path that can return data from partition A when filtering on partition B.

**Admin instruction check (guidance container):** Before the agent loads custom instructions (`guidance` container, `activeFlag = true`), the API must confirm the returned document's `customerOrganizationId` matches the session's org ID. This is a defense-in-depth check against accidental index corruption.

---

## Production Gaps (Not POC-Blocking)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| Auth is currently unauthenticated | Demo sessions accessible without login | Acceptable for internal demos; block with API key before external demo |
| `organizationId` claim binding strategy | Admin can only administer org they were provisioned for | Define sign-up flow: admin pre-provisions `organizationId` value during tenant setup |
| Token lifetime / session timeout | Long-lived tokens increase risk window | Set Entra External ID token lifetime to 1h access / 8h refresh |
| CORS `allowedOrigins: ['*']` in `containerapp.bicep` line 85 | Allows any origin to call the API | Restrict to known front-end origins before external demo |
| No rate limiting per org | Runaway session creation by one org affects all | Add ACA HTTP scaling rules per-org header OR add APIM (see AD-07; not POC-blocking) |
