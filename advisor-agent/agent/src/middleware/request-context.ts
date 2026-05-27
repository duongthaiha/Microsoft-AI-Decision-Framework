/**
 * Per-request context middleware.
 *
 * Assigns a `requestId` (UUID v4) to every inbound request, records the start
 * timestamp, and emits a structured JSON log line on response finish.  The log
 * line is captured by the Container Apps stdout → Log Analytics pipeline.
 *
 * Structured fields logged:
 *   event      — always "http.request"
 *   requestId  — UUID assigned to this request
 *   method     — HTTP verb
 *   route      — Express matched route path (or raw path pre-match)
 *   status     — HTTP response status code
 *   latencyMs  — wall-clock duration from first byte in to last byte out
 *   userId     — Entra OID from req.user (populated by jwtMiddleware) or "anonymous"
 *
 * The `requestId` is also propagated to the response via `X-Request-Id` header
 * so clients can correlate their own logs with backend traces.
 *
 * Note: Mount this middleware BEFORE jwtMiddleware so every request (including
 * pre-flight OPTIONS) gets a requestId, but AFTER express.json() so the body
 * parser has run.
 */

import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Augment Express Request so downstream handlers have type-safe access.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** UUID assigned to this inbound request. */
      requestId?: string;
      /** Unix ms timestamp when the request entered the middleware stack. */
      requestStartMs?: number;
    }
  }
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.requestId = randomUUID();
  req.requestStartMs = Date.now();

  // Propagate to response header for client-side correlation.
  res.setHeader("X-Request-Id", req.requestId);

  res.on("finish", () => {
    const latencyMs = Date.now() - (req.requestStartMs ?? Date.now());
    const userId = req.user?.oid ?? "anonymous";

    // Emit structured log — captured by Log Analytics via stdout ingestion.
    process.stdout.write(
      JSON.stringify({
        event: "http.request",
        requestId: req.requestId,
        method: req.method,
        route: req.route?.path ?? req.path,
        status: res.statusCode,
        latencyMs,
        userId,
      }) + "\n"
    );
  });

  next();
}
