import type { IConversationStore } from '@advisor/shared';
import type { AdvisorSession, ConversationTurn, CapturedFact, ConversationReadinessState } from '@advisor/shared';
export declare class InMemoryConversationStore implements IConversationStore {
    private sessions;
    createSession(session: AdvisorSession): Promise<void>;
    loadSession(sessionId: string): Promise<AdvisorSession | null>;
    appendTurn(sessionId: string, turn: ConversationTurn): Promise<void>;
    appendFact(sessionId: string, fact: CapturedFact): Promise<void>;
    updateReadinessState(sessionId: string, state: ConversationReadinessState): Promise<void>;
    updateSession(session: AdvisorSession): Promise<void>;
    endSession(sessionId: string, endedAt: string): Promise<void>;
}
//# sourceMappingURL=InMemoryConversationStore.d.ts.map