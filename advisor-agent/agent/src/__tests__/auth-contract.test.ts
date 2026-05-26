/**
 * Auth + /v1/responses (advise) critical-path contract tests.
 *
 * LAYER 1 — Backend contract tests.
 *
 * Author: Brett (Tester)
 * Written: 2026-05-26T22:52:00Z
 * Spec refs: FR-014, FR-019, FR-020, FR-021, FR-030; §6 ACs (auth + admin).
 *
 * ⚠️  PRE-IMPLEMENTATION NOTE
 * These tests are written BEFORE Dallas's JWT validation middleware lands.
 * Dallas is wiring `jose`-based JWT middleware on /v1/responses + /admin/*
 * (claim checks: iss, aud=api://4f4f4a4d-e60f-4b86-a681-86059aae4597,
 * scp=access_as_user, exp, JWKS signature verify).
 *
 * EXPECTED STATE AT TIME OF WRITE:
 *   - Test 1  (GET /health)           → ✅ PASSES NOW
 *   - Tests 2–11 (auth / admin)       → ❌ EXPECTED FAIL until Dallas's
 *     middleware lands in index.ts or a shared middleware module.
 *     Current routes return 501 (not implemented stub) instead of 401/403.
 *     This is intentional — the tests define the contract, not the current state.
 *
 * APPROACH: vi.mock('jose') intercepts Dallas's future calls to `jwtVerify`
 * and `createRemoteJWKSet`.  Each test configures the mock to simulate a
 * specific validation outcome (invalid sig, bad aud, expired, etc.) so the
 * test suite covers all failure modes without hitting real Azure AD JWKS.
 *
 * WHEN DALLAS'S MIDDLEWARE LANDS:
 *   1. Remove the ❌ EXPECTED FAIL annotations from the applicable tests.
 *   2. Confirm the mock intercept path matches Dallas's import:
 *        import { jwtVerify, createRemoteJWKSet } from 'jose';
 *   3. Tests 2–9 should then pass against the real app.
 *   4. Tests 10–11 require the `requireAdminRole` stub in admin-api.ts to be
 *      replaced with a real role-claim check.  Update those tests accordingly.
 *
 * ROUTE MAPPING:
 *   The "advise" endpoint referred to in the squad brief is the Hosted Agent
 *   Responses protocol entry point: POST /v1/responses.  If Dallas also adds
 *   a convenience alias at POST /advise, duplicate the auth tests for that path.
 *
 * Microsoft Learn — Entra token claims:
 *   https://learn.microsoft.com/entra/identity-platform/id-token-claims-reference
 * Entra App Registration (safe public identifiers, not secrets):
 *   App ID / audience: api://4f4f4a4d-e60f-4b86-a681-86059aae4597
 *   Tenant ID:         cdfe81b5-821e-4f07-9ea7-516efc8497e4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express, { type Application } from 'express';
import * as jose from 'jose';
import { createResponsesAdapter } from '../adapter/responses.js';
import { createAdminRouter } from '../admin/admin-api.js';
import { jwtMiddleware } from '../auth/jwt-middleware.js';
import type { ISessionStore } from '../data/session-store.js';
import type { IRequestStore } from '../data/request-store.js';

// ---------------------------------------------------------------------------
// JWT claim constants — these are the REQUIRED values Dallas's middleware must
// validate.  They are the public Entra app identifiers (not secrets).
// ---------------------------------------------------------------------------

const TENANT_ID = 'cdfe81b5-821e-4f07-9ea7-516efc8497e4';
const AUDIENCE  = 'api://4f4f4a4d-e60f-4b86-a681-86059aae4597';
const ISSUER    = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const SCOPE_CLAIM = 'access_as_user';
const ADMIN_ROLE  = 'AdvisorAdmin';

// ---------------------------------------------------------------------------
// Mock jose — Dallas's middleware will import { jwtVerify, createRemoteJWKSet }
// from 'jose'.  We intercept those calls so tests run offline and deterministically.
//
// NOTE: if Dallas uses a different jose API surface (e.g. jose.default.jwtVerify),
// update the mock factory to match.
// ---------------------------------------------------------------------------

vi.mock('jose');

// ---------------------------------------------------------------------------
// Stub store implementations — satisfy ISessionStore / IRequestStore for app
// bootstrap; route handlers are M1 stubs anyway so store methods are never
// exercised during these auth-layer tests.
// ---------------------------------------------------------------------------

const stubSessionStore: ISessionStore = {
  createSession: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  appendTurn: vi.fn(),
};

const stubRequestStore: IRequestStore = {
  createRequest: vi.fn(),
  getRequest: vi.fn(),
  updateRequest: vi.fn(),
  setStatusNew: vi.fn(),
  listMyRequests: vi.fn(),
  listAllRequestsAdmin: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test app factory — assembles the same routers used in index.ts without
// starting a real HTTP server.  Mirrors the production bootstrap so that
// when Dallas adds his middleware to index.ts, the same middleware path is
// covered by these tests.
// ---------------------------------------------------------------------------

function createTestApp(): Application {
  const app = express();
  app.use(express.json());
  // Mirror index.ts: jwtMiddleware in front of all protected route prefixes.
  app.use(['/v1', '/sessions', '/admin'], jwtMiddleware);
  app.use('/', createResponsesAdapter({
    sessionStore: stubSessionStore,
    requestStore: stubRequestStore,
    projectSearch: null,
    aoaiClient: null,
    aoaiDeployment: 'gpt-4.1-mini',
    getOrgCtx: async () => null,
  }));
  app.use('/admin', createAdminRouter());
  return app;
}

// ---------------------------------------------------------------------------
// Helpers — build a minimal Bearer token string.  Content is opaque when
// jose.jwtVerify is mocked; we only need a three-segment string that a
// real middleware would attempt to parse before calling jwtVerify.
// ---------------------------------------------------------------------------

const VALID_JWT   = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.valid_sig';
const INVALID_JWT = 'not.a.jwt';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth contract — GET /health', () => {
  const app = createTestApp();

  it('Test 1: returns 200 with service info — no auth required (FR-004)', async () => {
    // ✅ PASSES NOW.  Health check must be publicly reachable for Foundry runtime
    // container validation without any bearer token.
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'advisor-agent' });
  });
});

describe('Auth contract — POST /v1/responses (advise endpoint)', () => {
  /**
   * All tests in this group are ❌ EXPECTED FAIL until Dallas's JWT middleware
   * lands.  Current route handler returns 501; expected is 401/200 as annotated.
   *
   * When Dallas's middleware is wired, remove the EXPECTED FAIL annotations and
   * confirm the jose mock intercept path.
   */
  const app = createTestApp();
  let savedDemoMode: string | undefined;

  beforeEach(() => {
    // jwtMiddleware bypasses auth when ADVISOR_DEMO_MODE=true (used in local dev).
    // Force non-demo mode so these tests exercise the real validation path.
    savedDemoMode = process.env.ADVISOR_DEMO_MODE;
    process.env.ADVISOR_DEMO_MODE = 'false';
  });

  afterEach(() => {
    process.env.ADVISOR_DEMO_MODE = savedDemoMode;
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('Test 2: no Authorization header → 401 {error:"unauthorized"}', async () => {
    // Dallas's middleware must reject requests with no Bearer token before the
    // route handler runs.  FR-014: Entra sign-in required by default.
    const res = await supertest(app)
      .post('/v1/responses')
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('Test 3: malformed Bearer token → 401 [❌ EXPECTED FAIL until middleware lands]', async () => {
    // A syntactically invalid JWT must be rejected with 401, not a 500.
    // The middleware should catch jose parse errors and return 401.
    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${INVALID_JWT}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('Test 4: token signed by wrong key → 401 [❌ EXPECTED FAIL until middleware lands]', async () => {
    // jose.jwtVerify throws JWSSignatureVerificationFailed for wrong-key tokens.
    // Middleware must catch this and return 401 (FR-014).
    const { jwtVerify } = jose;
    vi.mocked(jwtVerify).mockRejectedValueOnce(
      Object.assign(new Error('signature verification failed'), { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' })
    );

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${VALID_JWT}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('Test 5: token with wrong aud claim → 401 [❌ EXPECTED FAIL until middleware lands]', async () => {
    // Dallas must validate aud === AUDIENCE.  A token for a different app must be
    // rejected even if the signature is valid.
    const { jwtVerify } = jose;
    vi.mocked(jwtVerify).mockRejectedValueOnce(
      Object.assign(new Error('audience mismatch'), { code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'aud' })
    );

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${VALID_JWT}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('Test 6: token with wrong iss (different tenant) → 401 [❌ EXPECTED FAIL until middleware lands]', async () => {
    // Dallas must validate iss === ISSUER.  A token from a different tenant or
    // identity provider is a spoofing vector and must be rejected (FR-014).
    const { jwtVerify } = jose;
    vi.mocked(jwtVerify).mockRejectedValueOnce(
      Object.assign(new Error('issuer mismatch'), { code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'iss' })
    );

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${VALID_JWT}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('Test 7: expired token → 401 [❌ EXPECTED FAIL until middleware lands]', async () => {
    // jose.jwtVerify throws JWTExpired when the exp claim has passed.
    // Middleware must treat this as 401 (not 500), FR-014.
    const { jwtVerify } = jose;
    vi.mocked(jwtVerify).mockRejectedValueOnce(
      Object.assign(new Error('JWT expired'), { code: 'ERR_JWT_EXPIRED' })
    );

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${VALID_JWT}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('Test 8: token missing scp: access_as_user → 401 or 403 [❌ EXPECTED FAIL until middleware lands]', async () => {
    /**
     * A token with a valid signature and correct aud/iss but no access_as_user
     * scope should be rejected.  Dallas to decide: 401 (unauthenticated) or 403
     * (authenticated but unauthorised scope).
     *
     * CONTRACT: response status MUST be 401 or 403.
     * Update this test once Dallas documents the chosen status code.
     *
     * FR-014 / squad brief: scp=access_as_user is a required claim.
     */
    const { jwtVerify } = jose;
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        oid: 'test-user-oid-001',
        iss: ISSUER,
        aud: AUDIENCE,
        // scp intentionally absent
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      protectedHeader: { alg: 'RS256' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${VALID_JWT}`)
      .send({ message: 'hello' });

    expect([401, 403]).toContain(res.status);
  });

  it('Test 9: valid token with all required claims → not 401 (FR-014, FR-019) [❌ EXPECTED FAIL until middleware lands]', async () => {
    /**
     * Happy-path: a well-formed JWT with correct iss, aud, scp, and a live exp.
     * After the middleware passes, the route handler is free to return its own
     * status (currently 501 — M1 stub).  The key assertion is that the auth
     * layer does NOT reject the request (status ≠ 401 and ≠ 403).
     *
     * Update the status assertion to 200 (or the real response shape) once
     * Dallas wires the route handler in M1.
     */
    const { jwtVerify } = jose;
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        oid:  'test-user-oid-001',
        iss:  ISSUER,
        aud:  AUDIENCE,
        scp:  SCOPE_CLAIM,
        exp:  Math.floor(Date.now() / 1000) + 3600,
        name: 'Test User',
      },
      protectedHeader: { alg: 'RS256' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${VALID_JWT}`)
      .send({ message: 'hello' });

    // Must not be rejected by auth — exact success code TBD per M1 route impl.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('Auth contract — /admin/* (AdvisorAdmin role gate)', () => {
  /**
   * Tests 10–11 verify the admin role gate in non-demo (production) mode.
   *
   * ENV NOTE: agent/.env.local sets ADVISOR_DEMO_MODE=true for local dev.
   * vi.stubEnv does not reliably override env vars set before the test process
   * starts (vitest 1.6 + dotenv interaction).  We use direct process.env
   * assignment with save/restore to guarantee non-demo mode in these tests.
   *
   * Ref: FR-021 — admin backend gated by AdvisorAdmin Entra app role.
   *      FR-030 — admin read scope enforced at data layer AND middleware.
   */
  const app = createTestApp();
  let savedDemoMode: string | undefined;

  beforeEach(() => {
    savedDemoMode = process.env.ADVISOR_DEMO_MODE;
    process.env.ADVISOR_DEMO_MODE = 'false';
  });

  afterEach(() => {
    process.env.ADVISOR_DEMO_MODE = savedDemoMode;
    vi.resetAllMocks();
  });

  it('Test 10: /admin route without AdvisorAdmin role → 403 [❌ EXPECTED FAIL until middleware lands]', async () => {
    // A signed-in user with a valid JWT but no AdvisorAdmin role must receive 403.
    // No information about admin resources should be disclosed (FR-021).
    // ❌ Currently FAILS: requireAdminRole stub calls next() unconditionally in
    // non-demo mode (returns 501 from the route stub), not 403.
    // Dallas must replace the stub with a real roles-claim check.
    const { jwtVerify } = jose;
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        oid:   'regular-user-oid-001',
        iss:   ISSUER,
        aud:   AUDIENCE,
        scp:   SCOPE_CLAIM,
        roles: [],          // no AdvisorAdmin
        exp:   Math.floor(Date.now() / 1000) + 3600,
      },
      protectedHeader: { alg: 'RS256' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await supertest(app)
      .get('/admin/org-context')
      .set('Authorization', `Bearer ${VALID_JWT}`);

    expect(res.status).toBe(403);
  });

  it('Test 11: /admin route with AdvisorAdmin role → not 403/401 [❌ EXPECTED FAIL until middleware lands]', async () => {
    /**
     * An admin JWT carrying roles: ['AdvisorAdmin'] must pass the role gate.
     * The route handler currently returns 501 (M1 stub) — that is acceptable
     * here; the test only validates that the auth layer allows the request through.
     *
     * ❌ Currently FAILS: no JWT middleware is wired to decode the token and
     * attach the payload before requireAdminRole runs, so the stub calls next()
     * before seeing any role claims.  Test will pass once Dallas's middleware
     * attaches req.auth.payload.roles and requireAdminRole reads it.
     *
     * Update assertion to toBe(200) once Dallas implements org-context read in M1.
     * FR-021 — AdvisorAdmin role required for all admin endpoints.
     */
    const { jwtVerify } = jose;
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        oid:   'admin-user-oid-001',
        iss:   ISSUER,
        aud:   AUDIENCE,
        scp:   SCOPE_CLAIM,
        roles: [ADMIN_ROLE],
        exp:   Math.floor(Date.now() / 1000) + 3600,
        name:  'Test Admin',
      },
      protectedHeader: { alg: 'RS256' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await supertest(app)
      .get('/admin/org-context')
      .set('Authorization', `Bearer ${VALID_JWT}`);

    // Must not be blocked by the role gate.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Claim constant exports — Dallas can import these into his middleware spec or
// middleware unit tests to ensure he validates the same values.
// ---------------------------------------------------------------------------
export { TENANT_ID, AUDIENCE, ISSUER, SCOPE_CLAIM, ADMIN_ROLE };
