import type { AdvisorSession, ConversationTurn, IntakeSubmission, RecommendationOutput, SimilarProjectResult } from '@advisor/shared';
import type { IConversationStore, IGuidanceStore, IProjectSearchService, IFrameworkRetrievalService } from '@advisor/shared';
import type { ICopilotSessionService } from '@advisor/shared';
export interface OrchestratorDeps {
    conversationStore: IConversationStore;
    guidanceStore: IGuidanceStore;
    projectSearch: IProjectSearchService;
    frameworkRetrieval: IFrameworkRetrievalService;
    copilotService: ICopilotSessionService;
    skillPath: string;
}
export declare class AgentOrchestrator {
    private readonly deps;
    constructor(deps: OrchestratorDeps);
    processIntake(session: AdvisorSession, intake: IntakeSubmission): Promise<ConversationTurn>;
    processMessage(session: AdvisorSession, userContent: string): Promise<{
        agentTurn: ConversationTurn;
        readinessState: string;
    }>;
    buildRecommendation(session: AdvisorSession): Promise<RecommendationOutput>;
    searchSimilarProjects(session: AdvisorSession): Promise<SimilarProjectResult>;
    private extractIntakeFromSession;
    private generatePhase1Question;
    private generatePhase2Question;
    private isPhase2Complete;
    private generatePhase2FollowUp;
    private generatePhase3Summary;
    private generateRecommendation;
    private buildRecommendationOutput;
    private buildCriticalQuestions;
    private buildRationale;
    private buildTradeOffs;
    private describeInstructionEffect;
}
//# sourceMappingURL=AgentOrchestrator.d.ts.map