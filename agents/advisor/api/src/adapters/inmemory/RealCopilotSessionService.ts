import type { ICopilotSessionService, CopilotSessionConfig, CopilotTool, CopilotSessionHandle } from '@advisor/shared';

/**
 * Real GitHub Copilot SDK adapter.
 * Selected via ADVISOR_AGENT_MODE=copilot environment variable.
 * Guards at runtime so it compiles without credentials.
 */
export class RealCopilotSessionService implements ICopilotSessionService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private skillPath: string;

  constructor(skillPath: string) {
    this.skillPath = skillPath;
    // Guard: only instantiate SDK client if credentials are available
    const token = process.env['GITHUB_TOKEN'] ?? process.env['COPILOT_TOKEN'];
    if (!token) {
      throw new Error(
        'RealCopilotSessionService requires GITHUB_TOKEN or COPILOT_TOKEN environment variable. ' +
        'Set ADVISOR_AGENT_MODE=mock for local development without credentials.',
      );
    }
    // Dynamic import to avoid compile-time failure if SDK is not installed
    this.initClient(token).catch((err: unknown) => {
      console.error('[RealCopilotSessionService] Failed to initialize SDK client:', err);
    });
  }

  private async initClient(token: string): Promise<void> {
    try {
      // @ts-expect-error — SDK may not be installed in all environments
      const { CopilotClient } = await import('@github/copilot-sdk');
      this.client = new CopilotClient({ token });
    } catch (err) {
      throw new Error(`Failed to load @github/copilot-sdk: ${String(err)}`);
    }
  }

  async createSession(config: CopilotSessionConfig, tools: CopilotTool[]): Promise<CopilotSessionHandle> {
    if (!this.client) throw new Error('Copilot SDK client not initialized');
    const session = await this.client.createSession({
      model: 'gpt-5.5',
      skillDirectories: [this.skillPath],
      systemPrompt: config.systemPrompt,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    });
    return { sessionId: config.organizationId, copilotSdkSessionId: session.sessionId as string };
  }

  async resumeSession(copilotSdkSessionId: string, tools: CopilotTool[]): Promise<CopilotSessionHandle> {
    if (!this.client) throw new Error('Copilot SDK client not initialized');
    const session = await this.client.resumeSession(copilotSdkSessionId, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    });
    return { sessionId: copilotSdkSessionId, copilotSdkSessionId: session.sessionId as string };
  }

  async sendPrompt(copilotSdkSessionId: string, prompt: string): Promise<string> {
    if (!this.client) throw new Error('Copilot SDK client not initialized');
    const response = await this.client.sendAndWait({ sessionId: copilotSdkSessionId, prompt });
    return response.content as string;
  }

  async endSession(copilotSdkSessionId: string): Promise<void> {
    if (!this.client) return;
    await this.client.endSession(copilotSdkSessionId);
  }
}
