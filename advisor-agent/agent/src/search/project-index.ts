/**
 * Azure AI Search client for Project similarity matching.
 * Powers the Step 1b Reuse Gate: after Phase 1 BXT, the agent searches the
 * system-inventory-v1 index to surface similar existing work before recommending
 * a new build.
 *
 * Hybrid query: vector + BM25 + semantic re-rank on system-inventory-v1.
 * Filter: status eq 'active'. Top 5, confidence_score >= 0.5.
 * Authentication: ManagedIdentityCredential (agent MI has Search Index Data Reader).
 *
 * Microsoft Learn — Azure AI Search hybrid query:
 * https://learn.microsoft.com/azure/search/hybrid-search-how-to-query
 *
 * FR-005 — search existing Project briefs for similar work.
 * FR-006 — present similar Projects and let the user make the reuse decision.
 */

import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import type { TokenCredential } from "@azure/identity";
import type { SimilarProjectMatch } from "../data/models.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IProjectSearch {
  /**
   * Finds the top-K Projects most similar to the given query string.
   * The query is typically synthesised from the user's businessOutcome,
   * targetUsers, and desiredBehavior fields (the intake summary).
   *
   * Returns an ordered list of matches (highest score first).
   */
  findSimilar(query: string, topK: number): Promise<SimilarProjectMatch[]>;
}

// ---------------------------------------------------------------------------
// Search document shape matching system-inventory-v1 index schema
// ---------------------------------------------------------------------------

interface SystemInventoryDoc {
  id: string;
  name: string;
  description: string;
  capabilities?: string[];
  domain?: string;
  owner_team?: string;
  status?: string;
  stack?: string[];
  data_sources?: string[];
  confidence_score?: number;
  org_id?: string;
}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

const INDEX_NAME = "system-inventory-v1";

export class AzureProjectSearch implements IProjectSearch {
  private readonly searchClient: SearchClient<SystemInventoryDoc>;

  constructor(endpoint: string, credential: TokenCredential | AzureKeyCredential) {
    this.searchClient = new SearchClient<SystemInventoryDoc>(endpoint, INDEX_NAME, credential);
  }

  async findSimilar(query: string, topK: number): Promise<SimilarProjectMatch[]> {
    const results = await this.searchClient.search(query, {
      top: topK,
      filter: "status eq 'active'",
      queryType: "semantic",
      semanticSearchOptions: {
        configurationName: "default-semantic-config",
      },
      vectorSearchOptions: {
        queries: [
          {
            kind: "text" as const,
            text: query,
            fields: ["description_vector" as keyof SystemInventoryDoc],
            kNearestNeighborsCount: topK,
          },
        ],
      },
      select: ["id", "name", "description", "capabilities", "domain", "owner_team", "status", "stack", "confidence_score"],
    });

    const matches: SimilarProjectMatch[] = [];
    for await (const result of results.results) {
      const doc = result.document;
      const score = (result as { rerankerScore?: number }).rerankerScore ?? (result.score ?? 0);
      const confidenceScore = doc.confidence_score ?? score;

      if (confidenceScore < 0.5) continue;

      matches.push({
        projectId: doc.id,
        name: doc.name,
        score: confidenceScore,
        summary: doc.description || "",
        technologies: [...(doc.capabilities ?? []), ...(doc.stack ?? [])],
      });
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}
