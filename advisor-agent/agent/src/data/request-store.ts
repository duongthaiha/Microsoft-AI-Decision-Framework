/**
 * Cosmos DB store for Requests.
 * Partition key `/ownerId` enforces per-user data isolation (FR-019, FR-020).
 *
 * The `listAllRequestsAdmin` method is the ONLY cross-partition read here.
 * It may only be called from the admin backend when the caller holds the
 * AdvisorAdmin role (FR-021, FR-030).  Every cross-partition read must be
 * audit-logged (§11 Audit logging).
 *
 * Microsoft Learn: https://learn.microsoft.com/azure/cosmos-db/nosql/
 */

import { NotImplementedError } from "../errors.js";
import type { Request, RequestStatus } from "./models.js";

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface AdminRequestFilters {
  status?: RequestStatus;
  ownerId?: string;
  fromDate?: string;
  toDate?: string;
  linkedProjectId?: string;
  orgContextVersion?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IRequestStore {
  /**
   * Creates a new draft Request bound to a session.
   * MUST write to the partition identified by ownerId (FR-019, FR-020).
   */
  createRequest(
    ownerId: string,
    sessionId: string,
    title: string
  ): Promise<Request>;

  /**
   * Returns a single Request.
   * MUST filter by ownerId partition key (FR-019, FR-020).
   */
  getRequest(ownerId: string, requestId: string): Promise<Request | null>;

  /**
   * Updates mutable fields of a Request.
   * MUST filter by ownerId partition key (FR-019, FR-020).
   */
  updateRequest(
    ownerId: string,
    requestId: string,
    patch: Partial<Request>
  ): Promise<Request>;

  /**
   * Transitions a Request to status:New (submission confirmation).
   * MUST use an optimistic ETag precondition to prevent double-submission
   * (spec §16 risk row — Cosmos DB write fails on submission confirmation).
   * Throws on ETag conflict so the caller can surface a clear error to the user.
   * MUST filter by ownerId partition key (FR-019, FR-020).
   */
  setStatusNew(ownerId: string, requestId: string, etag: string): Promise<Request>;

  /**
   * Returns all Requests for the given ownerId.
   * MUST filter by ownerId partition key (FR-019, FR-020).
   */
  listMyRequests(ownerId: string): Promise<Request[]>;

  /**
   * Cross-partition query — returns Requests across ALL users matching the filters.
   *
   * THIS IS THE ONLY METHOD THAT DOES CROSS-PARTITION READS.
   * It MUST be called only when the caller has been verified to hold the AdvisorAdmin
   * role (FR-021, FR-030).  Every invocation MUST be audit-logged with the adminId
   * and the filter parameters (§11 Audit logging).
   */
  listAllRequestsAdmin(filters: AdminRequestFilters): Promise<Request[]>;
}

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------

/**
 * Stub — every method throws NotImplementedError.
 *
 * M1 will implement Cosmos DB CRUD.  Key M1 design notes:
 * - setStatusNew uses ETag optimistic concurrency; the If-Match header must be
 *   set on the replace operation so concurrent submissions fail cleanly.
 * - listAllRequestsAdmin must enable cross-partition queries (enableCrossPartitionQuery: true)
 *   and must ONLY be called after AdvisorAdmin role verification.
 */
export class CosmosRequestStore implements IRequestStore {
  createRequest(
    _ownerId: string,
    _sessionId: string,
    _title: string
  ): Promise<Request> {
    // M1: create Request document in 'requests' container; ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosRequestStore.createRequest");
  }

  getRequest(_ownerId: string, _requestId: string): Promise<Request | null> {
    // M1: point-read by (requestId, ownerId); ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosRequestStore.getRequest");
  }

  updateRequest(
    _ownerId: string,
    _requestId: string,
    _patch: Partial<Request>
  ): Promise<Request> {
    // M1: patch operation with provided fields; ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosRequestStore.updateRequest");
  }

  setStatusNew(
    _ownerId: string,
    _requestId: string,
    _etag: string
  ): Promise<Request> {
    // M1: replace document with If-Match: etag header to prevent double-submission
    // (spec §16 risk — Cosmos etag precondition for status transitions needs careful
    // design: the ETag from the ReadyForConfirmation read must be passed here and the
    // Cosmos SDK must throw on 412 Precondition Failed).
    // Ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosRequestStore.setStatusNew");
  }

  listMyRequests(_ownerId: string): Promise<Request[]> {
    // M1: query requests container WHERE ownerId = :ownerId (partition-scoped); ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosRequestStore.listMyRequests");
  }

  listAllRequestsAdmin(_filters: AdminRequestFilters): Promise<Request[]> {
    // M1: cross-partition query with enableCrossPartitionQuery: true.
    // THIS IS THE ONLY METHOD THAT DOES CROSS-PARTITION READS.
    // REQUIRES AdvisorAdmin role verification BEFORE calling this method.
    // MUST audit-log the adminId and filter parameters (§11, FR-030).
    throw new NotImplementedError("CosmosRequestStore.listAllRequestsAdmin");
  }
}
