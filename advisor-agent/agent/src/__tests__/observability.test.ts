/**
 * Observability unit tests.
 *
 * Sanity-check that the request-context middleware:
 *  1. Attaches a unique `requestId` UUID to every inbound request.
 *  2. Sets an `X-Request-Id` response header matching that UUID.
 *  3. Assigns distinct IDs to concurrent requests.
 *
 * We do NOT mock App Insights end-to-end — the OTel SDK auto-instrumentation
 * is trusted for distributed trace stitching.  These tests cover the additive
 * middleware contract only.
 *
 * Acceptance criteria: middleware is transparent (passes requests through),
 * deterministic (always sets a header), and non-colliding (unique per request).
 */

import { describe, it, expect } from "vitest";
import express from "express";
import supertest from "supertest";
import { requestContextMiddleware } from "../middleware/request-context.js";

// ---------------------------------------------------------------------------
// Helper — minimal Express app with the middleware under test
// ---------------------------------------------------------------------------

function makeApp() {
  const app = express();
  app.use(requestContextMiddleware);
  app.get("/ping", (req, res) => {
    res.json({ ok: true, requestId: req.requestId });
  });
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requestContextMiddleware (observability)", () => {
  it("Test 1 [OBSERVABILITY]: sets X-Request-Id header on every response", async () => {
    const app = makeApp();
    const res = await supertest(app).get("/ping");

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeDefined();
    // UUID v4 pattern
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("Test 2 [OBSERVABILITY]: attaches requestId to req object accessible in handlers", async () => {
    const app = makeApp();
    const res = await supertest(app).get("/ping");

    expect(res.status).toBe(200);
    expect(res.body.requestId).toBeDefined();
    expect(res.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("Test 3 [OBSERVABILITY]: X-Request-Id header matches req.requestId in handler", async () => {
    const app = makeApp();
    const res = await supertest(app).get("/ping");

    expect(res.headers["x-request-id"]).toBe(res.body.requestId);
  });

  it("Test 4 [OBSERVABILITY]: assigns unique requestId per concurrent request (no collision)", async () => {
    const app = makeApp();
    const requests = await Promise.all(
      Array.from({ length: 10 }, () => supertest(app).get("/ping"))
    );
    const ids = requests.map((r) => r.headers["x-request-id"] as string);
    const unique = new Set(ids);

    expect(unique.size).toBe(10);
  });
});
