# Advisor Framework Decisions Log

## Wave 4: Security Hardening, React SPA, Admin Guidance

_Date: 2026-05-29_  
_Contributors: Ghost (Security), Mouse (Frontend), Scribe (Orchestration)_

### Security: Identity, Networking, and Secrets Decisions

_Author: Ghost (Security/Networking)_  
_Status: All four Dozer open items resolved. Remaining production gaps flagged._

---

#### Resolved: OPEN-SEC-01 — Developer Access Path

**Decision:** Two-tier access model.

**Tier 1 — Zero cost (use immediately):** Azure Portal built-in data explorers. The Portal's Cosmos DB Data Explorer and AI Search Explorer reach private endpoint services through Azure's control plane — no VPN required. Covers data validation, document inspection, and index queries.

**Tier 2 — P2S VPN (~$30/month, defer until needed):** Point-to-Site VPN Gateway (Basic SKU) for running `@advisor/api` locally against cloud data services. Requires adding `gw-subnet 10.0.2.0/27` to `network.bicep`. Do not provision until a developer explicitly needs to run local code against cloud Cosmos DB or AI Search.

**Temporary exception policy:** If a team member enables public network access temporarily for debugging — raise a PR comment tagged `[SEC-EXCEPTION]`, 24h time-box, revert via Bicep only (not Portal toggle). Log the exception in this file.

**Rejected options:** Bastion (~$140/month, unjustified for POC), jumpbox VM (overhead without benefit over VPN), Dev Tunnels (not applicable — they expose local ports outward, not tunnel developer traffic into a VNet).

---

#### Resolved: OPEN-SEC-02 — Key Vault Secrets Rotation

**Decision:** No secrets to rotate today. All current config is endpoint URLs and non-sensitive identifiers. Managed identity handles all data-service auth.

**When `GITHUB_TOKEN` is added (copilot mode):**
- Store in Key Vault as secret `github-copilot-token` with `expiryDate` set to 90 days.
- Reference from Container App via ACA Key Vault reference + `secretRef` env var (not `value`). Pattern: `docs/security/rbac-and-secrets.md`.
- POC rotation: manual. Developer generates new token, `az keyvault secret set`, ACA rolling restart.
- Production rotation (not POC-blocking): Event Grid `SecretNearExpiry` → Logic App → regenerate token → write to KV → ACA revision rollout.

**Audit log retention:** Key Vault diagnostic logs go to Log Analytics (30-day retention currently). Increase to 90 days for any production or external-demo environment.

---

#### Resolved: OPEN-SEC-03 — Entra External ID Auth (AD-06)

**Decision:** Entra External ID confirmed as the auth provider for all customer-facing users and admins.

**Implementation is deferred post-Wave 1.** For internal demos before auth is wired: use a static `X-Api-Key` header check as an interim gate. This must be removed before any external customer demo.

**When implemented:**
1. Create a dedicated Entra External ID tenant (separate from the Microsoft corporate tenant).
2. Configure sign-up user flow with `organizationId` as a custom attribute.
3. Create app registration with `advisor.read` scope (customer user) and `advisor.admin` scope (org admin).
4. Add `OrgAdmin` role in app manifest; assign per admin user.
5. API auth middleware validates JWT from `https://{tenant}.ciamlogin.com/{tenantId}/v2.0`.
6. Middleware injects `organizationId` claim into request context (never from query string or body).
7. Admin endpoints (`/orgs/{orgId}/*`) require `roles: [OrgAdmin]` AND `token.organizationId === orgId` — both checks are mandatory.

**Org scoping guarantee:** `customerOrganizationId` is the Cosmos DB partition key on both `sessions` and `guidance` containers. All reads must include a `WHERE c.customerOrganizationId = @orgId` clause where `@orgId` comes from the middleware context, never user input.

---

#### Resolved: OPEN-SEC-04 — APIM Consideration (AD-07)

**Decision:** APIM is NOT required before the first external demo.

**Rationale:** Container Apps built-in ingress provides HTTPS termination and DNS. Adding Entra External ID auth middleware in the API covers authentication. APIM adds meaningful value (rate limiting, API versioning, centralized auth, subscription management) only when the advisor is exposed to multiple customer organizations with different SLAs — that is a production concern.

**Production trigger for APIM:** When more than one customer organization is onboarded, or when per-org rate limiting is required, or when the API version contract needs formal management.

---

#### Bicep Fix Applied: Search RBAC Scope

