/**
 * Admin API sub-router.
 *
 * All routes in this module require the caller to hold the `AdvisorAdmin`
 * Entra app role.  The `requireAdminRole` middleware stub enforces this gate;
 * M1 will replace the stub with a real JWT role-claim check.
 *
 * Every route that is reachable must be audit-logged with the admin's identity,
 * the resource accessed, and any filter parameters (FR-028, §11 Audit logging).
 *
 * Routes:
 *   GET  /admin/org-context                        — list all versions (desc)
 *   GET  /admin/org-context/published              — get the currently published version envelope
 *   GET  /admin/org-context/versions               — list all versions (desc) [legacy alias]
 *   GET  /admin/org-context/versions/:id           — get one version
 *   POST /admin/org-context                        — create draft version
 *   POST /admin/org-context/versions               — create draft version [legacy alias]
 *   PUT  /admin/org-context/:id/publish            — publish a version (REST-idiomatic)
 *   POST /admin/org-context/versions/:id/publish   — publish a version [legacy alias]
 *   GET  /admin/requests             — list all Requests (cross-partition, AdvisorAdmin only)
 *   GET  /admin/requests/:id         — Request detail (readiness brief, alignment notes)
 *   GET  /admin/projects             — list all Projects
 *   GET  /admin/projects/:id         — Project detail + linked Requests
 *
 * FR-021 — admin backend gated by AdvisorAdmin Entra app role.
 * FR-024 — versioned org context write API (M2).
 * FR-027 — Requests list screen.
 * FR-028 — Request detail screen (audit-logged on every open).
 * FR-029 — Projects list and detail screens.
 * FR-030 — admin read scope enforced at data layer.
 */

import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/jwt-middleware.js";
import { getTracer } from "../telemetry/otel.js";
import { SpanKind } from "@opentelemetry/api";
import type { IOrgContextVersionStore } from "../data/org-context-store.js";
import type { OrgContext } from "../data/models.js";

// ---------------------------------------------------------------------------
// Dependency injection shape
// ---------------------------------------------------------------------------

