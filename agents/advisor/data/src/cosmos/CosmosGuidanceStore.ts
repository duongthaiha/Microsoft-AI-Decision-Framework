/**
 * CosmosGuidanceStore — implements IGuidanceStore against Azure Cosmos DB.
 *
 * Container:    guidance
 * Partition key: /customerOrganizationId
 * Document id:   instructionSetId
 * TTL:           Disabled (guidance documents are durable).
 *
 * Auth: DefaultAzureCredential (managed identity / Entra). No keys in code.
 *
 * Extends the interface with admin methods (create, update, activate) used by
 * the admin API path and the seed loader. These are not part of IGuidanceStore.
 */

import { CosmosClient } from '@azure/cosmos';
import type { Container, Database } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import type { IGuidanceStore, CustomerGuidanceDocument, GuidanceAuditEntry } from '@advisor/shared';

export interface CosmosGuidanceStoreOptions {
  /** Cosmos DB account endpoint */
  endpoint: string;
  /** Database ID — created if it does not exist */
  databaseId: string;
  /** Container ID — created if it does not exist (default: 'guidance') */
  containerId: string;
}

/** Cosmos DB document shape — CustomerGuidanceDocument plus required 'id'. */
type GuidanceDocument = CustomerGuidanceDocument & { id: string };

export class CosmosGuidanceStore implements IGuidanceStore {
  private readonly client: CosmosClient;
  private readonly options: CosmosGuidanceStoreOptions;
  private database: Database | null = null;
  private container: Container | null = null;

  constructor(options: CosmosGuidanceStoreOptions) {
    this.options = options;
    this.client = new CosmosClient({
      endpoint: options.endpoint,
      aadCredentials: new DefaultAzureCredential(),
    });
  }

  /**
   * Creates the database and container if they do not exist.
   * Must be called once at application startup.
   */
  async initialize(): Promise<void> {
    const { database } = await this.client.databases.createIfNotExists({
      id: this.options.databaseId,
    });
    this.database = database;

    const { container } = await this.database.containers.createIfNotExists({
      id: this.options.containerId,
      partitionKey: { paths: ['/customerOrganizationId'] },
      // No TTL — guidance documents are permanent records.
    });
    this.container = container;
  }

  // ---------------------------------------------------------------------------
  // IGuidanceStore interface
  // ---------------------------------------------------------------------------

  async loadActiveGuidance(
    customerOrganizationId: string
  ): Promise<CustomerGuidanceDocument | null> {
    const { resources } = await this.requireContainer()
      .items.query<GuidanceDocument>(
        {
          query:
            'SELECT * FROM c WHERE c.customerOrganizationId = @orgId AND c.activeFlag = true',
          parameters: [{ name: '@orgId', value: customerOrganizationId }],
        },
        { partitionKey: customerOrganizationId }
      )
      .fetchAll();

    const doc = resources[0];
    return doc !== undefined ? this.fromDocument(doc) : null;
  }


  async loadAllGuidance(
    customerOrganizationId: string
  ): Promise<CustomerGuidanceDocument[]> {
    const { resources } = await this.requireContainer()
      .items.query<GuidanceDocument>(
        {
          query:
            'SELECT * FROM c WHERE c.customerOrganizationId = @orgId ORDER BY c.version DESC',
          parameters: [{ name: '@orgId', value: customerOrganizationId }],
        },
        { partitionKey: customerOrganizationId }
      )
      .fetchAll();

    return resources.map((doc) => this.fromDocument(doc));
  }

  async saveGuidance(doc: CustomerGuidanceDocument): Promise<void> {
    const document: GuidanceDocument = { ...doc, id: doc.instructionSetId };
    await this.requireContainer().items.upsert<GuidanceDocument>(document);
  }

  // ---------------------------------------------------------------------------
  // Admin methods (not part of IGuidanceStore)
  // ---------------------------------------------------------------------------

  /**
   * Creates a new guidance document. Sets version=1 and activeFlag=false by
   * default — call activateGuidance() to promote it.
   */
  async createGuidance(doc: CustomerGuidanceDocument): Promise<void> {
    const document: GuidanceDocument = { ...doc, id: doc.instructionSetId };
    await this.requireContainer().items.create<GuidanceDocument>(document);
  }

  /**
   * Replaces an existing guidance document in-place.
   * The caller is responsible for bumping version and appending to auditTrail.
   */
  async updateGuidance(doc: CustomerGuidanceDocument): Promise<void> {
    const document: GuidanceDocument = { ...doc, id: doc.instructionSetId };
    await this.requireContainer()
      .item(doc.instructionSetId, doc.customerOrganizationId)
      .replace<GuidanceDocument>(document);
  }

  /**
   * Activates the named instruction set for an org and deactivates all others.
   * Issues a single replace per changed document (fan-out bounded by the number
   * of versions per org — typically 1–5 for the POC).
   */
  async activateGuidance(
    customerOrganizationId: string,
    instructionSetId: string,
    activatedBy = 'system'
  ): Promise<void> {
    const { resources } = await this.requireContainer()
      .items.query<GuidanceDocument>(
        {
          query:
            'SELECT * FROM c WHERE c.customerOrganizationId = @orgId',
          parameters: [{ name: '@orgId', value: customerOrganizationId }],
        },
        { partitionKey: customerOrganizationId }
      )
      .fetchAll();

    const now = new Date().toISOString();

    for (const doc of resources) {
      const isTarget = doc.instructionSetId === instructionSetId;
      if (doc.activeFlag === isTarget) continue; // already in desired state

      const auditEntry: GuidanceAuditEntry = {
        changedAt: now,
        changedBy: activatedBy,
        changeType: isTarget ? 'activated' : 'deactivated',
        previousVersion: doc.version,
      };

      const updated: GuidanceDocument = {
        ...doc,
        activeFlag: isTarget,
        lastEditedBy: activatedBy,
        lastEditedAt: now,
        auditTrail: [...doc.auditTrail, auditEntry],
      };

      await this.requireContainer()
        .item(doc.id, doc.customerOrganizationId)
        .replace<GuidanceDocument>(updated);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private requireContainer(): Container {
    if (!this.container) {
      throw new Error(
        'CosmosGuidanceStore.initialize() must be called before use'
      );
    }
    return this.container;
  }

  private fromDocument(doc: GuidanceDocument): CustomerGuidanceDocument {
    const { id: _id, ...rest } = doc as GuidanceDocument & Record<string, unknown>;
    void _id;
    return rest as CustomerGuidanceDocument;
  }
}
