export interface CopilotSessionConfig {
  organizationId: string;
  userId?: string;
  skillPath: string; // path to .agents/skills/microsoft-ai-decision-framework
  systemPrompt: string;
}

export interface CopilotTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface CopilotSessionHandle {
  sessionId: string;
  copilotSdkSessionId: string;
}

export interface ICopilotSessionService {
  createSession(config: CopilotSessionConfig, tools: CopilotTool[]): Promise<CopilotSessionHandle>;
  resumeSession(copilotSdkSessionId: string, tools: CopilotTool[]): Promise<CopilotSessionHandle>;
  sendPrompt(copilotSdkSessionId: string, prompt: string): Promise<string>;
  endSession(copilotSdkSessionId: string): Promise<void>;
}
