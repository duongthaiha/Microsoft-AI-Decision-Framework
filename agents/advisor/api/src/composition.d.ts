import { AgentOrchestrator } from './agent/AgentOrchestrator.js';
import type { IConversationStore, IGuidanceStore, IProjectSearchService, IFrameworkRetrievalService, ICopilotSessionService } from '@advisor/shared';
export interface AppDependencies {
    conversationStore: IConversationStore;
    guidanceStore: IGuidanceStore;
    projectSearch: IProjectSearchService;
    frameworkRetrieval: IFrameworkRetrievalService;
    copilotService: ICopilotSessionService;
    orchestrator: AgentOrchestrator;
    skillPath: string;
}
export declare function buildDependencies(): AppDependencies;
//# sourceMappingURL=composition.d.ts.map