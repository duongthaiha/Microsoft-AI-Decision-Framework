/**
 * Dual-issuer + dual-audience JWT acceptance tests.
 *
 * Verifies that jwtMiddleware accepts tokens from BOTH Microsoft Entra v1 and v2
 * issuers, AND tokens with either the api:// audience URI or the bare GUID audience.
 *
 * Issuer patterns (`.squad/skills/dual-issuer-jwt-validation/SKILL.md`):
 *   v2 issuer: https://login.microsoftonline.com/{tenantId}/v2.0
 *   v1 issuer: https://sts.windows.net/{tenantId}/
 *
 * Audience patterns:
 *   api:// form:  api://4f4f4a4d-e60f-4b86-a681-86059aae4597
 *   bare GUID:    4f4f4a4d-e60f-4b86-a681-86059aae4597
 *
 * The bare GUID audience is issued by Entra when the Application ID URI has not
 * been set to the api:// prefix form in the app registration manifest.  Both map
 * to the same app registration; accepting both removes the class of breakage where
 * the Entra portal default leaves the URI as the raw GUID.
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
const AUDIENCE_URI = "api://4f4f4a4d-e60f-4b86-a681-86059aae4597";
const AUDIENCE_GUID = "4f4f4a4d-e60f-4b86-a681-86059aae4597";
const V2_ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const V1_ISSUER = `https://sts.windows.net/${TENANT_ID}/`;

// Keep the old alias so existing tests compile without changes.
const AUDIENCE = AUDIENCE_URI;

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

function makePayload(issuer: string, audience: string = AUDIENCE) {
  return {
    payload: {
      oid: "test-user-oid-001",
      iss: issuer,
      aud: audience,
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

describe("Dual-audience JWT acceptance", () => {
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

  it("accepts a token with api:// audience URI", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makePayload(V2_ISSUER, AUDIENCE_URI) as any
    );

    const res = await supertest(app)
      .get("/sessions")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`);

    expect(res.status).not.toBe(401);
  });

  it("accepts a token with bare GUID audience (Entra default when App ID URI not set)", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makePayload(V2_ISSUER, AUDIENCE_GUID) as any
    );

    const res = await supertest(app)
      .get("/sessions")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`);

    expect(res.status).not.toBe(401);
  });

  it("passes BOTH accepted audiences to jose.jwtVerify", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makePayload(V2_ISSUER, AUDIENCE_GUID) as any
    );

    await supertest(app)
      .get("/sessions")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`);

    const callArgs = vi.mocked(jose.jwtVerify).mock.calls[0];
    const options = callArgs[2] as { audience?: string | string[] };
    expect(Array.isArray(options.audience)).toBe(true);
    const audiences = options.audience as string[];
    expect(audiences).toContain(AUDIENCE_URI);
    expect(audiences).toContain(AUDIENCE_GUID);
  });

  it("still rejects a token with an unrecognised audience", async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
      new Error('unexpected "aud" claim value')
    );

    const res = await supertest(app)
      .get("/sessions")
      .set("Authorization", `Bearer ${FAKE_TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });
});
