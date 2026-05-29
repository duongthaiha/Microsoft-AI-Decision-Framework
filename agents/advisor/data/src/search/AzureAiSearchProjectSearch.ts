/**
 * AzureAiSearchProjectSearch — implements IProjectSearchService.
 *
 * Performs hybrid search (BM25 keyword + optional semantic re-ranking) over
 * the project-knowledge index to find similar prior projects.
 *
 * Ranking strategy (see docs/search-index.md for full rationale):
 *  1. Full-text BM25 match over searchableText, title, summary, tags.
 *  2. Semantic re-ranking when tier supports it (Standard+).
 *  3. Similarity signals (interactionPattern, dataPattern, governancePattern)
 *     are searchable text fields, boosting matches when present in query.
 *  4. If no result exceeds the minimum score threshold, returns NoMatchFound
 *     with an honest reason — never a silent empty array.
 *
 * Auth: DefaultAzureCredential. No keys in code.
 */

import { SearchClient, SearchIndexClient } from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import type { IProjectSearchService, SimilarProjectResult, SimilarProjectSearchQuery } from '@advisor/shared';
import { PROJECT_KNOWLEDGE_INDEX_DEFINITION } from './projectKnowledgeIndexDefinition.js';

/** Flat shape stored in the Azure AI Search index. */
interface ProjectSearchDocument {
  id: string;
  projectId: string;
  customerOrganizationId: string;
  title: string;
  summary: string;
  businessOutcome: string;
  industry: string;
  businessDomain: string;
  useCaseTags: string[];
  frameworkTags: string[];
  technologyTags: string[];
  dataSourceTags: string[];
  sensitivityLevel: string;
  status: string;
  searchableText: string;
  interactionPattern: string;
  proactivity: string;
  dataPattern: string;
  actionSafety: string;
  governancePattern: string;
}

export interface AzureAiSearchProjectSearchOptions {
  /** Azure AI Search service endpoint */
  endpoint: string;
  /** Index name (default: 'project-knowledge') */
  indexName?: string;
  /**
   * Minimum Azure AI Search score to include a result.
   * Results below this threshold are treated as not similar enough.
   * BM25 scores are unbounded; 0.5 is a reasonable POC threshold.
   */
  minimumScore?: number;
  /** Whether to request semantic re-ranking (requires Standard tier) */
  semanticSearch?: boolean;
}

const DEFAULT_MIN_SCORE = 0.5;
const DEFAULT_INDEX_NAME = 'project-knowledge';

export class AzureAiSearchProjectSearch implements IProjectSearchService {
  private readonly searchClient: SearchClient<ProjectSearchDocument>;
  private readonly indexClient: SearchIndexClient;
  private readonly options: Required<AzureAiSearchProjectSearchOptions>;

  constructor(options: AzureAiSearchProjectSearchOptions) {
    this.options = {
      endpoint: options.endpoint,
      indexName: options.indexName ?? DEFAULT_INDEX_NAME,
      minimumScore: options.minimumScore ?? DEFAULT_MIN_SCORE,
      semanticSearch: options.semanticSearch ?? false,
    };
    const credential = new DefaultAzureCredential();
    this.searchClient = new SearchClient<ProjectSearchDocument>(
      this.options.endpoint,
      this.options.indexName,
      credential
    );
    this.indexClient = new SearchIndexClient(this.options.endpoint, credential);
  }

  /**
   * Creates or updates the project-knowledge index definition.
   * Call once during infra provisioning or seed loading.
   */
  async ensureIndex(): Promise<void> {
    await this.indexClient.createOrUpdateIndex(PROJECT_KNOWLEDGE_INDEX_DEFINITION);
  }

