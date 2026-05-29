import type { IConversationStore } from '@advisor/shared';
import type { AdvisorSession, ConversationTurn, CapturedFact, ConversationReadinessState } from '@advisor/shared';

export class InMemoryConversationStore implements IConversationStore {
  private sessions = new Map<string, AdvisorSession>();

  async createSession(session: AdvisorSession): Promise<void> {
    this.sessions.set(session.sessionId, { ...session });
  }

  async loadSession(sessionId: string): Promise<AdvisorSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async appendTurn(sessionId: string, turn: ConversationTurn): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.conversationCapture.turns.push(turn);
    session.updatedAt = new Date().toISOString();
    session.lastActivityAt = session.updatedAt;
  }

  async appendFact(sessionId: string, fact: CapturedFact): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.conversationCapture.capturedFacts.push(fact);
    session.updatedAt = new Date().toISOString();
  }

  async updateReadinessState(sessionId: string, state: ConversationReadinessState): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.conversationCapture.readinessState = state;
    session.updatedAt = new Date().toISOString();
  }

  async updateSession(session: AdvisorSession): Promise<void> {
    this.sessions.set(session.sessionId, { ...session });
  }

  async endSession(sessionId: string, endedAt: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.conversationCapture.endedAt = endedAt;
    session.conversationCapture.readinessState = 'ended';
    session.updatedAt = new Date().toISOString();
  }
}
