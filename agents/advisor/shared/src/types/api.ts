/**
 * API request and response DTOs.
 *
 * All API interactions use these typed shapes. No silent fallbacks:
 * errors are always typed ApiError instances.
 *
 * Endpoints:
 *   POST   /sessions                       → CreateSessionResponse
 *   POST   /sessions/:id/intake            → SubmitIntakeResponse
 *   POST   /sessions/:id/messages          → SendMessageResponse
 *   GET    /sessions/:id/messages/latest   → GetResponseResponse
 *   GET    /sessions/:id/recommendation    → RetrieveRecommendationResponse
 *   GET    /sessions/:id/similar-projects  → RetrieveSimilarProjectsResponse
 *   DELETE /sessions/:id                   → EndSessionResponse
 */

import type { IntakeSubmission } from './intake.js';
import type { RecommendationOutput } from './recommendation.js';
import type { SimilarProjectSearchResult } from './similar-projects.js';
import type { ConversationTurn } from './conversation.js';

// ---------------------------------------------------------------------------
// Typed API error — no silent failures
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'MODEL_FAILURE'
  | 'MISSING_CONTEXT'
  | 'SEARCH_FAILURE'
  | 'INVALID_SESSION'
  | 'INTAKE_ALREADY_SUBMITTED'
  | 'RECOMMENDATION_NOT_READY'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Machine-readable detail (stack omitted in production) */
  detail?: string;
  /** Correlation ID for log tracing */
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// Shared envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ---------------------------------------------------------------------------
// POST /sessions — create a new advisor session
// ---------------------------------------------------------------------------

export interface CreateSessionRequest {
  customerOrganizationId: string;
  /** Opaque user identifier, Entra-issued subject claim */
  userId?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  createdAt: string;
  /** ID of the active instruction set loaded for this session */
  activeInstructionSetId?: string;
}

// ---------------------------------------------------------------------------
// POST /sessions/:id/intake — submit the intake form
// ---------------------------------------------------------------------------

export interface SubmitIntakeRequest {
  intake: IntakeSubmission;
}

export interface SubmitIntakeResponse {
  sessionId: string;
  submittedAt: string;
  /** The first agent turn generated after intake was processed */
  firstAgentTurn?: ConversationTurn;
}

// ---------------------------------------------------------------------------
// POST /sessions/:id/messages — send a user message
// ---------------------------------------------------------------------------

export interface SendMessageRequest {
  content: string;
  /** Client-generated turn ID (idempotency key) */
  clientTurnId?: string;
}

export interface SendMessageResponse {
  sessionId: string;
  userTurnId: string;
  agentTurn: ConversationTurn;
  /** Updated readiness state after this turn */
  readinessState: string;
}

// ---------------------------------------------------------------------------
// GET /sessions/:id/messages/latest — get latest agent response
// ---------------------------------------------------------------------------

export interface GetResponseResponse {
  sessionId: string;
  latestAgentTurn: ConversationTurn;
  readinessState: string;
}

// ---------------------------------------------------------------------------
// GET /sessions/:id/recommendation — retrieve recommendation
// ---------------------------------------------------------------------------

export interface RetrieveRecommendationResponse {
  sessionId: string;
  recommendation: RecommendationOutput;
}

// ---------------------------------------------------------------------------
// GET /sessions/:id/similar-projects — retrieve similar projects
// ---------------------------------------------------------------------------

export interface RetrieveSimilarProjectsResponse {
  sessionId: string;
  searchResult: SimilarProjectSearchResult;
}

// ---------------------------------------------------------------------------
// DELETE /sessions/:id — end session
// ---------------------------------------------------------------------------

export interface EndSessionResponse {
  sessionId: string;
  endedAt: string;
}
