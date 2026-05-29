import { randomUUID } from 'node:crypto';
import type { ICopilotSessionService, CopilotSessionConfig, CopilotTool, CopilotSessionHandle } from '@advisor/shared';
import type { IConversationStore } from '@advisor/shared';
import type { IGuidanceStore } from '@advisor/shared';

export class MockCopilotSessionService implements ICopilotSessionService {
  constructor(
    private readonly conversationStore: IConversationStore,
    private readonly guidanceStore: IGuidanceStore,
  ) {
    void conversationStore;
    void guidanceStore;
  }

  async createSession(config: CopilotSessionConfig, _tools: CopilotTool[]): Promise<CopilotSessionHandle> {
    const copilotSdkSessionId = `mock-sdk-${randomUUID()}`;
    return { sessionId: config.organizationId, copilotSdkSessionId };
  }

  async resumeSession(copilotSdkSessionId: string, _tools: CopilotTool[]): Promise<CopilotSessionHandle> {
    return { sessionId: copilotSdkSessionId, copilotSdkSessionId };
  }

  async sendPrompt(copilotSdkSessionId: string, prompt: string): Promise<string> {
    // The mock doesn't actually process prompts in isolation.
    // The AgentOrchestrator calls this after determining what to say.
    // For the mock, we echo a structured acknowledgement.
    void copilotSdkSessionId;
    return `[MockSDK] Processed: ${prompt.slice(0, 80)}...`;
  }

  async endSession(_copilotSdkSessionId: string): Promise<void> {
    // No-op for mock
  }
}
