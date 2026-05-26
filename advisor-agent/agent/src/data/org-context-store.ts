/**
 * Cosmos DB store for Organisation Context.
 * Partition key `/orgId` — single 'default' org in MVP; schema reserves the key
 * so multi-org can be added without migration (squad-open-questions-defaults.md, #10).
 *
 * The **agent identity** may only call `getActiveOrgContext` and `getOrgContextVersion`.
 * The `publishVersion` method (and any admin-write path) is called only by the
 * admin backend identity, which has read/write RBAC on the `org-context` container.
 * The agent identity must have read-only RBAC on `org-context` (spec §11, FR-016).
 *
 * FR-022 — Organisation Context CRUD + versioning.
 * FR-023 — version + orgContextVersion stamped on every Request.
 * FR-024 — active context loaded for Phase 2 and Phase 3 reasoning.
 *
 * Microsoft Learn: https://learn.microsoft.com/azure/cosmos-db/nosql/
 */

import { NotImplementedError } from "../errors.js";
import type { OrgContext } from "./models.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IOrgContextStore {
  /**
   * Returns the currently published (active) OrgContext for the given org.
   * Called by the agent on every Phase 2 / Phase 3 recommendation (FR-024).
   * Read-only — agent identity path.
   */
  getActiveOrgContext(orgId: string): Promise<OrgContext | null>;

  /**
   * Returns a specific version of the OrgContext by version string.
   * Used to reconstruct the context that was active when a given Request was processed.
   * Read-only — agent identity path.
   */
  getOrgContextVersion(orgId: string, version: string): Promise<OrgContext | null>;

  /**
   * Returns the version history for an org (most recent first).
   * Admin-only path — must be called only when the caller holds AdvisorAdmin role.
   */
  listVersions(orgId: string): Promise<OrgContext[]>;

  /**
   * Creates a new immutable version of the OrgContext and optionally publishes it.
   *
   * Admin-only path — the agent identity does NOT call this method.
   * Publishing marks the version as `published: true` and clears the flag on any
   * previously active version (only one published version at a time).
   *
   * FR-022 — CRUD + versioning.
   * FR-023 — every save creates a new immutable version with version, editorId, editedAt, changeSummary.
   */
  publishVersion(
    orgId: string,
    content: Omit<OrgContext, "id" | "orgId" | "version" | "editorId" | "editedAt">,
    editorId: string
  ): Promise<OrgContext>;
}

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------

/**
 * Stub — every method throws NotImplementedError.
 *
 * M1 will implement:
 * - getActiveOrgContext: query `org-context` WHERE orgId = :orgId AND published = true; limit 1.
 * - getOrgContextVersion: point-read by (version-derived id, orgId).
 * - listVersions: query all documents for orgId, ordered by editedAt desc.
 * - publishVersion: write new version doc, patch prior published doc to published:false in a
 *   transaction (or accept eventual consistency with a conditional patch).
 */
export class CosmosOrgContextStore implements IOrgContextStore {
  getActiveOrgContext(_orgId: string): Promise<OrgContext | null> {
    // M1: query org-context WHERE orgId = :orgId AND published = true, limit 1.
    throw new NotImplementedError("CosmosOrgContextStore.getActiveOrgContext");
  }

  getOrgContextVersion(
    _orgId: string,
    _version: string
  ): Promise<OrgContext | null> {
    // M1: point-read by (orgId + version composite id).
    throw new NotImplementedError("CosmosOrgContextStore.getOrgContextVersion");
  }

  listVersions(_orgId: string): Promise<OrgContext[]> {
    // M1: query all versions for orgId, ordered by editedAt desc.
    // Admin-only; AdvisorAdmin role must be verified at the API layer before calling this.
    throw new NotImplementedError("CosmosOrgContextStore.listVersions");
  }

  publishVersion(
    _orgId: string,
    _content: Omit<OrgContext, "id" | "orgId" | "version" | "editorId" | "editedAt">,
    _editorId: string
  ): Promise<OrgContext> {
    // M1: create new immutable version document, then mark prior active version as published:false.
    // Admin identity only — agent identity does not call this (FR-022, FR-023).
    throw new NotImplementedError("CosmosOrgContextStore.publishVersion");
  }
}
