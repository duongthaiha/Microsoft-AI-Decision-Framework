/**
 * Project case contract — the full end-to-end record for one advisor engagement.
 *
 * Derived from sample-project-data-nfum.json. This is the canonical shape
 * that spans intake, conversation capture, recommendation output, and Azure
 * AI Search projection.
 *
 * Storage split:
 *   Cosmos DB: session, activeCustomInstructions, intakeSubmission,
 *              conversationCapture, decisionFrameworkEvidence,
 *              recommendationOutput, feedback
 *   Azure AI Search: projectKnowledgeDocument (projection for lookup)
 */

import type { IntakeSubmission } from './intake.js';
import type { DecisionFrameworkEvidence } from './framework.js';
import type { RecommendationOutput } from './recommendation.js';
import type { SimilarProjectSearchResult } from './similar-projects.js';
import type { ProjectKnowledgeDocument } from './similar-projects.js';
import type { CustomerGuidanceDocument } from './guidance.js';

// ---------------------------------------------------------------------------
// Customer organization metadata
// ---------------------------------------------------------------------------

export interface CustomerOrganization {
  organizationId: string;
  name: string;
  country: string;
  industry: string;
  businessDomain: string;
}

// ---------------------------------------------------------------------------
// Respondent metadata
// ---------------------------------------------------------------------------

export interface Respondent {
  name?: string;
  role?: string;
  areaOfExpertise?: string;
}

// ---------------------------------------------------------------------------
// Feedback captured after a recommendation
// ---------------------------------------------------------------------------

export type ReviewStatus =
  | 'pendingStakeholderReview'
  | 'approved'
  | 'rejected'
  | 'archived';

export interface ProjectFeedback {
  /** 1 (not useful) to 5 (very useful), or null if not yet rated */
  userRating: number | null;
  userComment: string | null;
  reviewStatus: ReviewStatus;
}

// ---------------------------------------------------------------------------
// Persistence target metadata
// ---------------------------------------------------------------------------

export interface PersistenceTargets {
  cosmosDb: string[];
  azureAiSearch: string[];
}

// ---------------------------------------------------------------------------
// Full project case
// ---------------------------------------------------------------------------

export interface ProjectCase {
  schemaVersion: string;
  recordType: 'advisorProjectCase';
  projectCaseId: string;
  createdAt: string;
  updatedAt?: string;
  sourceArtifacts?: {
    intakeFormTemplate?: string;
    decisionFrameworkSkill?: string;
  };
  persistenceTargets?: PersistenceTargets;
  customerOrganization: CustomerOrganization;
  respondent: Respondent;
  /**
   * Snapshot of the active custom instructions at the time of the session.
   * The live document lives in Cosmos DB; this is a point-in-time copy.
   */
  activeCustomInstructions: Pick<
    CustomerGuidanceDocument,
    | 'instructionSetId'
    | 'version'
    | 'scope'
    | 'activeFrom'
    | 'organizationContext'
    | 'instructions'
  >;
  intakeSubmission: IntakeSubmission;
  conversationCapture: import('./conversation.js').ConversationCapture;
  decisionFrameworkEvidence: DecisionFrameworkEvidence;
  similarProjectSearch: SimilarProjectSearchResult & {
    /** The search query text sent to Azure AI Search */
    query: string;
    indexName: string;
    topK: number;
  };
  recommendationOutput: RecommendationOutput;
  /**
   * Projection indexed into Azure AI Search for similar-project lookup.
   * Not stored in Cosmos DB.
   */
  projectKnowledgeDocument: ProjectKnowledgeDocument;
  feedback: ProjectFeedback;
}
