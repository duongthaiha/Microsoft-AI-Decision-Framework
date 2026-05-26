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
 *   PORT                  — HTTP port (default: 8080)
 *   COSMOS_ENDPOINT       — Cosmos DB account endpoint URL
 *   SEARCH_ENDPOINT       — Azure AI Search endpoint URL
 *   ADVISOR_LOCAL_DEV     — 'true' enables DefaultAzureCredential fallback
 *   ADVISOR_DEMO_MODE     — 'true' disables Entra sign-in for demo environments
 *
 * Microsoft Learn — Foundry Hosted Agent runtime:
 * https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents
 */

import express from "express";
import { createResponsesAdapter } from "./adapter/responses.js";
import { createAdminRouter } from "./admin/admin-api.js";
import { CosmosSessionStore } from "./data/session-store.js";
import { CosmosRequestStore } from "./data/request-store.js";

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Dependency stubs (M1 will inject real stores with a live CosmosClient)
// ---------------------------------------------------------------------------
const sessionStore = new CosmosSessionStore();
const requestStore = new CosmosRequestStore();

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------
app.use("/", createResponsesAdapter({ sessionStore, requestStore }));
app.use("/admin", createAdminRouter());

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const port = parseInt(process.env.PORT ?? "8080", 10);

app.listen(port, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Advisor Agent — M0 scaffold");
  console.log(`  Listening on http://0.0.0.0:${port}`);
  console.log(`  Demo mode  : ${process.env.ADVISOR_DEMO_MODE === "true" ? "ON" : "OFF"}`);
  console.log(`  Local dev  : ${process.env.ADVISOR_LOCAL_DEV === "true" ? "ON" : "OFF"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

export { app };
