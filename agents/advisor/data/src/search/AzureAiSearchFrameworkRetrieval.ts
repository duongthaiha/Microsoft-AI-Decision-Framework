/**
 * AzureAiSearchFrameworkRetrieval — implements IFrameworkRetrievalService.
 *
 * Retrieves relevant framework content chunks from the framework-content index.
 * Falls back to InMemoryFrameworkRetrieval behavior when Azure Search is
 * unavailable or the query returns no results — the agent always gets something.
 *
 * Auth: DefaultAzureCredential. No keys in code.
 */

import { SearchClient, SearchIndexClient } from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  IFrameworkRetrievalService,
  FrameworkRetrievalQuery,
  FrameworkRetrievalResult,
} from '@advisor/shared';
import { FRAMEWORK_CONTENT_INDEX_DEFINITION } from './frameworkContentIndexDefinition.js';

/** Shape stored in the framework-content index. */
interface FrameworkChunkDocument {
  id: string;
  source: string;
  documentTitle: string;
  chunkIndex: number;
  phase: string;
  sectionHeading: string;
  content: string;
}

export interface AzureAiSearchFrameworkRetrievalOptions {
  /** Azure AI Search service endpoint */
  endpoint: string;
  /** Index name (default: 'framework-content') */
  indexName?: string;
  /** Local skill path for fallback (mirrors InMemoryFrameworkRetrieval behavior) */
  skillPath?: string;
}

const DEFAULT_INDEX_NAME = 'framework-content';
const MAX_CHUNK_LENGTH = 2000;

export class AzureAiSearchFrameworkRetrieval implements IFrameworkRetrievalService {
  private readonly searchClient: SearchClient<FrameworkChunkDocument>;
  private readonly indexClient: SearchIndexClient;
  private readonly options: Required<AzureAiSearchFrameworkRetrievalOptions>;
  private localFallback: Array<{ content: string; source: string }> = [];

  constructor(options: AzureAiSearchFrameworkRetrievalOptions) {
    this.options = {
      endpoint: options.endpoint,
      indexName: options.indexName ?? DEFAULT_INDEX_NAME,
      skillPath: options.skillPath ?? '',
    };
    const credential = new DefaultAzureCredential();
    this.searchClient = new SearchClient<FrameworkChunkDocument>(
      this.options.endpoint,
      this.options.indexName,
      credential
    );
    this.indexClient = new SearchIndexClient(this.options.endpoint, credential);
    this.loadLocalFallback();
  }

  /**
   * Creates or updates the framework-content index definition.
   */
  async ensureIndex(): Promise<void> {
    await this.indexClient.createOrUpdateIndex(FRAMEWORK_CONTENT_INDEX_DEFINITION);
  }

  async retrieve(query: FrameworkRetrievalQuery): Promise<FrameworkRetrievalResult[]> {
    const topK = query.topK ?? 3;

    try {
      const searchOptions: Parameters<typeof this.searchClient.search>[1] = {
        top: topK,
        select: ['id', 'source', 'sectionHeading', 'content', 'phase'],
      };

      if (query.phase) {
        searchOptions.filter = `phase eq '${query.phase}'`;
      }

      const results = await this.searchClient.search(query.query, searchOptions);
      const items: FrameworkRetrievalResult[] = [];

      for await (const result of results.results) {
        items.push({
          content: result.document.content.slice(0, MAX_CHUNK_LENGTH),
          source: `${result.document.source}#${result.document.sectionHeading}`,
        });
      }

      if (items.length > 0) return items;
    } catch {
      // Azure Search unavailable — fall through to local fallback
    }

    return this.localRetrieve(query, topK);
  }

  /**
   * Uploads a batch of framework content chunks into the index.
   * Called by FrameworkContentIndexer.
   */
  async uploadChunks(chunks: FrameworkChunkDocument[]): Promise<void> {
    const BATCH_SIZE = 100;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      await this.searchClient.uploadDocuments(chunks.slice(i, i + BATCH_SIZE));
    }
  }

  // ---------------------------------------------------------------------------
  // Local fallback — mirrors InMemoryFrameworkRetrieval behavior
  // ---------------------------------------------------------------------------

  private loadLocalFallback(): void {
    if (!this.options.skillPath) return;
    const refsPath = resolve(this.options.skillPath, 'references');
    if (!existsSync(refsPath)) return;
    try {
      const files = readdirSync(refsPath).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const content = readFileSync(join(refsPath, file), 'utf-8');
        this.localFallback.push({ source: `references/${file}`, content });
      }
    } catch {
      // ignore — if local files aren't readable, we rely on Azure Search alone
    }
  }

  private localRetrieve(query: FrameworkRetrievalQuery, topK: number): FrameworkRetrievalResult[] {
    if (this.localFallback.length === 0) return [];
    const q = query.query.toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 3);

    const scored = this.localFallback
      .map((doc) => {
        const lc = doc.content.toLowerCase();
        const hits = words.filter((w) => lc.includes(w)).length;
        const score = words.length > 0 ? hits / words.length : 0;
        return { ...doc, score };
      })
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map((d) => ({
      content: d.content.slice(0, MAX_CHUNK_LENGTH),
      source: d.source,
    }));
  }
}