  async similarProjects(query: SimilarProjectSearchQuery): Promise<SimilarProjectResult> {
    // Compute OData filter from query.filters
    let filter: string | undefined;
    if (query.filters && Object.keys(query.filters).length > 0) {
      const clauses: string[] = [];
      for (const [field, value] of Object.entries(query.filters)) {
        if (Array.isArray(value)) {
          clauses.push(`search.in(${field}, '${value.join(',')}', ',')`);
        } else {
          clauses.push(`${field} eq '${value}'`);
        }
      }
      if (clauses.length > 0) filter = clauses.join(' and ');
    }

    // BaseSearchRequestOptions also carries queryType?: QueryType, which creates
    // an intersection with SearchRequestQueryTypeOptions that TypeScript can't
    // satisfy from a conditional spread. A type assertion is the idiomatic escape hatch.
    type RawOpts = NonNullable<Parameters<typeof this.searchClient.search>[1]>;

    const baseOpts = {
      top: query.topK,
      select: [
        'id', 'projectId', 'title', 'summary', 'technologyTags',
        'interactionPattern', 'dataPattern', 'governancePattern',
        'industry', 'businessDomain', 'useCaseTags', 'sensitivityLevel',
      ],
      filter,
    };

    const opts: RawOpts = this.options.semanticSearch
      ? ({ ...baseOpts, queryType: 'semantic', semanticSearchOptions: { configurationName: 'project-semantic' } } as RawOpts)
      : (baseOpts as RawOpts);

    const rawResults = await this.searchClient.search(query.query, opts);

    const matches: Array<{
      doc: ProjectSearchDocument;
      score: number;
    }> = [];

    for await (const result of rawResults.results) {
      const score = result.score ?? 0;
      if (score < this.options.minimumScore) continue;
      matches.push({ doc: result.document as ProjectSearchDocument, score });
    }

    if (matches.length === 0) {
      return {
        noMatchFound: true,
        reason: `No projects in the index scored above the similarity threshold for: "${query.query}". This may mean the POC portfolio does not yet contain a comparable use case.`,
      };
    }

    return matches.map(({ doc, score }) => ({
      projectId: doc.projectId,
      title: doc.title,
      score: this.normaliseScore(score),
      matchRationale: this.buildRationale(doc),
      technologies: doc.technologyTags,
    }));
  }

  /**
   * Indexes a batch of project search documents.
   * Called by the seed loader and the post-recommendation indexing path.
   */
  async uploadDocuments(documents: ProjectSearchDocument[]): Promise<void> {
    await this.searchClient.uploadDocuments(documents);
  }

  /**
   * Converts a ProjectKnowledgeDocument (from @advisor/shared) into the
   * flat search document shape required by this index.
   */
  static toSearchDocument(
    doc: import('@advisor/shared').ProjectKnowledgeDocument
  ): ProjectSearchDocument {
    return {
      id: doc.projectId,
      projectId: doc.projectId,
      customerOrganizationId: doc.customerOrganizationId,
      title: doc.title,
      summary: doc.summary,
      businessOutcome: doc.businessOutcome,
      industry: doc.industry,
      businessDomain: doc.businessDomain,
      useCaseTags: doc.useCaseTags,
      frameworkTags: doc.frameworkTags as string[],
      technologyTags: doc.technologyTags,
      dataSourceTags: doc.dataSourceTags,
      sensitivityLevel: doc.sensitivityLevel,
      status: doc.status,
      searchableText: doc.searchableText,
      interactionPattern: doc.similarProjectSignals.interactionPattern,
      proactivity: doc.similarProjectSignals.proactivity,
      dataPattern: doc.similarProjectSignals.dataPattern,
      actionSafety: doc.similarProjectSignals.actionSafety,
      governancePattern: doc.similarProjectSignals.governancePattern,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Normalises Azure AI Search BM25 scores (unbounded) to a 0–1 range
   * suitable for returning to callers. Uses a simple sigmoid squash.
   */
  private normaliseScore(rawScore: number): number {
    return Math.min(1, rawScore / (rawScore + 1));
  }

  /**
   * Builds a human-readable match rationale from the document fields.
   * Describes the dimensions that make it a useful comparison.
   */
  private buildRationale(doc: ProjectSearchDocument): string {
    const parts: string[] = [];
    if (doc.industry) parts.push(`${doc.industry} industry`);
    if (doc.businessDomain) parts.push(`${doc.businessDomain} domain`);
    if (doc.interactionPattern) parts.push(`${doc.interactionPattern} interaction pattern`);
    if (doc.dataPattern) parts.push(`${doc.dataPattern} data pattern`);
    if (doc.governancePattern) parts.push(`${doc.governancePattern} governance`);
    if (doc.useCaseTags.length > 0) parts.push(`use cases: ${doc.useCaseTags.join(', ')}`);
    return parts.length > 0
      ? `Similar on: ${parts.join('; ')}.`
      : 'Keyword and semantic similarity to query text.';
  }
}
