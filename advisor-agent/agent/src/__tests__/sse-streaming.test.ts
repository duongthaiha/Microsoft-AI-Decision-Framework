/**
 * SSE Streaming + Admin org-context version API — M2 contract tests.
 *
 * LAYER 1 — Backend integration tests.
 *
 * Author: Dallas (Backend Developer)
 * Written: 2026-05-27
 * Spec refs: FR-024 (versioned org-context write), M2 SSE streaming spec.
 *
 * Tests:
 *   Test 1 [SSE]:          Streaming path — events arrive in correct order.
 *   Test 2 [SSE]:          Non-streaming fallback — returns batched JSON.
 *   Test 3 [SSE]:          Error mid-stream — emits `error` event and closes.
 *   Test 4 [Admin Create]: POST /admin/org-context/versions → 201 draft.
 *   Test 5 [Admin List]:   GET /admin/org-context/versions → lists all.
 *   Test 6 [Admin Publish]:POST /admin/org-context/versions/:id/publish → published.
 *
 * MOCK STRATEGY
 * ─────────────
 * • jose              — vi.mock('jose'), same pattern as auth-contract.test.ts.
 * • ISessionStore     — InMemorySessionStore (Map-backed).
 * • IRequestStore     — InMemoryRequestStore (Map-backed).
 * • AzureOpenAI       — mockChatCreate returning either non-streaming or async-iterator
 *                       streaming response depending on `stream` param.
 * • IOrgContextVersionStore — InMemoryOrgContextVersionStore (Map-backed).
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
import type { IOrgContextVersionStore } from '../data/org-context-store.js';
import type {
  Session,
  Request as AdvisorRequest,
  OrgContext,
  OrgContextVersion,
} from '../data/models.js';
import type { AzureOpenAI } from 'openai';

// ---------------------------------------------------------------------------
// Mock jose
// ---------------------------------------------------------------------------
vi.mock('jose');

const TENANT_ID = 'cdfe81b5-821e-4f07-9ea7-516efc8497e4';
const AUDIENCE  = 'api://4f4f4a4d-e60f-4b86-a681-86059aae4597';
const ISSUER    = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const SCOPE_CLAIM = 'access_as_user';
const ADMIN_OID = 'admin-user-001';
const USER_OID  = 'regular-user-001';
const MOCK_BEARER = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.mock_sig';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
function mockValidToken(oid: string, roles: string[] = []): void {
  vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
    payload: {
      oid,
      iss: ISSUER,
      aud: AUDIENCE,
      scp: SCOPE_CLAIM,
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: `User ${oid}`,
      roles,
    },
    protectedHeader: { alg: 'RS256' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// ---------------------------------------------------------------------------
// In-memory SessionStore
// ---------------------------------------------------------------------------
class InMemorySessionStore implements ISessionStore {
  private map = new Map<string, Session>();
  private n = 0;

  createSession = vi.fn(async (ownerId: string, title: string): Promise<Session> => {
    const id = `sess-${++this.n}`;
    const now = '2026-05-27T07:00:00Z';
    const s: Session = { id, sessionId: id, ownerId, ownerType: 'entra', title, status: 'active', createdAt: now, lastActiveAt: now, turnCount: 0 };
    this.map.set(id, s);
    return s;
  });
  getSession = vi.fn(async (ownerId: string, sessionId: string): Promise<Session | null> => {
    const s = this.map.get(sessionId);
    return (!s || s.ownerId !== ownerId) ? null : s;
  });
  listSessions = vi.fn(async (ownerId: string): Promise<Session[]> =>
    [...this.map.values()].filter(s => s.ownerId === ownerId)
  );
  renameSession = vi.fn(async (ownerId: string, sessionId: string, title: string): Promise<Session> => {
    const s = this.map.get(sessionId);
    if (!s || s.ownerId !== ownerId) throw new Error('not found');
    s.title = title; return s;
  });
  deleteSession = vi.fn(async (_ownerId: string, sessionId: string): Promise<void> => {
    this.map.delete(sessionId);
  });
  appendTurn = vi.fn(async () => ({ turnId: 'turn-mock', sessionId: 'x', ownerId: 'x', role: 'user' as const, content: '', timestamp: '' }));

  seed(partial: Pick<Session, 'id' | 'ownerId'> & Partial<Session>): Session {
    const now = '2026-05-27T07:00:00Z';
    const s: Session = { sessionId: partial.id, ownerType: 'entra', title: 'Test', status: 'active', createdAt: now, lastActiveAt: now, turnCount: 0, ...partial };
    this.map.set(s.id, s);
    return s;
  }
  clear(): void { this.map.clear(); this.n = 0; }
}

// ---------------------------------------------------------------------------
// In-memory RequestStore
// ---------------------------------------------------------------------------
class InMemoryRequestStore implements IRequestStore {
  private map = new Map<string, AdvisorRequest>();
  private n = 0;

  createRequest = vi.fn(async (ownerId: string, sessionId: string, title: string): Promise<AdvisorRequest> => {
    const id = `req-${++this.n}`;
    const now = '2026-05-27T07:00:00Z';
    const r: AdvisorRequest = {
      id, requestId: id, sessionId, ownerId, title,
      businessOutcome: '', targetUsers: '', desiredBehavior: '',
      dataSources: '', actions: '', constraints: '',
      frameworkAnswers: {},
      similarProjectMatches: [],
      reuseDecision: { decision: 'pending', matchesPresented: [] },
      status: 'Draft', createdAt: now, updatedAt: now,
    };
    this.map.set(id, r);
    return r;
  });
  getRequest = vi.fn(async (ownerId: string, requestId: string): Promise<AdvisorRequest | null> => {
    const r = this.map.get(requestId);
    return (!r || r.ownerId !== ownerId) ? null : r;
  });
  updateRequest = vi.fn(async (ownerId: string, requestId: string, patch: Partial<AdvisorRequest>): Promise<AdvisorRequest> => {
    const r = this.map.get(requestId);
    if (!r || r.ownerId !== ownerId) throw new Error('not found');
    Object.assign(r, patch);
    return r;
  });
  setStatusNew = vi.fn();
  listMyRequests = vi.fn(async (): Promise<AdvisorRequest[]> => []);
  listAllRequestsAdmin = vi.fn(async () => []);

  clear(): void { this.map.clear(); this.n = 0; }
}

// ---------------------------------------------------------------------------
// In-memory OrgContextVersionStore
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
    const doc: OrgContextVersion = { id, version, publishedAt: '', publishedBy: author, published: false, content };
    this.map.set(id, doc);
    return doc;
  }
  async publish(id: string): Promise<OrgContextVersion> {
    const target = this.map.get(id);
    if (!target) throw Object.assign(new Error('not found'), { code: 404 });
    for (const v of this.map.values()) {
      if (v.published && v.id !== id) this.map.set(v.id, { ...v, published: false });
    }
    const updated = { ...target, published: true, publishedAt: new Date().toISOString() };
    this.map.set(id, updated);
    return updated;
  }
  seed(v: OrgContextVersion): void { this.map.set(v.id, v); }
  clear(): void { this.map.clear(); this.n = 0; }
}

// ---------------------------------------------------------------------------
// AOAI mock — supports both streaming and non-streaming
// ---------------------------------------------------------------------------
const PRESET_TEXT = 'Copilot Studio is the right platform for your project.';

const mockChatCreate = vi.fn();

const mockAoaiClient = {
  chat: { completions: { create: mockChatCreate } },
} as unknown as AzureOpenAI;

/** Create a minimal AsyncIterable that yields chunks and then ends. */
function makeMockStream(chunks: Array<{ content?: string; finish_reason?: string | null }>) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= chunks.length) return { done: true, value: undefined };
          const chunk = chunks[i++];
          return {
            done: false,
            value: {
              choices: [{
                delta: { content: chunk.content ?? null, tool_calls: null },
                finish_reason: chunk.finish_reason ?? null,
              }],
            },
          };
        },
      };
    },
  };
}

