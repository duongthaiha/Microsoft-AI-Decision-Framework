/**
 * Cosmos DB store for Sessions.
 * Partition key `/ownerId` enforces the 'you only see your own sessions' promise.
 *
 * FR-018 — per-user session management.
 * FR-019 — session ownership and isolation.
 * FR-020 — Entra oid as the partition/ownership key.
 *
 * Microsoft Learn: https://learn.microsoft.com/azure/cosmos-db/nosql/
 */

import { randomUUID } from "crypto";
import type { CosmosClient, Database } from "@azure/cosmos";
import type { Session, SessionTurn } from "./models.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ISessionStore {
  /**
   * Creates a new session owned by ownerId.
   * The session document is written to the partition identified by ownerId.
   */
  createSession(ownerId: string, title: string): Promise<Session>;

  /**
   * Returns a single session.  MUST filter by ownerId (partition key /ownerId per FR-019, FR-020).
   * Returns null when the session does not exist or does not belong to ownerId.
   */
  getSession(ownerId: string, sessionId: string): Promise<Session | null>;

  /** Returns all sessions owned by ownerId.  All reads are scoped to the ownerId partition. */
  listSessions(ownerId: string): Promise<Session[]>;

  /**
   * Renames a session.  MUST verify ownerId matches the partition key (FR-019, FR-020).
   */
  renameSession(
    ownerId: string,
    sessionId: string,
    title: string
  ): Promise<Session>;

  /**
   * Soft-deletes (archives) a session.  MUST verify ownerId matches the partition key (FR-019, FR-020).
   * Hard delete is deferred to a TTL cleanup job.
   */
  deleteSession(ownerId: string, sessionId: string): Promise<void>;

  /**
   * Appends a conversation turn to the session.
   * MUST filter by ownerId partition key per FR-019, FR-020.
   */
  appendTurn(
    ownerId: string,
    sessionId: string,
    turn: Omit<SessionTurn, "sessionId" | "ownerId">
  ): Promise<SessionTurn>;
}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

const DB_NAME = "advisor";
const SESSIONS_CONTAINER = "sessions";
const TURNS_CONTAINER = "turns";

/**
 * Live Cosmos DB implementation of ISessionStore.
 *
 * Constructor accepts a CosmosClient and ensures the database + containers
 * exist on first call (idempotent createIfNotExists).
 *
 * Partition key /ownerId scopes every query to a single user partition,
 * satisfying FR-019 (data isolation) without cross-partition overhead.
 */
export class CosmosSessionStore implements ISessionStore {
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
      id: SESSIONS_CONTAINER,
      partitionKey: { paths: ["/ownerId"] },
    });
    await database.containers.createIfNotExists({
      id: TURNS_CONTAINER,
      partitionKey: { paths: ["/ownerId"] },
    });
    return database;
  }

  async createSession(ownerId: string, title: string): Promise<Session> {
    const db = await this.db();
    const now = new Date().toISOString();
    const id = randomUUID();
    const session: Session = {
      id,
      sessionId: id,
      ownerId,
      ownerType: ownerId.startsWith("demo::") ? "demo" : "entra",
      title: title || "New Session",
      status: "active",
      createdAt: now,
      lastActiveAt: now,
      turnCount: 0,
    };
    const { resource } = await db.container(SESSIONS_CONTAINER).items.create(session);
    return resource as Session;
  }

  async getSession(ownerId: string, sessionId: string): Promise<Session | null> {
    const db = await this.db();
    try {
      const { resource } = await db
        .container(SESSIONS_CONTAINER)
        .item(sessionId, ownerId)
        .read<Session>();
      if (!resource || resource.ownerId !== ownerId) return null;
      return resource;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async listSessions(ownerId: string): Promise<Session[]> {
    const db = await this.db();
    const { resources } = await db
      .container(SESSIONS_CONTAINER)
      .items.query<Session>(
        {
          query: "SELECT * FROM c WHERE c.ownerId = @ownerId AND c.status != 'archived' ORDER BY c.lastActiveAt DESC",
          parameters: [{ name: "@ownerId", value: ownerId }],
        },
        { partitionKey: ownerId }
      )
      .fetchAll();
    return resources;
  }

  async renameSession(ownerId: string, sessionId: string, title: string): Promise<Session> {
    const db = await this.db();
    const existing = await this.getSession(ownerId, sessionId);
    if (!existing) throw Object.assign(new Error("Session not found"), { code: 404 });
    const updated: Session = { ...existing, title, lastActiveAt: new Date().toISOString() };
    const { resource } = await db
      .container(SESSIONS_CONTAINER)
      .item(sessionId, ownerId)
      .replace(updated);
    return resource as Session;
  }

  async deleteSession(ownerId: string, sessionId: string): Promise<void> {
    const db = await this.db();
    const existing = await this.getSession(ownerId, sessionId);
    if (!existing) throw Object.assign(new Error("Session not found"), { code: 404 });
    const updated: Session = { ...existing, status: "archived", lastActiveAt: new Date().toISOString() };
    await db.container(SESSIONS_CONTAINER).item(sessionId, ownerId).replace(updated);
  }

  async appendTurn(
    ownerId: string,
    sessionId: string,
    turn: Omit<SessionTurn, "sessionId" | "ownerId">
  ): Promise<SessionTurn> {
    const db = await this.db();
    const now = new Date().toISOString();
    const turnDoc: SessionTurn = {
      ...turn,
      sessionId,
      ownerId,
      timestamp: turn.timestamp || now,
    };
    await db.container(TURNS_CONTAINER).items.upsert({ ...turnDoc, id: turnDoc.turnId });

    // Update session lastActiveAt and turnCount
    const existing = await this.getSession(ownerId, sessionId);
    if (existing) {
      const updated: Session = {
        ...existing,
        lastActiveAt: now,
        turnCount: (existing.turnCount || 0) + 1,
      };
      await db.container(SESSIONS_CONTAINER).item(sessionId, ownerId).replace(updated);
    }
    return turnDoc;
  }
}
