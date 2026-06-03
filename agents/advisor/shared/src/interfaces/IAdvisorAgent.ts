/**
 * IAdvisorAgent — the narrow "brain" seam.
 *
 * The agent is responsible ONLY for generating content:
 *   - the next clarifying question / phase summary, and
 *   - the final recommendation.
 *
 * It does NOT own phase progression, readiness gates, or persistence — those
 * remain in AgentOrchestrator (the deterministic state machine). This keeps a
 * single source of truth for "where are we" and avoids a second hidden
 * orchestrator inside the agent.
 *
 * Two implementations live in @advisor/api:
 *   - DeterministicAdvisorAgent (ADVISOR_AGENT_MODE=mock): scripted, offline,
 *     deterministic. Used by tests and the deployed default.
 *   - CopilotAdvisorAgent (ADVISOR_AGENT_MODE=copilot): real GitHub Copilot SDK
 *     agent that loads the microsoft-ai-decision-framework skill and reasons
 *     over intake + conversation + custom-instruction context.
 */

import type { AdvisorSession } from '../types/conversation.js';
import type { IntakeSubmission } from '../types/intake.js';
import type { CustomerGuidanceDocument } from '../types/guidance.js';
import type { PhaseId } from '../types/framework.js';
import type { TurnMessageType } from '../types/conversation.js';
import type { RecommendationOutput } from '../types/recommendation.js';

/**
 * Which kind of turn the orchestrator wants the agent to produce next.
 * The orchestrator's state machine decides the stage; the agent decides the
 * words.
 */
export type AdvisorStage =
  | 'phase1' // Phase 1 BXT clarifying question
  | 'phase2' // First Phase 2 technology-groupings question
  | 'phase2FollowUp' // Additional Phase 2 question (e.g. team skills)
  | 'phase3Summary'; // Phase 3 readiness summary before the recommendation

/** Everything the agent needs to generate the next turn or the recommendation. */
export interface AdvisorContext {
  session: AdvisorSession;
  intake: IntakeSubmission | null;
  guidance: CustomerGuidanceDocument | null;
  stage: AdvisorStage;
}

/**
 * A generated conversational turn (question or summary). The orchestrator wraps
 * this into a persisted ConversationTurn (adding ids, role, timestamp).
 */
export interface QuestionEnvelope {
  phase: PhaseId;
  messageType: TurnMessageType; // 'clarifyingQuestion' | 'summary'
  content: string;
  reasonAsked?: string;
  customInstructionAnswersUsed?: string[];
}

export interface IAdvisorAgent {
  /** Human-readable mode label for provenance/telemetry (e.g. 'deterministic', 'copilot'). */
  readonly name: string;

  /** Generate the next clarifying question or phase summary for the given stage. */
  generateQuestion(ctx: AdvisorContext): Promise<QuestionEnvelope>;

  /** Generate the final, grounded recommendation. */
  generateRecommendation(ctx: AdvisorContext): Promise<RecommendationOutput>;
}
