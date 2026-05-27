/**
 * AI Project Advisor Agent — entry point.
 *
 * Bootstraps the Express app, mounts the Responses adapter and admin API,
 * and starts listening on PORT (default 8080).
 *
 * Configuration is read entirely from environment variables — no config files
 * so secrets never land on disk.
 *
 * Environment variables:
 *   PORT                    — HTTP port (default: 8080)
 *   COSMOS_ENDPOINT         — Cosmos DB account endpoint URL
 *   SEARCH_ENDPOINT         — Azure AI Search endpoint URL
 *   AOAI_ENDPOINT           — Azure OpenAI endpoint URL
 *   AOAI_MODEL_DEPLOYMENT   — GPT model deployment name (default: gpt-4.1-mini)
 *   ADVISOR_LOCAL_DEV       — 'true' enables DefaultAzureCredential fallback
 *   ADVISOR_DEMO_MODE       — 'true' disables Entra sign-in for demo environments
 *   ENTRA_TENANT_ID         — Entra tenant ID (default: cdfe81b5-821e-4f07-9ea7-516efc8497e4)
 *   ENTRA_API_AUDIENCE      — Full api:// audience URI (default: api://4f4f4a4d-e60f-4b86-a681-86059aae4597)
 *   ADVISOR_ALLOWED_ORIGINS — Comma-separated CORS allowlist (default: SWA origin + localhost:5173)
 *
 * Microsoft Learn — Foundry Hosted Agent runtime:
 * https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents
 */

// Bootstrap Azure Monitor OTel distro FIRST — auto-instrumentation must be
// registered before Express, Cosmos, fetch, or any instrumented import.
// Guard is inside initTelemetry so this is safe in local dev (no-op without
// APPLICATIONINSIGHTS_CONNECTION_STRING).
import { initTelemetry } from "./telemetry/otel.js";
initTelemetry();

import express from "express";
import cors from "cors";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createResponsesAdapter } from "./adapter/responses.js";
import { createAdminRouter } from "./admin/admin-api.js";
import { CosmosSessionStore } from "./data/session-store.js";
import { CosmosRequestStore } from "./data/request-store.js";
import { CosmosOrgContextVersionStore, createNoopOrgContextVersionStore } from "./data/org-context-store.js";
import { createCosmosClient } from "./data/cosmos-client.js";
import { AzureProjectSearch } from "./search/project-index.js";
import { createAoaiClient } from "./framework/advisor-loop.js";
import { getModelCredential } from "./auth/identity.js";
import { jwtMiddleware, decodeTokenClaims } from "./auth/jwt-middleware.js";
import { requestContextMiddleware } from "./middleware/request-context.js";
import type { OrgContext, OrgContextVersion } from "./data/models.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Per-request context: assigns requestId + structured log on finish.
// Mount after body parser so body is available, before CORS and JWT.
app.use(requestContextMiddleware);

// ---------------------------------------------------------------------------
// CORS — MUST be mounted BEFORE jwtMiddleware.
// Browsers send OPTIONS preflight without Authorization; the JWT middleware
// must never see those requests or it returns 401, blocking the SPA entirely.
// ADVISOR_ALLOWED_ORIGINS is a comma-separated allowlist injected at deploy time.
// ---------------------------------------------------------------------------
const DEFAULT_ORIGINS = [
  "https://polite-mushroom-0a09fa803.7.azurestaticapps.net",
  "http://localhost:5173",
];
const allowedOrigins: string[] = (process.env.ADVISOR_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const corsOrigins = allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ORIGINS;

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
}));

// ---------------------------------------------------------------------------
// Live dependency wiring
// ---------------------------------------------------------------------------

const credential = getModelCredential();

// Cosmos DB — createIfNotExists is called on first use (idempotent)
const cosmosEndpoint = process.env.COSMOS_ENDPOINT ?? "";
let sessionStore: CosmosSessionStore | null = null;
let requestStore: CosmosRequestStore | null = null;
let orgContextStore = createNoopOrgContextVersionStore();

if (cosmosEndpoint) {
  const cosmosClient = createCosmosClient(cosmosEndpoint, credential);
  sessionStore = new CosmosSessionStore(cosmosClient);
  requestStore = new CosmosRequestStore(cosmosClient);
  orgContextStore = new CosmosOrgContextVersionStore(cosmosClient);
  console.log("  Cosmos DB   : wired ✓", cosmosEndpoint);
} else {
  console.warn("  Cosmos DB   : COSMOS_ENDPOINT not set — sessions/requests disabled");
}

// Load the seed org context from disk (used as fallback and for seeding)
let seedOrgContext: OrgContext | null = null;
const seedPath = join(__dirname, "../../../data/org-context-default.json");
if (existsSync(seedPath)) {
  try {
    seedOrgContext = JSON.parse(readFileSync(seedPath, "utf-8")) as OrgContext;
  } catch {
    // seed file is optional
  }
}