export interface AdminRouterDeps {
  orgContextStore?: IOrgContextVersionStore;
  /** Fallback seed — used by GET /admin/org-context when no published version exists. */
  seedOrgContext?: OrgContext | null;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createAdminRouter(deps: AdminRouterDeps = {}): Router {
  const router = Router();

  // Apply the AdvisorAdmin role gate to every route in this sub-router.
  // jwtMiddleware runs upstream (index.ts) so req.user is already populated.
  router.use(requireRole("AdvisorAdmin"));

  // -------------------------------------------------------------------------
  // Organisation Context — versioned write API (FR-024, M2)
  // -------------------------------------------------------------------------

  /**
   * GET /admin/org-context
   * Lists all versions ordered by version DESC.
   * Falls back to wrapped seed when no store is configured.
   */
  router.get("/org-context", async (req: Request, res: Response) => {
    const adminId = req.user?.oid ?? "unknown";
    console.log(`[admin-api] GET /org-context  adminId=${adminId}`);
    if (!deps.orgContextStore) {
      // No store — return seed as a synthetic single-item list
      if (deps.seedOrgContext) {
        return res.json({ versions: [{ id: "seed", version: 0, published: true, content: deps.seedOrgContext }] });
      }
      return res.status(503).json({ error: "Org context store not configured" });
    }
    try {
      const versions = await deps.orgContextStore.listAll();
      return res.json({ versions });
    } catch (err) {
      return handleAdminError(err, res);
    }
  });

  /**
   * GET /admin/org-context/published
   * Returns the full OrgContextVersion envelope for the currently published version.
   * This is the canonical endpoint for Lambert to read before rendering the admin form.
   * Falls back to a seed envelope if no published version exists.
   */
  router.get("/org-context/published", async (req: Request, res: Response) => {
    const adminId = req.user?.oid ?? "unknown";
    console.log(`[admin-api] GET /org-context/published  adminId=${adminId}`);
    if (!deps.orgContextStore) {
      if (deps.seedOrgContext) {
        return res.json({ id: "seed", version: 0, published: true, content: deps.seedOrgContext });
      }
      return res.status(404).json({ error: "No published org context found" });
    }
    try {
      const published = await deps.orgContextStore.getPublished();
      if (!published) {
        return res.status(404).json({ error: "No published org context found" });
      }
      return res.json(published);
    } catch (err) {
      return handleAdminError(err, res);
    }
  });

  /**
   * POST /admin/org-context
   * Creates a new DRAFT version (published=false).
   * Body: OrgContext document — all required fields validated.
   * This is the primary write endpoint; /versions is retained for backward compat.
   */
  router.post("/org-context", async (req: Request, res: Response) => {
    const adminId = req.user?.oid ?? "unknown";
    const adminName = req.user?.name ?? "Admin";
    console.log(`[admin-api] POST /org-context  adminId=${adminId}`);
    if (!deps.orgContextStore) {
      return res.status(503).json({ error: "Org context store not configured" });
    }
    try {
      const content = req.body as OrgContext;
      const validationError = validateOrgContextBody(content);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
      const draft = await deps.orgContextStore.createDraft(content, { oid: adminId, name: adminName });
      return res.status(201).json(draft);
    } catch (err) {
      return handleAdminError(err, res);
    }
  });

  /**
   * PUT /admin/org-context/:id/publish
   * Marks the given version as published=true; atomically un-publishes the
   * previously published version (read-modify-write loop — see org-context-store.ts).
   * Stamps publishedAt from server time, publishedBy from JWT oid.
   */
  router.put("/org-context/:id/publish", async (req: Request, res: Response) => {
    const adminId = req.user?.oid ?? "unknown";
    const { id } = req.params;
    console.log(`[admin-api] PUT /org-context/${id}/publish  adminId=${adminId}`);
    if (!deps.orgContextStore) {
      return res.status(503).json({ error: "Org context store not configured" });
    }
    try {
      const published = await deps.orgContextStore.publish(id);

      // Custom event: org context version published
      const span = getTracer().startSpan("org_context.published", { kind: SpanKind.INTERNAL });
      span.setAttributes({
        "org_context.version_id": id,
        "org_context.version": String(published.version ?? ""),
        "admin.oid": adminId,
      });
      span.end();

      return res.json(published);
    } catch (err) {
      return handleAdminError(err, res);
    }
  });

  /**
   * GET /admin/org-context/versions
   * Returns all versions ordered by version DESC.
   */
  router.get("/org-context/versions", async (req: Request, res: Response) => {
    const adminId = req.user?.oid ?? "unknown";
    console.log(`[admin-api] GET /org-context/versions  adminId=${adminId}`);
    if (!deps.orgContextStore) {
      return res.status(503).json({ error: "Org context store not configured" });
    }
    try {
      const versions = await deps.orgContextStore.listAll();
      return res.json({ versions });
    } catch (err) {
      return handleAdminError(err, res);
    }
  });

  /**
   * GET /admin/org-context/versions/:id
   * Returns a single version by id.
   */
  router.get("/org-context/versions/:id", async (req: Request, res: Response) => {
    const adminId = req.user?.oid ?? "unknown";
    const { id } = req.params;
    console.log(`[admin-api] GET /org-context/versions/${id}  adminId=${adminId}`);
    if (!deps.orgContextStore) {
      return res.status(503).json({ error: "Org context store not configured" });
    }
    try {
      const versions = await deps.orgContextStore.listAll();
      const version = versions.find((v) => v.id === id);
      if (!version) return res.status(404).json({ error: "Version not found" });
      return res.json(version);
    } catch (err) {
      return handleAdminError(err, res);
    }
  });

  /**
   * POST /admin/org-context/versions
   * Body: OrgContext — creates a new draft version (published=false).
   * Legacy alias for POST /admin/org-context.
   */
  router.post("/org-context/versions", async (req: Request, res: Response) => {
    const adminId = req.user?.oid ?? "unknown";
    const adminName = req.user?.name ?? "Admin";
    console.log(`[admin-api] POST /org-context/versions  adminId=${adminId}`);
    if (!deps.orgContextStore) {
      return res.status(503).json({ error: "Org context store not configured" });
    }
    try {
      const content = req.body as OrgContext;
      const validationError = validateOrgContextBody(content);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
      const draft = await deps.orgContextStore.createDraft(content, { oid: adminId, name: adminName });
      return res.status(201).json(draft);
    } catch (err) {
      return handleAdminError(err, res);
    }
  });

  /**
   * POST /admin/org-context/versions/:id/publish
   * Marks the given version as published=true; all others become published=false.
   */
  router.post("/org-context/versions/:id/publish", async (req: Request, res: Response) => {
    const adminId = req.user?.oid ?? "unknown";
    const { id } = req.params;
    console.log(`[admin-api] POST /org-context/versions/${id}/publish  adminId=${adminId}`);
    if (!deps.orgContextStore) {
      return res.status(503).json({ error: "Org context store not configured" });
    }
    try {
      const published = await deps.orgContextStore.publish(id);

      // Custom event: org context version published (legacy alias)
      const span = getTracer().startSpan("org_context.published", { kind: SpanKind.INTERNAL });
      span.setAttributes({
        "org_context.version_id": id,
        "org_context.version": String(published.version ?? ""),
        "admin.oid": adminId,
      });
      span.end();

      return res.json(published);
    } catch (err) {
      return handleAdminError(err, res);
    }
  });

  // -------------------------------------------------------------------------
  // Requests browse (FR-027, FR-028, FR-030)
  // -------------------------------------------------------------------------

  /**
   * GET /admin/requests
   * Paginated list of all Requests across all users.
   * Cross-partition read — requires AdvisorAdmin role (enforced above).
   * Audit-log: adminId, filter parameters, page (FR-027, FR-030, §11).
   */
  router.get("/requests", (_req: Request, res: Response) => {
    // M1: requestStore.listAllRequestsAdmin(filters) — CROSS-PARTITION READ.
    // Audit-log: adminId, filter params (status, ownerId, dateRange, linkedProjectId, orgContextVersion).
    res.status(501).json({ error: "Not implemented — M1 will implement admin requests list." });
  });

  /**
   * GET /admin/requests/:id
   * Full Request detail — readiness brief, framework answers, alignment notes.
   * Audit-log: adminId, requestId, ownerId (FR-028, §11).
   */
  router.get("/requests/:id", (req: Request, res: Response) => {
    const requestId = req.params.id;
    // M1: requestStore.getRequest — note: admin path requires cross-partition lookup.
    // Audit-log: adminId, requestId, ownerId whose data was accessed (FR-028, §11).
    void requestId;
    res.status(501).json({ error: "Not implemented — M1 will implement admin request detail." });
  });

  // -------------------------------------------------------------------------
  // Projects browse (FR-029)
  // -------------------------------------------------------------------------

  /**
   * GET /admin/projects
   * Paginated list of all Projects.
   * Audit-log: adminId, filter parameters (FR-029, §11).
   */
  router.get("/projects", (_req: Request, res: Response) => {
    // M1: projectStore.listProjects(filters) — audit-log this call.
    res.status(501).json({ error: "Not implemented — M1 will implement admin projects list." });
  });

  /**
   * GET /admin/projects/:id
   * Project detail + list of linked Requests.
   * Audit-log: adminId, projectId (FR-029, §11).
   */
  router.get("/projects/:id", (req: Request, res: Response) => {
    const projectId = req.params.id;
    // M1: projectStore.getProject(projectId) + listLinkedRequests(projectId) — audit-log.
    void projectId;
    res.status(501).json({ error: "Not implemented — M1 will implement admin project detail." });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function handleAdminError(err: unknown, res: Response): Response {
  console.error("[admin-api] error:", err);
  const code = (err as { code?: number }).code;
  if (code === 404) return res.status(404).json({ error: "Not found" });
  if (code === 503) return res.status(503).json({ error: "Service unavailable" });
  return res.status(500).json({ error: "Internal server error" });
}

// ---------------------------------------------------------------------------
// Body validation helper
// ---------------------------------------------------------------------------

/**
 * Validates that the request body contains the minimum required fields for an
 * OrgContext document.  Returns an error string if invalid, or null if valid.
 */
function validateOrgContextBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be an OrgContext document";
  }
  const ctx = body as Record<string, unknown>;
  if (!ctx.orgId || typeof ctx.orgId !== "string") {
    return "OrgContext.orgId is required and must be a string";
  }
  if (!Array.isArray(ctx.systemInventory)) {
    return "OrgContext.systemInventory must be an array";
  }
  if (!Array.isArray(ctx.entitlements)) {
    return "OrgContext.entitlements must be an array";
  }
  if (!Array.isArray(ctx.customInstructions)) {
    return "OrgContext.customInstructions must be an array";
  }
  return null;
}
