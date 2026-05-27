/**
 * Admin write-path contract tests — POST /admin/org-context, PUT /admin/org-context/:id/publish,
 * GET /admin/org-context/published.
 *
 * LAYER 1 — Backend contract tests.
 *
 * Author: Dallas (Backend Developer)
 * Written: 2026-05-27T10:45:28Z
 * Spec refs: FR-021, FR-024 (versioned org-context write API, M2).
 *
 * Tests:
 *   Test AW-1: POST /admin/org-context — no token → 401
 *   Test AW-2: POST /admin/org-context — non-Admin token → 403
 *   Test AW-3: POST /admin/org-context — AdminToken + valid body → 201, published=false
 *   Test AW-4: POST /admin/org-context — AdminToken + invalid body → 400
 *   Test AW-5: PUT /admin/org-context/:id/publish — no token → 401
 *   Test AW-6: PUT /admin/org-context/:id/publish — non-Admin token → 403
 *   Test AW-7: PUT /admin/org-context/:id/publish — flips published=true, un-flips previous
 *   Test AW-8: GET /admin/org-context/published — no token → 401
 *   Test AW-9: GET /admin/org-context/published — returns published version, never a draft
 *   Test AW-10: GET /admin/org-context/published — 404 when no published version exists
 *
 * MOCK STRATEGY: vi.mock('jose') — same pattern as auth-contract.test.ts.
 * IOrgContextVersionStore is backed by InMemoryOrgContextVersionStore (Map-backed).
 *
 * Microsoft Learn — Entra token claims:
 *   https://learn.microsoft.com/entra/identity-platform/id-token-claims-reference
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express, { type Application } from 'express';
import * as jose from 'jose';
import { createAdminRouter } from '../admin/admin-api.js';
import { jwtMiddleware } from '../auth/jwt-middleware.js';
import type { IOrgContextVersionStore } from '../data/org-context-store.js';
import type { OrgContext, OrgContextVersion } from '../data/models.js';

// ---------------------------------------------------------------------------
// Mock jose
// ---------------------------------------------------------------------------
vi.mock('jose');

const TENANT_ID = 'cdfe81b5-821e-4f07-9ea7-516efc8497e4';
const AUDIENCE  = 'api://4f4f4a4d-e60f-4b86-a681-86059aae4597';
const ISSUER    = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const SCOPE_CLAIM = 'access_as_user';
const ADMIN_ROLE  = 'AdvisorAdmin';

const MOCK_BEARER = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.mock_sig';
const ADMIN_OID   = 'admin-oid-write-001';
const USER_OID    = 'user-oid-nonadmin-001';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
function mockAdminToken(): void {
  vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
    payload: {
      oid: ADMIN_OID,
      iss: ISSUER,
      aud: AUDIENCE,
      scp: SCOPE_CLAIM,
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: 'Test Admin',
      roles: [ADMIN_ROLE],
    },
    protectedHeader: { alg: 'RS256' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function mockUserToken(): void {
  vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
    payload: {
      oid: USER_OID,
      iss: ISSUER,
      aud: AUDIENCE,
      scp: SCOPE_CLAIM,
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: 'Regular User',
      roles: [],
    },
    protectedHeader: { alg: 'RS256' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// ---------------------------------------------------------------------------
// In-memory OrgContextVersionStore — mirrors sse-streaming.test.ts pattern
// ---------------------------------------------------------------------------
class InMemoryOrgContextVersionStore implements IOrgContextVersionStore {
  private map = new Map<string, OrgContextVersion>();
  private n = 0;

  async getPublished(): Promise<OrgContextVersion | null> {
    return [...this.map.values()].find(v => v.published) ?? null;
  }

  async listAll(): Promise<OrgContextVersion[]> {
    return [...this.map.values()].sort((a, b) => b.version - a.version);
  }

  async createDraft(content: OrgContext, author: { oid: string; name: string }): Promise<OrgContextVersion> {
    const version = ++this.n;
    const id = `org-ctx-v${version}`;
    const now = new Date().toISOString();
    const doc: OrgContextVersion = {
      id,
      version,
      createdAt: now,
      createdBy: author,
      publishedAt: '',
      publishedBy: author,
      published: false,
      content,
    };
    this.map.set(id, doc);
    return doc;
  }

  async publish(id: string): Promise<OrgContextVersion> {
    const target = this.map.get(id);
    if (!target) throw Object.assign(new Error('not found'), { code: 404 });
    for (const v of this.map.values()) {
      if (v.published && v.id !== id) this.map.set(v.id, { ...v, published: false });
    }
    const updated: OrgContextVersion = { ...target, published: true, publishedAt: new Date().toISOString() };
    this.map.set(id, updated);
    return updated;
  }

  seed(v: OrgContextVersion): void { this.map.set(v.id, v); }
  clear(): void { this.map.clear(); this.n = 0; }
}

// ---------------------------------------------------------------------------
// Minimal valid OrgContext body
// ---------------------------------------------------------------------------
const VALID_ORG_CONTEXT: OrgContext = {
  id: 'default',
  orgId: 'default',
  version: '1',
  editorId: 'system',
  editedAt: '2026-05-27T10:45:28Z',
  changeSummary: 'Write-path contract test seed',
  systemInventory: [],
  entitlements: [],
  customInstructions: [],
  published: false,
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function createTestApp(store?: IOrgContextVersionStore): Application {
  const app = express();
  app.use(express.json());
  app.use(['/admin'], jwtMiddleware);
  app.use('/admin', createAdminRouter({ orgContextStore: store }));
  return app;
}

// ---------------------------------------------------------------------------
// SUITE 1 — POST /admin/org-context auth gate
// ---------------------------------------------------------------------------

describe('Admin write — POST /admin/org-context auth gate (FR-021)', () => {
  let savedDemoMode: string | undefined;

  beforeEach(() => {
    savedDemoMode = process.env.ADVISOR_DEMO_MODE;
    process.env.ADVISOR_DEMO_MODE = 'false';
  });

  afterEach(() => {
    process.env.ADVISOR_DEMO_MODE = savedDemoMode;
    vi.resetAllMocks();
  });

  it('Test AW-1: no Authorization header → 401 (FR-021)', async () => {
    const app = createTestApp(new InMemoryOrgContextVersionStore());
    const res = await supertest(app)
      .post('/admin/org-context')
      .send(VALID_ORG_CONTEXT);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('Test AW-2: valid token but no AdvisorAdmin role → 403 (FR-021)', async () => {
    const app = createTestApp(new InMemoryOrgContextVersionStore());
    mockUserToken();
    const res = await supertest(app)
      .post('/admin/org-context')
      .set('Authorization', `Bearer ${MOCK_BEARER}`)
      .send(VALID_ORG_CONTEXT);
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// SUITE 2 — POST /admin/org-context creates draft (FR-024)
// ---------------------------------------------------------------------------

describe('Admin write — POST /admin/org-context creates draft (FR-024)', () => {
  let store: InMemoryOrgContextVersionStore;
  let app: Application;
  let savedDemoMode: string | undefined;

  beforeEach(() => {
    savedDemoMode = process.env.ADVISOR_DEMO_MODE;
    process.env.ADVISOR_DEMO_MODE = 'false';
    store = new InMemoryOrgContextVersionStore();
    app = createTestApp(store);
  });

  afterEach(() => {
    process.env.ADVISOR_DEMO_MODE = savedDemoMode;
    store.clear();
    vi.resetAllMocks();
  });

  it('Test AW-3: AdminToken + valid body → 201 draft with published=false (FR-024)', async () => {
    mockAdminToken();
    const res = await supertest(app)
      .post('/admin/org-context')
      .set('Authorization', `Bearer ${MOCK_BEARER}`)
      .send(VALID_ORG_CONTEXT);

    expect(res.status).toBe(201);
    // Must be a draft — never auto-published
    expect(res.body.published).toBe(false);
    // Must carry audit fields
    expect(res.body.id).toBeTruthy();
    expect(res.body.version).toBeGreaterThanOrEqual(1);
    expect(res.body.createdAt).toBeTruthy();
    expect(res.body.createdBy).toMatchObject({ oid: ADMIN_OID });
    expect(res.body.content).toBeDefined();
  });

  it('Test AW-4: AdminToken + missing required fields → 400 (FR-024)', async () => {
    mockAdminToken();
    const res = await supertest(app)
      .post('/admin/org-context')
      .set('Authorization', `Bearer ${MOCK_BEARER}`)
      .send({ /* empty — missing orgId, systemInventory, etc. */ });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// SUITE 3 — PUT /admin/org-context/:id/publish (FR-024)