**Finding:** In `roleassignments.bicep`, both `searchIndexDataContributor` and `searchServiceContributor` role assignments used `scope: resourceGroup()`. This is broader than needed — least privilege requires scoping RBAC to the specific resource.

**Fix:** Both search role assignments are now scoped to the `searchService` existing resource reference. New `searchServiceName` parameter added. `main.bicep` updated to pass `search.outputs.name`.

**Validation:** `az bicep build --file agents/advisor/infra/main.bicep` — exit 0. No errors.

---

#### Remaining Production Gaps (Not POC-Blocking)

These are honest gaps for the production hardening backlog. They do not block the POC demo.

| Gap | File / Location | Risk | Production Action |
|-----|----------------|------|-------------------|
| CORS `allowedOrigins: ['*']` | `containerapp.bicep` line 85 | Any origin can call the API | Restrict to front-end hostname before external demo |
| ACR has public access | `acr.bicep` line 24 | Image layer metadata accessible | ACR private endpoint + IP allowlist |
| KV soft-delete = 7 days | `keyvault.bicep` line 35 | Short recovery window | Increase to 90 days |
| Log Analytics retention = 30 days | `monitoring.bicep` line 18 | KV audit logs expire quickly | Increase to 90 days |
| No NSG on pe-subnet | `network.bicep` | Lateral movement within VNet | Add NSG allowing inbound only from aca-subnet |
| Cosmos DB RBAC at account level | `cosmosdb.bicep` line 237 | Identity can access all containers | Narrow to specific container scope |
| No developer RBAC in Bicep | `roleassignments.bicep` | Manual setup needed for local dev | Add optional `developerPrincipalId` param |
| No automated secrets rotation | N/A | Expired token causes silent outage | Event Grid + Logic App rotation |
| Auth currently unauthenticated | N/A | Sessions accessible without login | API key for internal demos; Entra External ID before external demo |

---

### Frontend UX Decisions

_Author: Mouse (Frontend/UX)_  
_Date: 2026-05-29_

- **Technology choices:** React + TypeScript + Vite for a lightweight SPA, `react-router-dom` v6 for routing, and no external CSS framework so the UI stays dependency-light.
- **Alias strategy:** Vite resolves `@advisor/shared` directly to `agents/advisor/shared/src/index.ts`, so local dev does not require a shared package build loop.
- **Form rendering:** the intake wizard renders from embedded JSON at `agents/advisor/web/src/data/intake-form.json`; it is not fetched from the API.
- **Proxy config:** Vite dev server proxies `/sessions`, `/admin`, and `/health` to the API on port 3000 while the UI runs on port 5173.
- **Admin endpoints:** added minimal API routes for guidance listing, saving/updating, and activation; extended shared `IGuidanceStore` to support those operations.
- **Existing endpoints and tests:** were kept backward-compatible; additions are additive and do not change existing route contracts.

---

## Wave 5: Epic 8 Handoff Documentation

_Date: 2026-05-29_  
_Author: Trinity (Lead / Architect)_

### Trinity Wave 5 Handoff Decisions

#### Decision: Treat Wave 5 docs as the production handoff boundary

The POC is documented as complete under `agents\advisor\docs\handoff\`. The next team should not reopen POC acceptance criteria unless tests regress; production hardening belongs in `next-phase-backlog.md`.

#### Decision: Keep POC reality and production target separated

The handoff uses an explicit two-layer model in architecture sections: **POC reality** for implemented behavior and **production target** for future work. This prevents demo claims from quietly becoming production promises.

#### Decision: Call out D1 and G1 as known limitations, not bugs hidden in demo

- **D1:** In-memory similar-project scoring floors the top match at about `0.516`, so local in-memory search cannot reliably prove true no-match. The no-match path is validated through the forced niche IoT eval and the real Azure AI Search adapter threshold behavior.
- **G1:** The mock three-phase agent does not branch final recommendations on Q8 `team_skills`; pro-code cases can still get the default Copilot Studio-led recommendation. Real Copilot SDK wiring and expanded Q8 evidence handling are the production path.

#### Decision: No source changes in Wave 5

Wave 5 produced documentation, history, and decision records only. Source code and infrastructure were not modified or deployed.

---

## Final Verified State (End of Wave 5)

**Build Status:** All 6 workspaces clean (shared/data/api/cli/web/eval)

**Test Coverage:**
- API: 53 tests passing
- Eval: 20 tests passing
- CLI: 32 regression assertions passing

**Definition of Done:** ✓ Met

**Deployment Status:** No Azure deployment run (none requested or possible offline)

---

_Last Updated: 2026-05-29_
