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

import { NotImplementedError } from "../errors.js";
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
// Stub implementation
// ---------------------------------------------------------------------------

/**
 * Stub implementation — every method throws NotImplementedError.
 *
 * M1 will implement full Cosmos DB CRUD using the CosmosClient factory from
 * cosmos-client.ts.  Partition key /ownerId is used on every read and write so
 * Cosmos DB data-plane RBAC provides a second line of defence alongside
 * application-layer ownership checks (FR-019, FR-020).
 */
export class CosmosSessionStore implements ISessionStore {
  createSession(_ownerId: string, _title: string): Promise<Session> {
    // M1: create Session document in 'sessions' container, partition key /ownerId.
    throw new NotImplementedError("CosmosSessionStore.createSession");
  }

  getSession(_ownerId: string, _sessionId: string): Promise<Session | null> {
    // M1: point-read by (sessionId, ownerId); ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosSessionStore.getSession");
  }

  listSessions(_ownerId: string): Promise<Session[]> {
    // M1: query sessions container WHERE ownerId = :ownerId (partition-scoped); ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosSessionStore.listSessions");
  }

  renameSession(
    _ownerId: string,
    _sessionId: string,
    _title: string
  ): Promise<Session> {
    // M1: patch title field; ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosSessionStore.renameSession");
  }

  deleteSession(_ownerId: string, _sessionId: string): Promise<void> {
    // M1: soft-delete (set status:'archived'); ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosSessionStore.deleteSession");
  }

  appendTurn(
    _ownerId: string,
    _sessionId: string,
    _turn: Omit<SessionTurn, "sessionId" | "ownerId">
  ): Promise<SessionTurn> {
    // M1: upsert turn document; ownership filter MUST use partition key /ownerId per FR-019, FR-020.
    throw new NotImplementedError("CosmosSessionStore.appendTurn");
  }
}
