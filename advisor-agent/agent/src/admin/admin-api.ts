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
 *   GET  /admin/org-context          — read active Organisation Context
 *   PUT  /admin/org-context          — create/publish a new Organisation Context version
 *   GET  /admin/requests             — list all Requests (cross-partition, AdvisorAdmin only)
 *   GET  /admin/requests/:id         — Request detail (readiness brief, alignment notes)
 *   GET  /admin/projects             — list all Projects
 *   GET  /admin/projects/:id         — Project detail + linked Requests
 *
 * FR-021 — admin backend gated by AdvisorAdmin Entra app role.
 * FR-027 — Requests list screen.
 * FR-028 — Request detail screen (audit-logged on every open).
 * FR-029 — Projects list and detail screens.
 * FR-030 — admin read scope enforced at data layer.
 */

import { Router, type Request, type Response, type NextFunction } from "express";

// ---------------------------------------------------------------------------
// Middleware stub
// ---------------------------------------------------------------------------

/**
 * Validates that the caller holds the `AdvisorAdmin` Entra app role.
 *
 * M1 will implement this as a real JWT role-claim check.  Until then, the stub
 * blocks all admin routes in demo mode and returns 403 so the admin surfaces are
 * not accidentally accessible (§11 — admin scope, demo mode cannot grant admin).
 */
function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  // M1: decode the validated JWT from req, check roles claim contains 'AdvisorAdmin'.
  // If not present: audit-log the attempt (adminId if resolvable, endpoint, timestamp)
  // then return 403 with no content leakage (FR-021, §11 admin scope).
  if (process.env.ADVISOR_DEMO_MODE === "true") {
    res.status(403).json({ error: "Admin access is not available in demo mode." });
    return;
  }
  // M1: replace this pass-through with real role validation.
  next();
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createAdminRouter(): Router {
  const router = Router();

  // Apply the admin role gate to every route in this sub-router.
  router.use(requireAdminRole);

  // -------------------------------------------------------------------------
  // Organisation Context
  // -------------------------------------------------------------------------

  /**
   * GET /admin/org-context
   * Returns the active (published) Organisation Context.
   * Audit-log: adminId, endpoint, timestamp (FR-028, §11).
   */
  router.get("/org-context", (_req: Request, res: Response) => {
    // M1: orgContextStore.getActiveOrgContext('default') — audit-log this call.
    res.status(501).json({ error: "Not implemented — M1 will implement org-context read." });
  });

  /**
   * PUT /admin/org-context
   * Creates a new Organisation Context version and optionally publishes it.
   * Audit-log: adminId, version created, whether published (FR-022, FR-023, §11).
   */
  router.put("/org-context", (_req: Request, res: Response) => {
    // M1: orgContextStore.publishVersion(orgId, content, editorId) — audit-log this call.
    res.status(501).json({ error: "Not implemented — M1 will implement org-context write." });
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
