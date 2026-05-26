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

import { randomUUID } from "crypto";
import type { CosmosClient, Database } from "@azure/cosmos";
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

const DB_NAME = "advisor";
const REQUESTS_CONTAINER = "requests";

/**
 * Live Cosmos DB implementation of IRequestStore.
 *
 * Partition key /ownerId scopes every user-facing query.
 * listAllRequestsAdmin is the only cross-partition reader — it must be called
 * only after AdvisorAdmin role verification (FR-030).
 */
export class CosmosRequestStore implements IRequestStore {
  private readonly client: CosmosClient;
  private dbPromise: Promise<Database> | null = null;

  constructor(client: CosmosClient) {
    this.client = client;
  }

  private async db(): Promise<Database> {
    if (!this.dbPromise) {
      this.dbPromise = this.ensureDb();
    }
    return this.dbPromise;
  }

  private async ensureDb(): Promise<Database> {
    const { database } = await this.client.databases.createIfNotExists({ id: DB_NAME });
    await database.containers.createIfNotExists({
      id: REQUESTS_CONTAINER,
      partitionKey: { paths: ["/ownerId"] },
    });
    return database;
  }

  async createRequest(ownerId: string, sessionId: string, title: string): Promise<Request> {
    const db = await this.db();
    const now = new Date().toISOString();
    const id = randomUUID();
    const request: Request = {
      id,
      requestId: id,
      sessionId,
      ownerId,
      title: title || "New Request",
      businessOutcome: "",
      targetUsers: "",
      desiredBehavior: "",
      dataSources: "",
      actions: "",
      constraints: "",
      frameworkAnswers: {},
      similarProjectMatches: [],
      reuseDecision: { decision: "pending", matchesPresented: [] },
      status: "Draft",
      createdAt: now,
      updatedAt: now,
    };
    const { resource } = await db.container(REQUESTS_CONTAINER).items.create(request);
    return resource as Request;
  }

  async getRequest(ownerId: string, requestId: string): Promise<Request | null> {
    const db = await this.db();
    try {
      const { resource } = await db
        .container(REQUESTS_CONTAINER)
        .item(requestId, ownerId)
        .read<Request>();
      if (!resource || resource.ownerId !== ownerId) return null;
      return resource;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async updateRequest(ownerId: string, requestId: string, patch: Partial<Request>): Promise<Request> {
    const db = await this.db();
    const existing = await this.getRequest(ownerId, requestId);
    if (!existing) throw Object.assign(new Error("Request not found"), { code: 404 });
    const updated: Request = {
      ...existing,
      ...patch,
      id: existing.id,
      ownerId: existing.ownerId,
      updatedAt: new Date().toISOString(),
    };
    const { resource } = await db
      .container(REQUESTS_CONTAINER)
      .item(requestId, ownerId)
      .replace(updated);
    return resource as Request;
  }

  async setStatusNew(ownerId: string, requestId: string, etag: string): Promise<Request> {
    const db = await this.db();
    const existing = await this.getRequest(ownerId, requestId);
    if (!existing) throw Object.assign(new Error("Request not found"), { code: 404 });
    const now = new Date().toISOString();
    const updated: Request = {
      ...existing,
      status: "New" as RequestStatus,
      submittedAt: now,
      updatedAt: now,
    };
    // ETag optimistic concurrency — prevents double-submission (spec §16)
    const { resource } = await db
      .container(REQUESTS_CONTAINER)
      .item(requestId, ownerId)
      .replace(updated, { accessCondition: { type: "IfMatch", condition: etag } });
    return resource as Request;
  }

  async listMyRequests(ownerId: string): Promise<Request[]> {
    const db = await this.db();
    const { resources } = await db
      .container(REQUESTS_CONTAINER)
      .items.query<Request>(
        {
          query: "SELECT * FROM c WHERE c.ownerId = @ownerId ORDER BY c.updatedAt DESC",
          parameters: [{ name: "@ownerId", value: ownerId }],
        },
        { partitionKey: ownerId }
      )
      .fetchAll();
    return resources;
  }

  async listAllRequestsAdmin(filters: AdminRequestFilters): Promise<Request[]> {
    const db = await this.db();
    const conditions: string[] = [];
    const params: { name: string; value: string }[] = [];

    if (filters.status) {
      conditions.push("c.status = @status");
      params.push({ name: "@status", value: filters.status });
    }
    if (filters.ownerId) {
      conditions.push("c.ownerId = @ownerId");
      params.push({ name: "@ownerId", value: filters.ownerId });
    }
    if (filters.linkedProjectId) {
      conditions.push("c.linkedProjectId = @linkedProjectId");
      params.push({ name: "@linkedProjectId", value: filters.linkedProjectId });
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { resources } = await db
      .container(REQUESTS_CONTAINER)
      .items.query<Request>(
        { query: `SELECT * FROM c ${where} ORDER BY c.updatedAt DESC`, parameters: params },
        { maxItemCount: 500 }
      )
      .fetchAll();
    return resources;
  }
}
