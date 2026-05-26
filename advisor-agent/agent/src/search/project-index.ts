/**
 * Azure AI Search client stub for Project similarity matching.
 * Powers the Step 1b Reuse Gate: after Phase 1 BXT, the agent searches the
 * Project index to surface similar existing work before recommending a new build.
 *
 * Index is queried using the agent's managed identity — no API keys.
 *
 * Microsoft Learn — Azure AI Search security with RBAC:
 * https://learn.microsoft.com/azure/search/search-security-rbac
 *
 * FR-005 — search existing Project briefs for similar work.
 * FR-006 — present similar Projects and let the user make the reuse decision.
 */

import { NotImplementedError } from "../errors.js";
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
// Stub implementation
// ---------------------------------------------------------------------------

/**
 * Stub — throws NotImplementedError.
 *
 * M1 will implement:
 * - Initialise SearchClient<ProjectSearchDocument> with the index name and
 *   ManagedIdentityCredential (no API key).
 * - Run a hybrid text + vector query using the text-embedding-3-small field
 *   (1536 dims, as confirmed in squad-open-questions-defaults.md #4).
 * - Map SearchResult<ProjectSearchDocument> to SimilarProjectMatch.
 *
 * Search index schema (Dallas owns, Parker mirrors in Bicep):
 *   projectId (key), name, summary (searchable + vector), owner, status,
 *   technologies[], tags[], linkedRequestCount, updatedAt.
 */
export class AzureProjectSearch implements IProjectSearch {
  findSimilar(_query: string, _topK: number): Promise<SimilarProjectMatch[]> {
    // M1: initialise SearchClient with managed identity, run hybrid query against
    // the project search index, and return ranked SimilarProjectMatch results.
    throw new NotImplementedError("AzureProjectSearch.findSimilar");
  }
}
