/**
 * CosmosConversationStore — implements IConversationStore against Azure Cosmos DB.
 *
 * Container:    sessions
 * Partition key: /customerOrganizationId
 * Document id:   sessionId
 * TTL:           Enabled on container (defaultTtl = -1 = no automatic expiry);
 *                per-document TTL honored via AdvisorSession.ttlSeconds.
 *
 * Auth: DefaultAzureCredential (managed identity / Entra). No keys in code.
 */

import { CosmosClient } from '@azure/cosmos';
import type { Container, Database } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import type {
  IConversationStore,
  AdvisorSession,
  ConversationTurn,
  CapturedFact,
  ConversationReadinessState,
  ProjectFeedback,
} from '@advisor/shared';

export interface CosmosConversationStoreOptions {
  /** Cosmos DB account endpoint, e.g. https://my-account.documents.azure.com:443/ */
  endpoint: string;
  /** Database ID — created if it does not exist */
  databaseId: string;
  /** Container ID — created if it does not exist (default: 'sessions') */
  containerId: string;
}

/** Cosmos DB document shape — AdvisorSession plus Cosmos system fields and optional feedback. */
type SessionDocument = AdvisorSession & { id: string; feedback?: ProjectFeedback };

export class CosmosConversationStore implements IConversationStore {
  private readonly client: CosmosClient;
  private readonly options: CosmosConversationStoreOptions;
  private database: Database | null = null;
  private container: Container | null = null;

  constructor(options: CosmosConversationStoreOptions) {
    this.options = options;
    this.client = new CosmosClient({
      endpoint: options.endpoint,
      aadCredentials: new DefaultAzureCredential(),
    });
  }

  /**
   * Creates the database and container if they do not exist.
   * Must be called once at application startup before any store operations.
   */
  async initialize(): Promise<void> {
    const { database } = await this.client.databases.createIfNotExists({
      id: this.options.databaseId,
    });
    this.database = database;

    const { container } = await this.database.containers.createIfNotExists({
      id: this.options.containerId,
      partitionKey: { paths: ['/customerOrganizationId'] },
      // TTL enabled; -1 = no automatic expiry at container level.
      // Per-document TTL is honored when ttlSeconds is set on the session.
      defaultTtl: -1,
    });
    this.container = container;
  }

  async createSession(session: AdvisorSession): Promise<void> {
    const doc: SessionDocument = this.toDocument(session);
    await this.requireContainer().items.create<SessionDocument>(doc);
  }

  async loadSession(sessionId: string): Promise<AdvisorSession | null> {
    // Cross-partition query: interface only provides sessionId, not org ID.
    const { resources } = await this.requireContainer()
      .items.query<SessionDocument>({
        query: 'SELECT * FROM c WHERE c.sessionId = @sessionId',
        parameters: [{ name: '@sessionId', value: sessionId }],
      })
      .fetchAll();

    const doc = resources[0];
    return doc !== undefined ? this.fromDocument(doc) : null;
  }

  async appendTurn(sessionId: string, turn: ConversationTurn): Promise<void> {
    const session = await this.requireSession(sessionId);
    session.conversationCapture.turns.push(turn);
    session.updatedAt = new Date().toISOString();
    session.lastActivityAt = session.updatedAt;
    await this.replaceSession(session);
  }

  async appendFact(sessionId: string, fact: CapturedFact): Promise<void> {
    const session = await this.requireSession(sessionId);
    session.conversationCapture.capturedFacts.push(fact);
    session.updatedAt = new Date().toISOString();
    await this.replaceSession(session);
  }

  async updateReadinessState(
    sessionId: string,
    state: ConversationReadinessState
  ): Promise<void> {
    const session = await this.requireSession(sessionId);
    session.conversationCapture.readinessState = state;
    session.updatedAt = new Date().toISOString();
    await this.replaceSession(session);
  }

  async updateSession(session: AdvisorSession): Promise<void> {
    await this.replaceSession(session);
  }

  async endSession(sessionId: string, endedAt: string): Promise<void> {
    const session = await this.requireSession(sessionId);
    session.conversationCapture.endedAt = endedAt;
    session.conversationCapture.readinessState = 'ended';
    session.updatedAt = new Date().toISOString();
    await this.replaceSession(session);
  }

  async submitFeedback(sessionId: string, feedback: ProjectFeedback): Promise<void> {
    const session = await this.requireSession(sessionId);
    const doc: SessionDocument = { ...this.toDocument(session), feedback };
    await this.requireContainer()
      .item(session.sessionId, session.customerOrganizationId)
      .replace<SessionDocument>(doc);
  }

  async loadFeedback(sessionId: string): Promise<ProjectFeedback | null> {
    const { resources } = await this.requireContainer()
      .items.query<SessionDocument>({
        query: 'SELECT * FROM c WHERE c.sessionId = @sessionId',
        parameters: [{ name: '@sessionId', value: sessionId }],
      })
      .fetchAll();
    return resources[0]?.feedback ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private requireContainer(): Container {
    if (!this.container) {
      throw new Error(
        'CosmosConversationStore.initialize() must be called before use'
      );
    }
    return this.container;
  }

  private async requireSession(sessionId: string): Promise<AdvisorSession> {
    const session = await this.loadSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session;
  }

  private async replaceSession(session: AdvisorSession): Promise<void> {
    const doc = this.toDocument(session);
    await this.requireContainer()
      .item(session.sessionId, session.customerOrganizationId)
      .replace<SessionDocument>(doc);
  }

  private toDocument(session: AdvisorSession): SessionDocument {
    // Cosmos DB requires 'id'; map from sessionId.
    // If ttlSeconds is set, surface it as the Cosmos TTL field.
    const doc: SessionDocument = { ...session, id: session.sessionId };
    if (session.ttlSeconds !== undefined && session.ttlSeconds !== null) {
      (doc as unknown as Record<string, unknown>)['ttl'] = session.ttlSeconds;
    }
    return doc;
  }

  private fromDocument(doc: SessionDocument): AdvisorSession {
    // Strip Cosmos system fields before returning to callers.
    const { id: _id, ...rest } = doc as SessionDocument & Record<string, unknown>;
    void _id;
    return rest as AdvisorSession;
  }
}
