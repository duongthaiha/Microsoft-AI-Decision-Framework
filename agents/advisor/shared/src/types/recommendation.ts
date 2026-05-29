/**
 * Recommendation output contract.
 *
 * The primary POC success measure. Separates recommendation, rationale,
 * assumptions, decision evidence, custom-instruction influence,
 * similar-project highlights, trade-offs, and follow-up questions.
 * Must support combinations of Microsoft AI frameworks.
 */

import type { EvidenceSource } from './framework.js';

// ---------------------------------------------------------------------------
// Technology references in a recommendation
// ---------------------------------------------------------------------------

export interface RecommendedTechnology {
  name: string;
  /** The role this technology plays in the recommended solution */
  role: string;
}

export interface RecommendedApproach {
  summary: string;
  primaryTechnologies: RecommendedTechnology[];
  supportingTechnologies: RecommendedTechnology[];
}

// ---------------------------------------------------------------------------
// Rationale entry — each reason must cite evidence
// ---------------------------------------------------------------------------

export interface RationaleEntry {
  reason: string;
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Custom instruction influence on the recommendation
// ---------------------------------------------------------------------------

export interface CustomInstructionEffect {
  instructionId: string;
  effect: string;
}

// ---------------------------------------------------------------------------
// Trade-off entry
// ---------------------------------------------------------------------------

export interface TradeOffEntry {
  tradeOff: string;
  /** Whether this trade-off has been explicitly accepted for the POC */
  acceptedForPoc: boolean;
}

// ---------------------------------------------------------------------------
// Similar project highlight (summary for the recommendation output)
// ---------------------------------------------------------------------------

export interface SimilarProjectHighlight {
  projectId: string;
  title: string;
  whyItMatters: string;
}

// ---------------------------------------------------------------------------
// Recommendation status and confidence
// ---------------------------------------------------------------------------

export type RecommendationStatus =
  | 'awaitingEvidence'
  | 'recommendationReady'
  | 'humanReviewRequired'
  | 'insufficientEvidence';

export type RecommendationConfidence =
  | 'Low'
  | 'Medium'
  | 'Medium-High'
  | 'High';

// ---------------------------------------------------------------------------
// Full recommendation output
// ---------------------------------------------------------------------------

export interface RecommendationOutput {
  generatedAt: string;
  status: RecommendationStatus;
  confidence: RecommendationConfidence;
  recommendedApproach: RecommendedApproach;
  rationale: RationaleEntry[];
  customInstructionInfluence: CustomInstructionEffect[];
  tradeOffs: TradeOffEntry[];
  assumptions: string[];
  followUpQuestions: string[];
  similarProjectHighlights: SimilarProjectHighlight[];
  /**
   * Tracks which evidence sources contributed to the final recommendation.
   * Used to prove the recommendation is grounded, not hallucinated.
   */
  decisionEvidenceSources: EvidenceSource[];
}
