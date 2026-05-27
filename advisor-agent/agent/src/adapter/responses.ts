/**
 * Hosted Agent Responses protocol adapter.
 *
 * This module wires the advisor's framework logic to the Microsoft Foundry
 * Agent Service Responses protocol.  Think of it as the translation layer
 * between "Foundry knows how to host agents" and "AOAI client knows how to
 * run this advisor's reasoning loop."
 *
 * M2 additions:
 * - SSE streaming via `Accept: text/event-stream` content negotiation.
 *   If the client sends that header, the route streams events as the advisor
 *   reasons.  Otherwise it returns batched JSON (M1 behaviour unchanged).
 *
 * SSE event sequence:
 *   turn.created → tool.invoked* → tool.result* → text.delta+ → turn.completed → response.done
 *   (or `error` if something goes wrong mid-stream, then close)
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
import * as appInsights from "applicationinsights";
import type { ISessionStore } from "../data/session-store.js";
import type { IRequestStore } from "../data/request-store.js";
import type { IProjectSearch } from "../search/project-index.js";
import { runAdvisorLoop } from "../framework/advisor-loop.js";
import type { SSELoopEvent } from "../framework/advisor-loop.js";
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
  //
  // M2: supports SSE streaming via Accept: text/event-stream.
  //     Non-streaming fallback preserves M1 batched JSON behaviour.
  // -------------------------------------------------------------------------

  router.post("/v1/responses", async (req: Request, res: Response) => {
    const wantsSSE = (req.headers.accept ?? "").includes("text/event-stream");
    if (wantsSSE) {
      await handleResponsesSSE(req, res, deps);
    } else {
      await handleResponsesBatch(req, res, deps);
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Batched JSON path (M1 behaviour — unchanged)
// ---------------------------------------------------------------------------

async function handleResponsesBatch(
  req: Request,
  res: Response,
  deps: ResponsesAdapterDeps
): Promise<void> {
    try {
      const { ownerId } = resolveCallerId(req);

      if (!deps.aoaiClient) {
        res.status(503).json({
          error: "Advisor reasoning loop not available — AOAI_ENDPOINT not configured.",
        });
        return;
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
          res.status(404).json({ error: "Session not found or not owned by caller." });
          return;
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
      const loopStartMs = Date.now();
      let loopResult;
      try {
        loopResult = await runAdvisorLoop(
          buildIntakeFields(intake),
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
        res.status(502).json({
          error: "advisor_unavailable",
          reason: (modelErr as Error).message ?? "Model call failed",
        });
        return;
      }

      // Persist request record AFTER model succeeds (transactional — no orphaned drafts on failure)
      const updatedRequest = await persistRequest(deps.requestStore, ownerId, sessionId, intake, loopResult);

      // Persist assistant turn
      const assistantTurnId = randomUUID();
      await deps.sessionStore.appendTurn(ownerId, sessionId, {
        turnId: assistantTurnId,
        role: "assistant",
        content: loopResult.assistantText,
        timestamp: new Date().toISOString(),
      });

      // Emit custom telemetry: one event per completed reasoning loop.
      appInsights.defaultClient?.trackEvent({
        name: "requestProcessed",
        properties: {
          requestId: updatedRequest.requestId,
          sessionId: sessionId as string,
          durationMs: String(Date.now() - loopStartMs),
          toolsInvoked: String(
            (loopResult.bxtScore ? 1 : 0) +
            (loopResult.searchMatches ? 1 : 0) +
            (loopResult.reuseDecision ? 1 : 0) +
            (loopResult.readinessBrief ? 1 : 0)
          ),
          finalGrouping: loopResult.readinessBrief?.recommendedPlatform.platformKey ?? "",
          finalTech: loopResult.readinessBrief?.recommendedPlatform.displayName ?? "",
        },
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
}

// ---------------------------------------------------------------------------
// SSE streaming path (M2)
// ---------------------------------------------------------------------------

/** Writes one SSE event frame to the response. */
function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Writes an SSE keepalive comment (prevents ACA idle-timeout disconnect). */
function sseKeepalive(res: Response): void {
  res.write(`: keepalive\n\n`);
}

