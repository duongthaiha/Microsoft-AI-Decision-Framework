import type { AdvisorSession, ConversationTurn, CapturedFact, ConversationReadinessState } from '../types/conversation.js';
import type { ProjectFeedback } from '../types/project-case.js';

export interface IConversationStore {
  createSession(session: AdvisorSession): Promise<void>;
  loadSession(sessionId: string): Promise<AdvisorSession | null>;
  appendTurn(sessionId: string, turn: ConversationTurn): Promise<void>;
  appendFact(sessionId: string, fact: CapturedFact): Promise<void>;
  updateReadinessState(sessionId: string, state: ConversationReadinessState): Promise<void>;
  updateSession(session: AdvisorSession): Promise<void>;
  endSession(sessionId: string, endedAt: string): Promise<void>;
  /** Record user feedback on a recommendation. Throws if session not found. */
  submitFeedback(sessionId: string, feedback: ProjectFeedback): Promise<void>;
  /** Load previously submitted feedback for a session. Returns null if not yet rated. */
  loadFeedback(sessionId: string): Promise<ProjectFeedback | null>;
}