// ---------------------------------------------------------------------------

describe('Admin write — PUT /admin/org-context/:id/publish (FR-024)', () => {
  let store: InMemoryOrgContextVersionStore;
  let app: Application;
  let savedDemoMode: string | undefined;

  beforeEach(() => {
    savedDemoMode = process.env.ADVISOR_DEMO_MODE;
    process.env.ADVISOR_DEMO_MODE = 'false';
    store = new InMemoryOrgContextVersionStore();
    app = createTestApp(store);
  });

  afterEach(() => {
    process.env.ADVISOR_DEMO_MODE = savedDemoMode;
    store.clear();
    vi.resetAllMocks();
  });

  it('Test AW-5: no Authorization header → 401 (FR-021)', async () => {
    const v1 = await store.createDraft(VALID_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });
    const res = await supertest(app)
      .put(`/admin/org-context/${v1.id}/publish`);
    expect(res.status).toBe(401);
  });

  it('Test AW-6: valid token but no AdvisorAdmin role → 403 (FR-021)', async () => {
    const v1 = await store.createDraft(VALID_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });
    mockUserToken();
    const res = await supertest(app)
      .put(`/admin/org-context/${v1.id}/publish`)
      .set('Authorization', `Bearer ${MOCK_BEARER}`);
    expect(res.status).toBe(403);
  });

  it('Test AW-7: publish v2 flips published=true on v2, published=false on v1 (FR-024 atomicity)', async () => {
    const v1 = await store.createDraft(VALID_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });
    await store.publish(v1.id); // v1 is published

    const v2 = await store.createDraft(VALID_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });

    mockAdminToken();
    const res = await supertest(app)
      .put(`/admin/org-context/${v2.id}/publish`)
      .set('Authorization', `Bearer ${MOCK_BEARER}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(v2.id);
    expect(res.body.published).toBe(true);
    expect(res.body.publishedAt).toBeTruthy();

    // v1 must now be un-published
    const all = await store.listAll();
    const v1Updated = all.find(v => v.id === v1.id);
    expect(v1Updated?.published).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SUITE 4 — GET /admin/org-context/published (FR-024)
// ---------------------------------------------------------------------------

describe('Admin write — GET /admin/org-context/published (FR-024)', () => {
  let store: InMemoryOrgContextVersionStore;
  let app: Application;
  let savedDemoMode: string | undefined;

  beforeEach(() => {
    savedDemoMode = process.env.ADVISOR_DEMO_MODE;
    process.env.ADVISOR_DEMO_MODE = 'false';
    store = new InMemoryOrgContextVersionStore();
    app = createTestApp(store);
  });

  afterEach(() => {
    process.env.ADVISOR_DEMO_MODE = savedDemoMode;
    store.clear();
    vi.resetAllMocks();
  });

  it('Test AW-8: no Authorization header → 401 (FR-021)', async () => {
    const res = await supertest(app).get('/admin/org-context/published');
    expect(res.status).toBe(401);
  });

  it('Test AW-9: AdminToken → returns published version; never returns a draft (FR-024)', async () => {
    const v1 = await store.createDraft(VALID_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });
    const v2 = await store.createDraft(VALID_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });
    await store.publish(v1.id);
    // v2 remains a draft — must never be returned by /published

    mockAdminToken();
    const res = await supertest(app)
      .get('/admin/org-context/published')
      .set('Authorization', `Bearer ${MOCK_BEARER}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(v1.id);
    expect(res.body.published).toBe(true);
    // Must not return the draft v2
    expect(res.body.id).not.toBe(v2.id);
    // Must include the content envelope
    expect(res.body.content).toBeDefined();
  });

  it('Test AW-10: AdminToken but no published version → 404 (FR-024)', async () => {
    // Store is empty — no published version exists
    mockAdminToken();
    const res = await supertest(app)
      .get('/admin/org-context/published')
      .set('Authorization', `Bearer ${MOCK_BEARER}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