// Seed Cosmos on first boot — if org_contexts container is empty, write version 1 as published.
if (cosmosEndpoint && seedOrgContext) {
  orgContextStore.listAll().then(async (versions) => {
    if (versions.length === 0 && seedOrgContext) {
      console.log("  Org Context : seeding version 1 from org-context-default.json");
      try {
        const draft = await orgContextStore.createDraft(seedOrgContext, { oid: "system", name: "Boot Seed" });
        await orgContextStore.publish(draft.id);
        console.log("  Org Context : version 1 published ✓");
      } catch (err) {
        console.warn("  Org Context : seed failed —", (err as Error).message);
      }
    }
  }).catch((err) => {
    console.warn("  Org Context : seed check failed —", (err as Error).message);
  });
}

// Azure AI Search
const searchEndpoint = process.env.SEARCH_ENDPOINT ?? "";
let projectSearch: AzureProjectSearch | null = null;

if (searchEndpoint) {
  projectSearch = new AzureProjectSearch(searchEndpoint, credential);
  console.log("  AI Search   : wired ✓", searchEndpoint);
} else {
  console.warn("  AI Search   : SEARCH_ENDPOINT not set — reuse gate disabled");
}

// Azure OpenAI
let aoaiClient = null;
const aoaiEndpoint = process.env.AOAI_ENDPOINT ?? "";
const aoaiDeployment = process.env.AOAI_MODEL_DEPLOYMENT ?? "gpt-4.1-mini";

if (aoaiEndpoint) {
  try {
    aoaiClient = createAoaiClient(credential);
    console.log("  AOAI        : wired ✓", aoaiEndpoint, "/", aoaiDeployment);
  } catch (err) {
    console.warn("  AOAI        : failed to initialise —", (err as Error).message);
  }
} else {
  console.warn("  AOAI        : AOAI_ENDPOINT not set — reasoning loop disabled");
}

// Org Context loader — reads from Cosmos if available, else from seed file.
// Short TTL cache (60s) reduces Cosmos RUs for every reasoning turn.
// A fresh publish takes effect within one TTL window — acceptable for admin ops.
const ORG_CTX_CACHE_TTL_MS = 60_000;
let orgCtxCache: { value: OrgContext | null; expiresAt: number } | null = null;

async function getOrgCtx(): Promise<OrgContext | null> {
  const now = Date.now();
  if (orgCtxCache && now < orgCtxCache.expiresAt) {
    return orgCtxCache.value;
  }
  try {
    const published: OrgContextVersion | null = await orgContextStore.getPublished();
    const value = published ? published.content : seedOrgContext;
    orgCtxCache = { value, expiresAt: now + ORG_CTX_CACHE_TTL_MS };
    return value;
  } catch {
    // Fall through to seed on Cosmos error; do not cache failures
    return seedOrgContext;
  }
}

// Null-safe stores (in case Cosmos is not configured)
const safeSessionStore = sessionStore ?? createNoopSessionStore();
const safeRequestStore = requestStore ?? createNoopRequestStore();

// ---------------------------------------------------------------------------
// Diagnostic endpoint — public (no JWT guard), decodes token without verifying.
// Registered BEFORE jwtMiddleware so it is reachable without a valid token.
// Ha: hit GET /v1/whoami with Authorization: Bearer <your-token> from the browser
// or DevTools to see exactly what iss/aud/scp/ver claims Entra put in your token.
// ---------------------------------------------------------------------------
app.get("/v1/whoami", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(400).json({ error: "provide Authorization: Bearer <token>" });
    return;
  }
  const decoded = decodeTokenClaims(authHeader.slice(7));
  if (!decoded) {
    res.status(400).json({ error: "token not parseable" });
    return;
  }
  res.json(decoded);
});

// ---------------------------------------------------------------------------
// JWT protection — applied before protected routers.
// /health remains unauthenticated (liveness/readiness probe).
// ---------------------------------------------------------------------------
app.use(["/v1", "/sessions", "/admin"], jwtMiddleware);

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------
app.use("/", createResponsesAdapter({
  sessionStore: safeSessionStore,
  requestStore: safeRequestStore,
  projectSearch,
  aoaiClient,
  aoaiDeployment,
  getOrgCtx,
}));
app.use("/admin", createAdminRouter({ orgContextStore, seedOrgContext }));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const port = parseInt(process.env.PORT ?? "8080", 10);

app.listen(port, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Advisor Agent — M1 reasoning loop");
  console.log(`  Listening on http://0.0.0.0:${port}`);
  console.log(`  Demo mode  : ${process.env.ADVISOR_DEMO_MODE === "true" ? "ON" : "OFF"}`);
  console.log(`  Local dev  : ${process.env.ADVISOR_LOCAL_DEV === "true" ? "ON" : "OFF"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

export { app };

// ---------------------------------------------------------------------------
// No-op stores for environments without Cosmos configured (e.g. local tests)
// ---------------------------------------------------------------------------

function createNoopSessionStore() {
  const err = () => { throw Object.assign(new Error("COSMOS_ENDPOINT not configured"), { code: 503 }); };
  return {
    createSession: err, getSession: err, listSessions: err,
    renameSession: err, deleteSession: err, appendTurn: err,
  } as unknown as CosmosSessionStore;
}

function createNoopRequestStore() {
  const err = () => { throw Object.assign(new Error("COSMOS_ENDPOINT not configured"), { code: 503 }); };
  return {
    createRequest: err, getRequest: err, updateRequest: err,
    setStatusNew: err, listMyRequests: err, listAllRequestsAdmin: err,
  } as unknown as CosmosRequestStore;
}
