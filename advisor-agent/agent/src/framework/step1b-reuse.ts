/**
 * Step 1b — Reuse Gate.
 *
 * After Phase 1 BXT completes, the advisor searches existing Projects for
 * similar work and presents matches to the user.  The user then decides:
 *   - Link the Request to an existing Project (extend / build on top of it).
 *   - Continue as a new project candidate (nothing close enough exists).
 *
 * This is not a replacement for the framework — it is the reuse checkpoint
 * that prevents the advisor from recommending a new build when the organisation
 * already has a nearby Project on the shelf.
 *
 * see product-spec.md §4, lines 149-150 — "Step 1b: Reuse Gate"
 * FR-005 — search existing Project briefs for similar work.
 * FR-006 — present similar Projects and let the user link or continue.
 */

import { NotImplementedError } from "../errors.js";
import type { Project, ReuseGateDecision, SimilarProjectMatch } from "../data/models.js";
import type { IProjectSearch } from "../search/project-index.js";
import type { Request } from "../data/models.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReuseGateInput {
  request: Request;
  projectSearch: IProjectSearch;
  /** Number of top matches to retrieve and present to the user. */
  topK?: number;
}

export interface ReuseGateResult {
  /** Ordered list of similar Projects (highest score first). */
  matches: SimilarProjectMatch[];
  /** The synthesised query string sent to the search index. */
  query: string;
}

export type { ReuseGateDecision };

// ---------------------------------------------------------------------------
// Stub
// ---------------------------------------------------------------------------

/**
 * Runs the Reuse Gate search for similar Projects.
 *
 * M1 will implement:
 * - Synthesise a search query from the Request's businessOutcome, targetUsers,
 *   and desiredBehavior (the intake summary).
 * - Call projectSearch.findSimilar(query, topK) to get ranked matches.
 * - Return matches and the query string so the caller can present results to the user.
 * - The user's link / continue decision is recorded separately as a ReuseGateDecision
 *   and stored on the Request document.
 */
export async function runReuseGate(
  _input: ReuseGateInput
): Promise<ReuseGateResult> {
  // M1: synthesise query from intake fields, call AI Search, return ranked matches.
  throw new NotImplementedError("runReuseGate");
}

/**
 * Records the user's reuse decision onto a partial Request update.
 * Returns the patch to be applied via IRequestStore.updateRequest.
 */
export function buildReuseDecisionPatch(
  decision: ReuseGateDecision
): Pick<Request, "reuseDecision" | "linkedProjectId"> {
  return {
    reuseDecision: decision,
    linkedProjectId: decision.selectedProjectId,
  };
}

// Re-export Project type so callers don't need a second import.
export type { Project };
