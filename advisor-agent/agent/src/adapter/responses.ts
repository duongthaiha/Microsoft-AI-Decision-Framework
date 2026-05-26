/**
 * Hosted Agent Responses protocol adapter.
 *
 * This module wires the advisor's framework logic to the Microsoft Foundry
 * Agent Service Responses protocol.  Think of it as the translation layer
 * between "Foundry knows how to host agents" and "Copilot SDK knows how to
 * run this advisor's reasoning loop."
 *
 * Hosted Agent Responses protocol:
 * https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents
 *
 * spec §3 line 113 — start with Responses for conversational flow.
 * FR-003 — host as a Microsoft Foundry Hosted Agent (Preview).
 * FR-004 — expose a Hosted Agent-compatible protocol endpoint.
 */

import { Router, type Request, type Response } from "express";
import type { ISessionStore } from "../data/session-store.js";
import type { IRequestStore } from "../data/request-store.js";

// ---------------------------------------------------------------------------
// Dependency injection shape
// ---------------------------------------------------------------------------

export interface ResponsesAdapterDeps {
  sessionStore: ISessionStore;
  requestStore: IRequestStore;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Creates the Express router that implements the Hosted Agent Responses protocol
 * plus session management endpoints.
 *
 * All route handlers are stubs returning 501 except GET /health, which is live
 * so the Foundry runtime can validate the container.
 */
export function createResponsesAdapter(deps: ResponsesAdapterDeps): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // Health check — live in M0 so the container passes Hosted Agent validation.
  // -------------------------------------------------------------------------
  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "advisor-agent", version: "0.0.1" });
  });

  // -------------------------------------------------------------------------
  // Responses protocol endpoint.
  // -------------------------------------------------------------------------

  /**
   * POST /v1/responses
   * Entry point for Hosted Agent Responses protocol turns.
   *
   * M1 will:
   *   1. Validate the JWT and resolve caller identity (resolveCallerId).
   *   2. Load or create the Copilot SDK session for this conversation.
   *   3. Route the turn through the framework flow (intake → BXT → reuse → Phase 2 → Phase 3).
   *   4. Return a streamed or batched Responses protocol response.
   */
  router.post("/v1/responses", (_req: Request, res: Response) => {
    // M1: wire Copilot SDK session, framework flow, and Responses protocol streaming.
    res.status(501).json({ error: "Not implemented — M1 will wire the Copilot SDK session." });
  });

  // -------------------------------------------------------------------------
  // Session management endpoints.
  // -------------------------------------------------------------------------

  /**
   * GET /sessions
   * Returns the list of sessions owned by the caller.
   *
   * M1 will resolve caller identity and call deps.sessionStore.listSessions(ownerId).
   */
  router.get("/sessions", (_req: Request, res: Response) => {
    // M1: resolveCallerId(req) → sessionStore.listSessions(ownerId)
    res.status(501).json({ error: "Not implemented — M1 will implement session listing." });
  });

  /**
   * POST /sessions
   * Creates a new session for the caller.
   *
   * M1 will resolve caller identity and call deps.sessionStore.createSession(ownerId, title).
   */
  router.post("/sessions", (_req: Request, res: Response) => {
    // M1: resolveCallerId(req) → sessionStore.createSession(ownerId, title)
    res.status(501).json({ error: "Not implemented — M1 will implement session creation." });
  });

  return router;
}
