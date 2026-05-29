/**
 * Similar-project search contracts.
 *
 * Azure AI Search is the store for project knowledge. These types define
 * what a "similar project" looks like, how matches are scored and
 * explained, and how to represent a "no match found" result honestly.
 *
 * The projectKnowledgeDocument is the shape indexed into Azure AI Search.
 * The SimilarProjectMatch is what the API returns when queried.
 */

import type { CapabilityGrouping } from './framework.js';

// ---------------------------------------------------------------------------
// Match criteria — what counts as "similar"
// ---------------------------------------------------------------------------

export interface SimilarProjectSignals {
  /** e.g. "assistive conversational agent" */
  interactionPattern: string;
  /** e.g. "reactive plus risk-based proactive alerts" */
  proactivity: string;
  /** e.g. "grounded retrieval over business documents" */
  dataPattern: string;
  /** e.g. "draft and recommend only" */
  actionSafety: string;
  /** e.g. "human approval, citations, audit trail" */
  governancePattern: string;
}

export type SensitivityLevel = 'Low' | 'Medium' | 'High';
export type ProjectStatus =
  | 'inProgress'
  | 'recommended'
  | 'completed'
  | 'archived';

// ---------------------------------------------------------------------------
// Project knowledge document — indexed into Azure AI Search
// ---------------------------------------------------------------------------

export interface ProjectKnowledgeDocument {
  /** Matches the parent ProjectCase.projectCaseId */
  projectId: string;
  customerOrganizationId: string;
  title: string;
  summary: string;
  businessOutcome: string;
  industry: string;
  businessDomain: string;
  useCaseTags: string[];
  frameworkTags: (PhaseTag | CapabilityGrouping)[];
  technologyTags: string[];
  dataSourceTags: string[];
  sensitivityLevel: SensitivityLevel;
  status: ProjectStatus;
  /** Denormalized plain text for keyword search */
  searchableText: string;
  similarProjectSignals: SimilarProjectSignals;
}

/** Tags referencing the three-phase methodology used in frameworkTags */
export type PhaseTag =
  | 'phase1.businessImpactAssessment'
  | 'phase2.technologyGroupings'
  | 'phase3.scenarioSpecificSelection';

// ---------------------------------------------------------------------------
// Similar project match — returned by the search API
// ---------------------------------------------------------------------------

export interface SimilarProjectMatch {
  projectId: string;
  title: string;
  /** Relevance score from Azure AI Search (0.0 – 1.0) */
  score: number;
  matchRationale: string;
  technologies: string[];
  /** Present when the match is a partial or low-confidence result */
  caveats?: string;
}

/** Explicit "no match found" shape — never a silent empty array */
export interface NoMatchFound {
  noMatchFound: true;
  reason: string;
}

export type SimilarProjectResult = SimilarProjectMatch[] | NoMatchFound;

export function isNoMatchFound(
  result: SimilarProjectResult
): result is NoMatchFound {
  return !Array.isArray(result) && result.noMatchFound === true;
}

// ---------------------------------------------------------------------------
// Similar project search query + response
// ---------------------------------------------------------------------------

export interface SimilarProjectSearchQuery {
  query: string;
  indexName: string;
  topK: number;
  /** Optional filters: industry, domain, framework tags etc. */
  filters?: Record<string, string | string[]>;
}

export interface SimilarProjectSearchResult {
  query: SimilarProjectSearchQuery;
  matches: SimilarProjectResult;
  searchedAt: string;
}

