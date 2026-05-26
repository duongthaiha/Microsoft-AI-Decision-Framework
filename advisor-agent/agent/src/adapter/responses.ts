/**
 * Hosted Agent Responses protocol adapter.
 *
 * This module wires the advisor's framework logic to the Microsoft Foundry
 * Agent Service Responses protocol.  Think of it as the translation layer
 * between "Foundry knows how to host agents" and "AOAI client knows how to
 * run this advisor's reasoning loop."
 *
 * Hosted Agent Responses protocol:
 * https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents
 *
 * spec §3 line 113 — start with Responses for conversational flow.
 * FR-003 — host as a Microsoft Foundry Hosted Agent (Preview).
 * FR-004 — expose a Hosted Agent-compatible protocol endpoint.
 */

import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import type { ISessionStore } from "../data/session-store.js";
import type { IRequestStore } from "../data/request-store.js";
import type { IProjectSearch } from "../search/project-index.js";
import { runAdvisorLoop } from "../framework/advisor-loop.js";
import type { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { resolveCallerId } from "../auth/identity.js";
import type { OrgContext } from "../data/models.js";

// ---------------------------------------------------------------------------
// Dependency injection shape
// ---------------------------------------------------------------------------

export interface ResponsesAdapterDeps {
  sessionStore: ISessionStore;
  requestStore: IRequestStore;
  projectSearch: IProjectSearch | null;
  aoaiClient: AzureOpenAI | null;
  aoaiDeployment: string;
  getOrgCtx: () => Promise<OrgContext | null>;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Creates the Express router that implements the Hosted Agent Responses protocol
 * plus session management endpoints.
 */
export function createResponsesAdapter(deps: ResponsesAdapterDeps): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // Health check — live so the container passes Hosted Agent validation.
  // -------------------------------------------------------------------------
  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "advisor-agent", version: "0.1.0" });
  });

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  router.post("/sessions", async (req: Request, res: Response) => {
    try {
      const { ownerId } = resolveCallerId(req);
      const { title } = req.body ?? {};
      const session = await deps.sessionStore.createSession(ownerId, title ?? "New Session");
      res.status(201).json(session);
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get("/sessions", async (req: Request, res: Response) => {
    try {
      const { ownerId } = resolveCallerId(req);
      const sessions = await deps.sessionStore.listSessions(ownerId);
      res.json({ sessions });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get("/sessions/:id", async (req: Request, res: Response) => {
    try {
      const { ownerId } = resolveCallerId(req);
      const session = await deps.sessionStore.getSession(ownerId, req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (err) {
      handleError(err, res);
    }
  });

  // -------------------------------------------------------------------------
  // Responses protocol endpoint — main advisor entry point.
  // FR-004, FR-007, FR-009, FR-010, FR-011, FR-013
  // -------------------------------------------------------------------------

  router.post("/v1/responses", async (req: Request, res: Response) => {
    try {
      const { ownerId } = resolveCallerId(req);

      if (!deps.aoaiClient) {
        return res.status(503).json({
          error: "Advisor reasoning loop not available — AOAI_ENDPOINT not configured.",
        });
      }

      const body = req.body ?? {};
      const intake = body.input ?? body;
      const { sessionId: incomingSessionId, title: bodyTitle } = body;

      // Resolve or create session
      let sessionId = incomingSessionId as string | undefined;
      if (!sessionId) {
        const title = bodyTitle ?? intake.title ?? intake.businessOutcome?.slice(0, 60) ?? "New Session";
        const newSession = await deps.sessionStore.createSession(ownerId, title);
        sessionId = newSession.sessionId;
      } else {
        const existing = await deps.sessionStore.getSession(ownerId, sessionId);
        if (!existing) {
          return res.status(404).json({ error: "Session not found or not owned by caller." });
        }
      }

      // Persist user turn
      const userTurnId = randomUUID();
      await deps.sessionStore.appendTurn(ownerId, sessionId, {
        turnId: userTurnId,
        role: "user",
        content: JSON.stringify(intake),
        timestamp: new Date().toISOString(),
      });

      // Load org context
      const orgCtx = await deps.getOrgCtx();

      // Run advisor reasoning loop — wrap separately so failures return 502
      let loopResult;
      try {
        loopResult = await runAdvisorLoop(
          {
            businessOutcome: intake.businessOutcome ?? "",
            targetUsers: intake.targetUsers ?? "",
            desiredBehavior: intake.desiredBehavior ?? "",
            dataSources: Array.isArray(intake.dataSources) ? intake.dataSources.join(", ") : intake.dataSources,
            actions: Array.isArray(intake.actions) ? intake.actions.join(", ") : intake.actions,
            constraints: Array.isArray(intake.constraints) ? intake.constraints.join(", ") : intake.constraints,
          },
          [] as ChatCompletionMessageParam[],
          {
            aoaiClient: deps.aoaiClient,
            deployment: deps.aoaiDeployment,
            projectSearch: deps.projectSearch,
            orgCtx,
          }
        );
      } catch (modelErr) {
        console.error("[responses-adapter] error:", modelErr);
        return res.status(502).json({
          error: "advisor_unavailable",
          reason: (modelErr as Error).message ?? "Model call failed",
        });
      }

      // Persist request record AFTER model succeeds (transactional — no orphaned drafts on failure)
      let requestRecord = await findOpenRequest(deps.requestStore, ownerId, sessionId);
      if (!requestRecord) {
        requestRecord = await deps.requestStore.createRequest(ownerId, sessionId, intake.title ?? intake.businessOutcome?.slice(0, 60) ?? "Request");
      }

      // Patch intake fields and framework results onto request
      const patch: Parameters<typeof deps.requestStore.updateRequest>[2] = {
        title: intake.title ?? requestRecord.title,
        businessOutcome: intake.businessOutcome ?? requestRecord.businessOutcome,
        targetUsers: intake.targetUsers ?? requestRecord.targetUsers,
        desiredBehavior: intake.desiredBehavior ?? requestRecord.desiredBehavior,
        dataSources: Array.isArray(intake.dataSources) ? intake.dataSources.join(", ") : (intake.dataSources ?? requestRecord.dataSources),
        actions: Array.isArray(intake.actions) ? intake.actions.join(", ") : (intake.actions ?? requestRecord.actions),
        constraints: Array.isArray(intake.constraints) ? intake.constraints.join(", ") : (intake.constraints ?? requestRecord.constraints),
        status: loopResult.readinessBrief ? "ReadyForConfirmation" : "Draft",
        updatedAt: new Date().toISOString(),
        orgContextVersion: loopResult.orgContextVersion,
      };
      if (loopResult.searchMatches) patch.similarProjectMatches = loopResult.searchMatches;
      if (loopResult.reuseDecision) patch.reuseDecision = loopResult.reuseDecision;
      if (loopResult.readinessBrief) patch.readinessBrief = loopResult.readinessBrief;

      const updatedRequest = await deps.requestStore.updateRequest(ownerId, requestRecord.requestId, patch);

      // Persist assistant turn
      const assistantTurnId = randomUUID();
      await deps.sessionStore.appendTurn(ownerId, sessionId, {
        turnId: assistantTurnId,
        role: "assistant",
        content: loopResult.assistantText,
        timestamp: new Date().toISOString(),
      });

      // Return Hosted Agent Responses protocol shape
      const responseId = `resp_${randomUUID().replace(/-/g, "")}`;
      res.json({
        id: responseId,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        sessionId,
        requestId: updatedRequest.requestId,
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: loopResult.assistantText,
              },
            ],
          },
        ],
        metadata: {
          bxtScore: loopResult.bxtScore ?? null,
          reuseDecision: loopResult.reuseDecision ?? null,
          readinessBrief: loopResult.readinessBrief ?? null,
          orgContextVersion: loopResult.orgContextVersion,
        },
      });
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findOpenRequest(
  requestStore: IRequestStore,
  ownerId: string,
  sessionId: string
) {
  try {
    const requests = await requestStore.listMyRequests(ownerId);
    return requests.find((r) => r.sessionId === sessionId && r.status === "Draft") ?? null;
  } catch {
    return null;
  }
}

function handleError(err: unknown, res: Response) {
  console.error("[responses-adapter] error:", err);
  const code = (err as { code?: number }).code;
  if (code === 404) {
    return res.status(404).json({ error: "Not found" });
  }
  // 502 Bad Gateway for upstream model/AOAI call failures
  const errMsg = (err as Error).message ?? "";
  const isModelError =
    errMsg.includes("openai") ||
    errMsg.includes("AOAI") ||
    errMsg.includes("Azure") ||
    errMsg.includes("cognitiveservices") ||
    errMsg.includes("Service unavailable") ||
    errMsg.includes("timeout") ||
    errMsg.includes("rate limit") ||
    (err as { status?: number }).status === 429 ||
    (err as { status?: number }).status === 503;
  if (isModelError) {
    return res.status(502).json({ error: "advisor_unavailable", reason: errMsg });
  }
  res.status(500).json({ error: "Internal server error" });
}
