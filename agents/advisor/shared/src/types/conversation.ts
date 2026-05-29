/**
 * Conversation and session types.
 *
 * Cosmos DB stores conversation history, session state, and captured facts.
 * Each turn carries the phase it belongs to and which evidence sources
 * contributed to the agent's response, so readiness state is traceable.
 */

import type { EvidenceSource, PhaseId } from './framework.js';

// ---------------------------------------------------------------------------
// Individual conversation turn
// ---------------------------------------------------------------------------

export type TurnRole = 'agent' | 'user' | 'system';

export type TurnMessageType =
  | 'clarifyingQuestion'
  | 'answer'
  | 'summary'
  | 'recommendation'
  | 'followUp'
  | 'error';

export interface ConversationTurn {
  turnId: string;
  role: TurnRole;
  messageType: TurnMessageType;
  /** The phase of the Decision Framework this turn belongs to */
  phase?: PhaseId;
  content: string;
  /** If the agent used custom instructions to avoid asking this question */
  customInstructionAnswersUsed?: string[];
  /** Why this question was asked (agent reasoning, recorded for audit) */
  reasonAsked?: string;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Captured facts — extracted from the conversation for downstream use
// ---------------------------------------------------------------------------

export interface CapturedFact {
  factId: string;
  /** The turn from which this fact was extracted */
  sourceTurnId: string;
  text: string;
  /** Which framework questions this fact informs */
  usedFor: string[];
  /** The source type of this fact */
  evidenceSource?: EvidenceSource;
}

// ---------------------------------------------------------------------------
// Phase readiness state
// ---------------------------------------------------------------------------

export type PhaseReadiness = 'notStarted' | 'inProgress' | 'ready' | 'skipped';

export interface PhaseReadinessState {
  phase: PhaseId;
  readiness: PhaseReadiness;
  /** Evidence items that satisfy readiness for this phase */
  evidenceItems: Array<{
    description: string;
    source: EvidenceSource;
  }>;
  /** Questions still needed before this phase is considered ready */
  missingEvidence: string[];
}

// ---------------------------------------------------------------------------
// Conversation capture (stored in Cosmos DB)
// ---------------------------------------------------------------------------

export type ConversationReadinessState =
  | 'awaitingIntake'
  | 'phase1InProgress'
  | 'phase2InProgress'
  | 'phase3InProgress'
  | 'readyForRecommendation'
  | 'recommendationDelivered'
  | 'ended';

export interface ConversationCapture {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  turns: ConversationTurn[];
  capturedFacts: CapturedFact[];
  /** The overall readiness state of the conversation */
  readinessState?: ConversationReadinessState;
  /** Per-phase readiness breakdown */
  phaseReadiness?: PhaseReadinessState[];
}

// ---------------------------------------------------------------------------
// Session (the durable record combining all state for one advisor interaction)
// ---------------------------------------------------------------------------

export interface AdvisorSession {
  /** The unique session identifier — also the Cosmos DB document ID */
  sessionId: string;
  customerOrganizationId: string;
  /** User identifier (opaque, Entra-issued subject claim) */
  userId?: string;
  createdAt: string;
  updatedAt: string;
  /** UTC timestamp of the most recent activity */
  lastActivityAt: string;
  /** ID of the active custom instruction set loaded for this session */
  activeInstructionSetId?: string;
  /** ID of the Copilot SDK session (for resumability) */
  copilotSdkSessionId?: string;
  conversationCapture: ConversationCapture;
  /** Cosmos DB TTL in seconds — null means no expiry */
  ttlSeconds?: number | null;
}
