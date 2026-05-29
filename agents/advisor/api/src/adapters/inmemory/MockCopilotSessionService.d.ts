import type { ICopilotSessionService, CopilotSessionConfig, CopilotTool, CopilotSessionHandle } from '@advisor/shared';
import type { IConversationStore } from '@advisor/shared';
import type { IGuidanceStore } from '@advisor/shared';
export declare class MockCopilotSessionService implements ICopilotSessionService {
    private readonly conversationStore;
    private readonly guidanceStore;
    constructor(conversationStore: IConversationStore, guidanceStore: IGuidanceStore);
    createSession(config: CopilotSessionConfig, _tools: CopilotTool[]): Promise<CopilotSessionHandle>;
    resumeSession(copilotSdkSessionId: string, _tools: CopilotTool[]): Promise<CopilotSessionHandle>;
    sendPrompt(copilotSdkSessionId: string, prompt: string): Promise<string>;
    endSession(_copilotSdkSessionId: string): Promise<void>;
}
//# sourceMappingURL=MockCopilotSessionService.d.ts.map