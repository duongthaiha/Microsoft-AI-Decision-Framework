import type { ICopilotSessionService, CopilotSessionConfig, CopilotTool, CopilotSessionHandle } from '@advisor/shared';
/**
 * Real GitHub Copilot SDK adapter.
 * Selected via ADVISOR_AGENT_MODE=copilot environment variable.
 * Guards at runtime so it compiles without credentials.
 */
export declare class RealCopilotSessionService implements ICopilotSessionService {
    private client;
    private skillPath;
    constructor(skillPath: string);
    private initClient;
    createSession(config: CopilotSessionConfig, tools: CopilotTool[]): Promise<CopilotSessionHandle>;
    resumeSession(copilotSdkSessionId: string, tools: CopilotTool[]): Promise<CopilotSessionHandle>;
    sendPrompt(copilotSdkSessionId: string, prompt: string): Promise<string>;
    endSession(copilotSdkSessionId: string): Promise<void>;
}
//# sourceMappingURL=RealCopilotSessionService.d.ts.map