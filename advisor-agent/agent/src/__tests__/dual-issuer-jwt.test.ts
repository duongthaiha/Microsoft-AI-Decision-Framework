/**
 * Dual-issuer JWT acceptance tests.
 *
 * Verifies that jwtMiddleware accepts tokens from BOTH Microsoft Entra v1 and v2
 * issuers.  This is the defensive pattern described in
 * `.squad/skills/dual-issuer-jwt-validation/SKILL.md`.
 *
 * v2 issuer: https://login.microsoftonline.com/{tenantId}/v2.0
 * v1 issuer: https://sts.windows.net/{tenantId}/
 *
 * Both are legitimate Entra issuers.  v1 is issued when the app registration's
 * `requestedAccessTokenVersion` is null or 1; v2 when it is 2.  Accepting both
 * prevents a mis-configured registration from locking all users out.
 *
 * Spec refs: FR-014, FR-019
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import supertest from "supertest";
import express, { type Application } from "express";
import cors from "cors";
import * as jose from "jose";
import { jwtMiddleware } from "../auth/jwt-middleware.js";

vi.mock("jose");

const TENANT_ID = "cdfe81b5-821e-4f07-9ea7-516efc8497e4";
const AUDIENCE = "api://4f4f4a4d-e60f-4b86-a681-86059aae4597";
const V2_ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const V1_ISSUER = `https://sts.windows.net/${TENANT_ID}/`;

const FAKE_TOKEN = "header.payload.signature";
const SWA_ORIGIN = "https://polite-mushroom-0a09fa803.7.azurestaticapps.net";

function createTestApp(): Application {
  const app = express();
  app.use(express.json());
  app.use(
    cors({
      origin: SWA_ORIGIN,
      credentials: true,
      allowedHeaders: ["Authorization", "Content-Type"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  );
  app.use(["/sessions", "/v1"], jwtMiddleware);
  app.get("/sessions", (_req, res) => res.json({ sessions: [] }));
  return app;
}

function makePayload(issuer: string) {
  return {
    payload: {
      oid: "test-user-oid-001",
      iss: issuer,
      aud: AUDIENCE,
      scp: "access_as_user",
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: "Test User",
    },
    protectedHeader: { alg: "RS256" },
  };
}

describe("Dual-issuer JWT acceptance", () => {
  let app: Application;
  let savedDemoMode: string | undefined;

  beforeEach(() => {
    savedDemoMode = process.env.ADVISOR_DEMO_MODE;
    process.env.ADVISOR_DEMO_MODE = "false";
    vi.mocked(jose.createRemoteJWKSet).mockReturnValue({} as ReturnType<typeof jose.createRemoteJWKSet>);
    app = createTestApp();
  });

  afterEach(() => {
    process.env.ADVISOR_DEMO_MODE = savedDemoMode;
    vi.resetAllMocks();
  });

  it("accepts a v2 issuer token (https://login.microsoftonline.com/{tenantId}/v2.0)", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makePayload(V2_ISSUER) as any
    );

    const res = await supertest(app)
      .get("/sessions")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`);

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("accepts a v1 issuer token (https://sts.windows.net/{tenantId}/)", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makePayload(V1_ISSUER) as any
    );

    const res = await supertest(app)
      .get("/sessions")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`);

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("passes BOTH accepted issuers to jose.jwtVerify", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makePayload(V2_ISSUER) as any
    );

    await supertest(app)
      .get("/sessions")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`);

    const callArgs = vi.mocked(jose.jwtVerify).mock.calls[0];
    // Third arg is the options object — issuer must be an array containing both
    const options = callArgs[2] as { issuer?: string | string[] };
    expect(Array.isArray(options.issuer)).toBe(true);
    const issuers = options.issuer as string[];
    expect(issuers).toContain(V2_ISSUER);
    expect(issuers).toContain(V1_ISSUER);
  });

  it("still rejects a token with an unrecognised issuer", async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
      new Error('unexpected "iss" claim value')
    );

    const res = await supertest(app)
      .get("/sessions")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });
});