async function handleResponsesSSE(
  req: Request,
  res: Response,
  deps: ResponsesAdapterDeps
): Promise<void> {
  // Set SSE headers before any await — headers must be sent before body.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Heartbeat every 15s — prevents ACA idle-timeout (30s default).
  const heartbeat = setInterval(() => sseKeepalive(res), 15_000);

  const endSSE = (): void => {
    clearInterval(heartbeat);
    res.end();
  };

  try {
    const { ownerId } = resolveCallerId(req);

    if (!deps.aoaiClient) {
      sseWrite(res, "error", { code: "no_aoai", message: "Advisor reasoning loop not available — AOAI_ENDPOINT not configured." });
      endSSE();
      return;
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
        sseWrite(res, "error", { code: "not_found", message: "Session not found or not owned by caller." });
        endSSE();
        return;
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

    const turnIndex = 0;
    const turnId = `turn_${randomUUID().replace(/-/g, "")}`;
    sseWrite(res, "turn.created", { id: turnId, turnIndex });

    // Load org context
    const orgCtx = await deps.getOrgCtx();

    // Run advisor reasoning loop with SSE event forwarding
    let loopResult;
    try {
      loopResult = await runAdvisorLoop(
        buildIntakeFields(intake),
        [] as ChatCompletionMessageParam[],
        {
          aoaiClient: deps.aoaiClient,
          deployment: deps.aoaiDeployment,
          projectSearch: deps.projectSearch,
          orgCtx,
          onEvent: (event: SSELoopEvent) => {
            sseWrite(res, event.event, event.data);
          },
        }
      );
    } catch (modelErr) {
      console.error("[responses-adapter] SSE model error:", modelErr);
      sseWrite(res, "error", {
        code: "advisor_unavailable",
        message: (modelErr as Error).message ?? "Model call failed",
      });
      endSSE();
      return;
    }

    // Emit turn.completed before persistence so client sees it immediately
    sseWrite(res, "turn.completed", {
      finalText: loopResult.assistantText,
      usage: { orgContextVersion: loopResult.orgContextVersion },
    });

    // Persist request record and assistant turn
    let requestId: string;
    try {
      const updatedRequest = await persistRequest(deps.requestStore, ownerId, sessionId, intake, loopResult);
      requestId = updatedRequest.requestId;

      await deps.sessionStore.appendTurn(ownerId, sessionId, {
        turnId: randomUUID(),
        role: "assistant",
        content: loopResult.assistantText,
        timestamp: new Date().toISOString(),
      });
    } catch (persistErr) {
      console.error("[responses-adapter] SSE persist error:", persistErr);
      // Non-fatal — user already got the response; log but don't fail the SSE stream
      requestId = "persist-failed";
    }

    sseWrite(res, "response.done", { requestId, sessionId });
    endSSE();
  } catch (err) {
    console.error("[responses-adapter] SSE error:", err);
    // Only write error event if headers haven't been sent (they have — use sseWrite).
    try {
      sseWrite(res, "error", {
        code: "internal_error",
        message: (err as Error).message ?? "Internal server error",
      });
    } catch {
      // If even writing the error event fails, just end
    }
    endSSE();
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildIntakeFields(intake: Record<string, unknown>) {
  return {
    businessOutcome: (intake.businessOutcome as string) ?? "",
    targetUsers: (intake.targetUsers as string) ?? "",
    desiredBehavior: (intake.desiredBehavior as string) ?? "",
    dataSources: Array.isArray(intake.dataSources)
      ? (intake.dataSources as string[]).join(", ")
      : (intake.dataSources as string | undefined),
    actions: Array.isArray(intake.actions)
      ? (intake.actions as string[]).join(", ")
      : (intake.actions as string | undefined),
    constraints: Array.isArray(intake.constraints)
      ? (intake.constraints as string[]).join(", ")
      : (intake.constraints as string | undefined),
  };
}

async function persistRequest(
  requestStore: IRequestStore,
  ownerId: string,
  sessionId: string,
  intake: Record<string, unknown>,
  loopResult: Awaited<ReturnType<typeof runAdvisorLoop>>
) {
  let requestRecord = await findOpenRequest(requestStore, ownerId, sessionId);
  if (!requestRecord) {
    requestRecord = await requestStore.createRequest(
      ownerId,
      sessionId,
      (intake.title as string) ?? (intake.businessOutcome as string | undefined)?.slice(0, 60) ?? "Request"
    );
  }

  const patch: Parameters<typeof requestStore.updateRequest>[2] = {
    title: (intake.title as string) ?? requestRecord.title,
    businessOutcome: (intake.businessOutcome as string) ?? requestRecord.businessOutcome,
    targetUsers: (intake.targetUsers as string) ?? requestRecord.targetUsers,
    desiredBehavior: (intake.desiredBehavior as string) ?? requestRecord.desiredBehavior,
    dataSources: Array.isArray(intake.dataSources)
      ? (intake.dataSources as string[]).join(", ")
      : ((intake.dataSources as string) ?? requestRecord.dataSources),
    actions: Array.isArray(intake.actions)
      ? (intake.actions as string[]).join(", ")
      : ((intake.actions as string) ?? requestRecord.actions),
    constraints: Array.isArray(intake.constraints)
      ? (intake.constraints as string[]).join(", ")
      : ((intake.constraints as string) ?? requestRecord.constraints),
    status: loopResult.readinessBrief ? "ReadyForConfirmation" : "Draft",
    updatedAt: new Date().toISOString(),
    orgContextVersion: loopResult.orgContextVersion,
  };
  if (loopResult.searchMatches) patch.similarProjectMatches = loopResult.searchMatches;
  if (loopResult.reuseDecision) patch.reuseDecision = loopResult.reuseDecision;
  if (loopResult.readinessBrief) patch.readinessBrief = loopResult.readinessBrief;

  return requestStore.updateRequest(ownerId, requestRecord.requestId, patch);
}

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
