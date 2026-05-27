/**
 * Cosmos DB store for versioned Organisation Context.
 *
 * Container: `org_contexts`, partition key `/id`.
 * One document per version — each has a unique id like "org-ctx-v1".
 * Only ONE document may have `published = true` at a time.
 *
 * Agent read path  — `getPublished()` called on every reasoning turn (FR-024).
 * Admin write path — `createDraft()` and `publish()` gated behind AdvisorAdmin role.
 *
 * Publish atomicity: partition key is `/id` so each version is its own partition —
 * Cosmos transactional batch requires same partition, so we use a read-modify-write
 * loop instead.  Eventual consistency is acceptable here (rare admin operation,
 * one admin at a time per org in MVP).
 *
 * FR-022 — Organisation Context CRUD + versioning.
 * FR-023 — orgContextVersion stamped on every Request.
 * FR-024 — active context loaded for Phase 2 and Phase 3 reasoning.
 *
 * Microsoft Learn: https://learn.microsoft.com/azure/cosmos-db/nosql/
 */

import { randomUUID } from "crypto";
import type { CosmosClient, Database } from "@azure/cosmos";
import type { OrgContext, OrgContextVersion } from "./models.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IOrgContextVersionStore {
  /**
   * Returns the single published (active) version, or null if none exists yet.
   * Called by the agent on every reasoning turn (FR-024).
   */
  getPublished(): Promise<OrgContextVersion | null>;

  /**
   * Returns all versions ordered by version DESC.
   * Admin-only — AdvisorAdmin role must be verified at the API layer.
   */
  listAll(): Promise<OrgContextVersion[]>;

  /**
   * Creates a new draft version (published=false).
   * The version number is max(existing)+1.
   * Admin-only path.
   */
  createDraft(
    content: OrgContext,
    author: { oid: string; name: string }
  ): Promise<OrgContextVersion>;

  /**
   * Marks the given version as published=true and all others as published=false.
   * Read-modify-write loop (cross-partition — no Cosmos transactional batch).
   * Admin-only path.
   */
  publish(id: string): Promise<OrgContextVersion>;
}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

const DB_NAME = "advisor";
const ORG_CONTEXTS_CONTAINER = "org_contexts";

export class CosmosOrgContextVersionStore implements IOrgContextVersionStore {
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
      id: ORG_CONTEXTS_CONTAINER,
      partitionKey: { paths: ["/id"] },
    });
    return database;
  }

  async getPublished(): Promise<OrgContextVersion | null> {
    const db = await this.db();
    const { resources } = await db
      .container(ORG_CONTEXTS_CONTAINER)
      .items.query<OrgContextVersion>({
        query: "SELECT * FROM c WHERE c.published = true ORDER BY c.version DESC OFFSET 0 LIMIT 1",
      })
      .fetchAll();
    return resources[0] ?? null;
  }

  async listAll(): Promise<OrgContextVersion[]> {
    const db = await this.db();
    const { resources } = await db
      .container(ORG_CONTEXTS_CONTAINER)
      .items.query<OrgContextVersion>({
        query: "SELECT * FROM c ORDER BY c.version DESC",
      })
      .fetchAll();
    return resources;
  }

  async createDraft(
    content: OrgContext,
    author: { oid: string; name: string }
  ): Promise<OrgContextVersion> {
    const db = await this.db();
    const all = await this.listAll();
    const maxVersion = all.reduce((m, v) => Math.max(m, v.version), 0);
    const nextVersion = maxVersion + 1;
    const id = `org-ctx-v${nextVersion}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const doc: OrgContextVersion = {
      id,
      version: nextVersion,
      createdAt: now,
      createdBy: author,
      publishedAt: "",
      publishedBy: author,
      published: false,
      content,
    };
    const { resource } = await db.container(ORG_CONTEXTS_CONTAINER).items.create(doc);
    return resource as OrgContextVersion;
  }

  async publish(id: string): Promise<OrgContextVersion> {
    const db = await this.db();
    const container = db.container(ORG_CONTEXTS_CONTAINER);

    // Read all versions — cross-partition, no transactional batch possible (different /id partitions).
    const all = await this.listAll();
    const target = all.find((v) => v.id === id);
    if (!target) {
      throw Object.assign(new Error(`OrgContextVersion '${id}' not found`), { code: 404 });
    }

    const now = new Date().toISOString();

    // Clear published flag on all currently-published versions
    for (const v of all) {
      if (v.published && v.id !== id) {
        const updated: OrgContextVersion = { ...v, published: false };
        await container.item(v.id, v.id).replace(updated);
      }
    }

    // Mark target as published
    const published: OrgContextVersion = { ...target, published: true, publishedAt: now };
    const { resource } = await container.item(id, id).replace(published);
    return resource as OrgContextVersion;
  }
}

// ---------------------------------------------------------------------------
// Noop implementation — used when Cosmos is not configured (local tests / CI)
// ---------------------------------------------------------------------------

export function createNoopOrgContextVersionStore(): IOrgContextVersionStore {
  return {
    getPublished: async () => null,
    listAll: async () => [],
    createDraft: async () => { throw Object.assign(new Error("COSMOS_ENDPOINT not configured"), { code: 503 }); },
    publish: async () => { throw Object.assign(new Error("COSMOS_ENDPOINT not configured"), { code: 503 }); },
  };
}