const PRESET_STREAM_CHUNKS = [
  { content: 'Copilot ', finish_reason: null },
  { content: 'Studio ', finish_reason: null },
  { content: 'is the right platform.', finish_reason: 'stop' },
];

const PRESET_NON_STREAMING = {
  id: 'chatcmpl-test-sse',
  object: 'chat.completion',
  created: 1748390400,
  model: 'gpt-4.1-mini',
  choices: [{
    index: 0,
    finish_reason: 'stop',
    message: { role: 'assistant', content: PRESET_TEXT, tool_calls: undefined },
    logprobs: null,
  }],
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function createTestApp(
  sessionStore: ISessionStore,
  requestStore: IRequestStore,
  orgContextStore?: IOrgContextVersionStore
): Application {
  const app = express();
  app.use(express.json());
  app.use(['/v1', '/sessions', '/admin'], jwtMiddleware);
  app.use('/', createResponsesAdapter({
    sessionStore,
    requestStore,
    projectSearch: null,
    aoaiClient: mockAoaiClient,
    aoaiDeployment: 'gpt-4.1-mini',
    getOrgCtx: async () => null,
  }));
  if (orgContextStore) {
    app.use('/admin', createAdminRouter({ orgContextStore }));
  } else {
    app.use('/admin', createAdminRouter());
  }
  return app;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const CANNED_INTAKE = {
  input: {
    businessOutcome: 'Automate expense reporting',
    targetUsers: 'Finance team',
    desiredBehavior: 'Upload receipt and get GL code suggestion',
    dataSources: 'ERP',
    actions: 'Create expense entry',
    constraints: 'GDPR',
  },
};

const SEED_ORG_CONTEXT: OrgContext = {
  id: 'default',
  orgId: 'default',
  version: '1',
  editorId: 'system',
  editedAt: '2026-05-27T07:00:00Z',
  changeSummary: 'Initial seed',
  systemInventory: [],
  entitlements: [],
  customInstructions: [],
  published: true,
};

// ---------------------------------------------------------------------------
// SUITE 1 — SSE streaming path: events arrive in correct order
// ---------------------------------------------------------------------------

describe('SSE Streaming — POST /v1/responses with Accept: text/event-stream', () => {
  let sessionStore: InMemorySessionStore;
  let requestStore: InMemoryRequestStore;
  let app: Application;

  beforeEach(() => {
    process.env.ADVISOR_DEMO_MODE = 'false';
    sessionStore = new InMemorySessionStore();
    requestStore = new InMemoryRequestStore();
    app = createTestApp(sessionStore, requestStore);
    // Mock: return streaming response when stream:true
    mockChatCreate.mockImplementation(async (params: { stream?: boolean }) => {
      if (params.stream) return makeMockStream(PRESET_STREAM_CHUNKS);
      return PRESET_NON_STREAMING;
    });
  });

  afterEach(() => {
    sessionStore.clear(); requestStore.clear(); vi.resetAllMocks();
    process.env.ADVISOR_DEMO_MODE = 'false';
  });

  it('Test 1 [SSE]: streaming path — events arrive in order turn.created → text.delta+ → turn.completed → response.done', async () => {
    /**
     * Client sends Accept: text/event-stream.
     * Expected event sequence:
     *   turn.created → (≥1) text.delta → turn.completed → response.done
     *
     * Verifies:
     *   a) Content-Type: text/event-stream
     *   b) turn.created event present and first
     *   c) At least one text.delta event
     *   d) turn.completed event present
     *   e) response.done event present and last
     */
    mockValidToken(USER_OID);

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${MOCK_BEARER}`)
      .set('Accept', 'text/event-stream')
      .send(CANNED_INTAKE)
      .buffer(true)
      .parse((res, fn) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => fn(null, data));
      });

    // (a) SSE content type
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    // Parse events from SSE body
    const events = parseSSEEvents(res.text ?? (res.body as string));
    const eventNames = events.map(e => e.event);

    // (b) turn.created is first meaningful event
    expect(eventNames[0]).toBe('turn.created');

    // (c) At least one text.delta
    expect(eventNames).toContain('text.delta');

    // (d) turn.completed present
    expect(eventNames).toContain('turn.completed');

    // (e) response.done is last
    expect(eventNames[eventNames.length - 1]).toBe('response.done');

    // (f) turn.created → ... → turn.completed → response.done ordering
    const turnCreatedIdx = eventNames.indexOf('turn.created');
    const turnCompletedIdx = eventNames.lastIndexOf('turn.completed');
    const responseDoneIdx = eventNames.lastIndexOf('response.done');
    expect(turnCreatedIdx).toBeLessThan(turnCompletedIdx);
    expect(turnCompletedIdx).toBeLessThan(responseDoneIdx);
  });
});

// ---------------------------------------------------------------------------
// SUITE 2 — Non-streaming fallback
// ---------------------------------------------------------------------------

describe('SSE Streaming — POST /v1/responses without Accept header (batched fallback)', () => {
  let sessionStore: InMemorySessionStore;
  let requestStore: InMemoryRequestStore;
  let app: Application;

  beforeEach(() => {
    process.env.ADVISOR_DEMO_MODE = 'false';
    sessionStore = new InMemorySessionStore();
    requestStore = new InMemoryRequestStore();
    app = createTestApp(sessionStore, requestStore);
    mockChatCreate.mockResolvedValue(PRESET_NON_STREAMING);
  });

  afterEach(() => {
    sessionStore.clear(); requestStore.clear(); vi.resetAllMocks();
    process.env.ADVISOR_DEMO_MODE = 'false';
  });

  it('Test 2 [SSE]: no Accept header → returns batched JSON (M1 behaviour unchanged)', async () => {
    /**
     * Client sends no Accept header (or application/json).
     * Must return the Hosted Agent Responses protocol JSON shape — same as M1.
     *
     * Verifies:
     *   a) HTTP 200
     *   b) Content-Type: application/json
     *   c) { object: 'response', status: 'completed', output: [...] }
     *   d) output[0].content[0].text is non-empty
     */
    mockValidToken(USER_OID);

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${MOCK_BEARER}`)
      .send(CANNED_INTAKE);

    // (a) HTTP 200
    expect(res.status).toBe(200);

    // (b) application/json
    expect(res.headers['content-type']).toMatch(/application\/json/);

    // (c) Hosted Agent Responses shape
    expect(res.body).toMatchObject({ object: 'response', status: 'completed' });
    expect(Array.isArray(res.body.output)).toBe(true);

    // (d) Non-empty text
    const text: string = res.body.output[0]?.content[0]?.text;
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SUITE 3 — Error mid-stream
// ---------------------------------------------------------------------------

describe('SSE Streaming — error mid-stream emits error event and closes', () => {
  let sessionStore: InMemorySessionStore;
  let requestStore: InMemoryRequestStore;
  let app: Application;

  beforeEach(() => {
    process.env.ADVISOR_DEMO_MODE = 'false';
    sessionStore = new InMemorySessionStore();
    requestStore = new InMemoryRequestStore();
    app = createTestApp(sessionStore, requestStore);
    // Model throws — simulates Azure OpenAI outage mid-stream
    mockChatCreate.mockRejectedValue(new Error('AOAI service unavailable'));
  });

  afterEach(() => {
    sessionStore.clear(); requestStore.clear(); vi.resetAllMocks();
    process.env.ADVISOR_DEMO_MODE = 'false';
  });

  it('Test 3 [SSE]: model throws mid-stream → emits error event, no half-broken response', async () => {
    /**
     * Client requests SSE streaming.  The model call throws during the reasoning loop.
     * The adapter must:
     *   a) Still return Content-Type: text/event-stream (headers already flushed)
     *   b) Emit an `error` event with code and message
     *   c) Close the stream gracefully (no uncaught exception)
     *   d) NOT emit turn.completed or response.done after the error
     */
    mockValidToken(USER_OID);

    const res = await supertest(app)
      .post('/v1/responses')
      .set('Authorization', `Bearer ${MOCK_BEARER}`)
      .set('Accept', 'text/event-stream')
      .send(CANNED_INTAKE)
      .buffer(true)
      .parse((res, fn) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => fn(null, data));
      });

    // (a) SSE content type — headers were flushed before model call
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSSEEvents(res.text ?? (res.body as string));
    const eventNames = events.map(e => e.event);

    // (b) error event emitted
    expect(eventNames).toContain('error');

    // (c) No response.done after the error
    const errorIdx = eventNames.indexOf('error');
    const doneIdx = eventNames.indexOf('response.done');
    // response.done should not appear after an error
    expect(doneIdx === -1 || doneIdx < errorIdx).toBe(true);

    // (d) Error event has code and message
    const errorEvent = events.find(e => e.event === 'error');
    expect(errorEvent?.data).toHaveProperty('code');
    expect(errorEvent?.data).toHaveProperty('message');
  });
});

// ---------------------------------------------------------------------------
// SUITE 4/5/6 — Admin org-context version API
// ---------------------------------------------------------------------------

describe('Admin org-context version API (FR-024, M2)', () => {
  let sessionStore: InMemorySessionStore;
  let requestStore: InMemoryRequestStore;
  let orgContextStore: InMemoryOrgContextVersionStore;
  let app: Application;

  beforeEach(() => {
    process.env.ADVISOR_DEMO_MODE = 'false';
    sessionStore = new InMemorySessionStore();
    requestStore = new InMemoryRequestStore();
    orgContextStore = new InMemoryOrgContextVersionStore();
    app = createTestApp(sessionStore, requestStore, orgContextStore);
  });

  afterEach(() => {
    sessionStore.clear(); requestStore.clear(); orgContextStore.clear(); vi.resetAllMocks();
    process.env.ADVISOR_DEMO_MODE = 'false';
  });

  it('Test 4 [Admin]: POST /admin/org-context/versions → 201 draft version with published=false', async () => {
    mockValidToken(ADMIN_OID, ['AdvisorAdmin']);

    const res = await supertest(app)
      .post('/admin/org-context/versions')
      .set('Authorization', `Bearer ${MOCK_BEARER}`)
      .send(SEED_ORG_CONTEXT);

    expect(res.status).toBe(201);
    expect(res.body.published).toBe(false);
    expect(res.body.version).toBe(1);
    expect(res.body.id).toBeTruthy();
    expect(res.body.content).toBeDefined();
  });

  it('Test 5 [Admin]: GET /admin/org-context/versions → lists all versions desc', async () => {
    // Seed two versions
    await orgContextStore.createDraft(SEED_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });
    await orgContextStore.createDraft(SEED_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });

    mockValidToken(ADMIN_OID, ['AdvisorAdmin']);

    const res = await supertest(app)
      .get('/admin/org-context/versions')
      .set('Authorization', `Bearer ${MOCK_BEARER}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.versions)).toBe(true);
    expect(res.body.versions).toHaveLength(2);
    // Ordered desc by version
    expect(res.body.versions[0].version).toBeGreaterThanOrEqual(res.body.versions[1].version);
  });

  it('Test 6 [Admin]: POST /admin/org-context/versions/:id/publish → marks version published=true, others false', async () => {
    // Create two drafts
    const v1 = await orgContextStore.createDraft(SEED_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });
    const v2 = await orgContextStore.createDraft(SEED_ORG_CONTEXT, { oid: ADMIN_OID, name: 'Admin' });
    // First publish v1
    await orgContextStore.publish(v1.id);

    mockValidToken(ADMIN_OID, ['AdvisorAdmin']);

    // Now publish v2 via API
    const res = await supertest(app)
      .post(`/admin/org-context/versions/${v2.id}/publish`)
      .set('Authorization', `Bearer ${MOCK_BEARER}`);

    expect(res.status).toBe(200);
    expect(res.body.published).toBe(true);
    expect(res.body.id).toBe(v2.id);

    // v1 must now be unpublished
    const allVersions = await orgContextStore.listAll();
    const v1Updated = allVersions.find(v => v.id === v1.id);
    expect(v1Updated?.published).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SSE event parser helper
// ---------------------------------------------------------------------------

function parseSSEEvents(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  if (!body) return events;
  const blocks = body.split('\n\n').filter(b => b.trim() && !b.trim().startsWith(':'));
  for (const block of blocks) {
    const lines = block.split('\n');
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data = line.slice(6).trim();
    }
    if (data) {
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {
        events.push({ event, data: { raw: data } });
      }
    }
  }
  return events;
}
