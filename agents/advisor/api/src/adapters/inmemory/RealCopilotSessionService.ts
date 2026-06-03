/**
 * Real GitHub Copilot SDK adapter (ICopilotSessionService).
 * Selected via ADVISOR_AGENT_MODE=copilot.
 *
 * Rewritten to the actual @github/copilot-sdk API:
 *  - client: new CopilotClient({ gitHubToken, useLoggedInUser:false })
 *  - tools: defineTool(name, { description, parameters, handler }) — handlers
 *    are RETAINED so the model can actually call them.
 *  - session: client.createSession({ model, skillDirectories, tools,
 *    systemMessage: { mode:'append', content } })
 *  - prompt: session.sendAndWait({ prompt }) → response?.data.content
 *
 * The SDK is loaded via a `CopilotSdkLoader` seam (default = dynamic import of
 * @github/copilot-sdk). The seam lets tests assert that tools, skillDirectories
 * and systemMessage are wired correctly without a live CLI or token, and keeps
 * the package building when the SDK is absent.
 */

import type {
  ICopilotSessionService,
  CopilotSessionConfig,
  CopilotTool,
  CopilotSessionHandle,
} from '@advisor/shared';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../../logger.js';

/** Minimal shape of an SDK session we depend on. */
export interface SdkSessionLike {
  readonly sessionId: string;
  sendAndWait(
    options: { prompt: string },
    timeout?: number,
  ): Promise<{ data?: { content?: string } } | undefined>;
  /** Releases SDK-side session resources. Optional so fakes need not implement it. */
  disconnect?: () => Promise<void>;
}

/** Minimal shape of the SDK client we depend on. */
export interface SdkClientLike {
  createSession(config: Record<string, unknown>): Promise<SdkSessionLike>;
  stop?: () => Promise<unknown>;
}

/** defineTool-style factory the SDK exposes. */
export type SdkDefineTool = (
  name: string,
  config: {
    description?: string;
    parameters?: Record<string, unknown>;
    handler?: (args: unknown) => Promise<unknown> | unknown;
    skipPermission?: boolean;
  },
) => unknown;

/** BYOK provider config passed to createSession (Azure AI Foundry / OpenAI-compatible). */
export interface SdkProviderConfig {
  type: 'openai' | 'azure' | 'anthropic';
  baseUrl: string;
  bearerToken?: string;
  apiKey?: string;
  wireApi?: 'completions' | 'responses';
}

/** The subset of the SDK module this adapter uses. */
export interface LoadedSdk {
  createClient(token?: string): SdkClientLike;
  defineTool: SdkDefineTool;
}

export interface CopilotSdkLoader {
  load(): Promise<LoadedSdk>;
}

/**
 * Fetches an AAD bearer token for a scope. Seam so tests need not depend on
 * @azure/identity or a live managed identity. The default uses
 * DefaultAzureCredential, which resolves to the user-assigned managed identity
 * in Container Apps (via AZURE_CLIENT_ID) and to `az login` locally.
 */
export interface BearerTokenProvider {
  getToken(scope: string): Promise<string>;
}

const defaultTokenProvider: BearerTokenProvider = {
  async getToken(scope: string): Promise<string> {
    const { DefaultAzureCredential } = await import('@azure/identity');
    const clientId = process.env['AZURE_CLIENT_ID'];
    const credential = new DefaultAzureCredential(
      clientId ? { managedIdentityClientId: clientId } : {},
    );
    const token = await credential.getToken(scope);
    if (!token?.token) {
      throw new Error(`Failed to acquire AAD token for scope ${scope}`);
    }
    return token.token;
  },
};

/** Default loader: dynamically import the real @github/copilot-sdk. */
const defaultLoader: CopilotSdkLoader = {
  async load(): Promise<LoadedSdk> {
    const sdk = await import('@github/copilot-sdk');
    return {
      // In BYOK mode no GitHub token is required — the CLI is a runtime only and
      // the model is reached via the session `provider`. Only pass gitHubToken
      // when one is actually present.
      createClient: (token?: string): SdkClientLike =>
        new sdk.CopilotClient(
          token ? { gitHubToken: token, useLoggedInUser: false } : { useLoggedInUser: false },
        ) as SdkClientLike,
      defineTool: ((name, config) => sdk.defineTool(name, config)) as SdkDefineTool,
    };
  },
};

const COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';

export class RealCopilotSessionService implements ICopilotSessionService {
  private sdkPromise: Promise<LoadedSdk> | null = null;
  private client: SdkClientLike | null = null;
  private readonly sessions = new Map<string, SdkSessionLike>();
  private readonly model: string;
  private readonly timeoutMs: number;
  /** Azure AI Foundry / OpenAI-compatible endpoint. When set, BYOK mode is on. */
  private readonly aoaiEndpoint: string;

  constructor(
    private readonly skillPath: string,
    private readonly loader: CopilotSdkLoader = defaultLoader,
    model?: string,
    private readonly tokenProvider: BearerTokenProvider = defaultTokenProvider,
  ) {
    this.model = model ?? process.env['ADVISOR_COPILOT_MODEL'] ?? 'gpt-5';
    this.timeoutMs = Number(process.env['ADVISOR_COPILOT_TIMEOUT_MS'] ?? '120000');
    this.aoaiEndpoint = (process.env['AZURE_OPENAI_ENDPOINT'] ?? '').replace(/\/$/, '');
    this.assertStartupConfig();
  }

  /** True when a Foundry/OpenAI endpoint is configured (Bring Your Own Key). */
  private get byok(): boolean {
    return this.aoaiEndpoint.length > 0;
  }

  /** Fail fast on misconfiguration before any model call. */
  private assertStartupConfig(): void {
    // In BYOK mode the model is reached via Azure AI Foundry using a managed
    // identity bearer token, so no GitHub Copilot token is required. Outside
    // BYOK mode the SDK talks to GitHub-hosted models and needs a token.
    if (!this.byok && !this.token()) {
      throw new Error(
        'RealCopilotSessionService requires GITHUB_TOKEN, COPILOT_TOKEN, or GH_TOKEN ' +
        '(or set AZURE_OPENAI_ENDPOINT for Azure AI Foundry BYOK). ' +
        'Set ADVISOR_AGENT_MODE=mock for local development without credentials.',
      );
    }
    if (!this.skillPath) {
      throw new Error('RealCopilotSessionService requires a non-empty skillPath to the framework skill.');
    }
    // The skill is the whole point of the copilot path — fail loudly if the
    // directory or its SKILL.md is missing rather than silently running
    // ungrounded. (Guards the container-packaging gap.)
    const skillManifest = join(this.skillPath, 'SKILL.md');
    if (!existsSync(skillManifest)) {
      throw new Error(
        `RealCopilotSessionService could not find the framework skill at "${skillManifest}". ` +
        'Set ADVISOR_SKILL_PATH to the microsoft-ai-decision-framework skill directory, ' +
        'and ensure it is packaged into the deployment image.',
      );
    }
  }

  private token(): string {
    return (
      process.env['GITHUB_TOKEN'] ?? process.env['COPILOT_TOKEN'] ?? process.env['GH_TOKEN'] ?? ''
    );
  }

  /**
   * Build the BYOK provider config for a session. Returns undefined when not in
   * BYOK mode (the SDK then uses GitHub-hosted models). The bearer token is
   * fetched fresh per session because AAD tokens expire (~1h) and the SDK does
   * not auto-refresh; the advisor creates a fresh session per turn so this is
   * always a valid, short-lived token.
   */
  private async buildProvider(): Promise<SdkProviderConfig | undefined> {
    if (!this.byok) return undefined;
    const bearerToken = await this.tokenProvider.getToken(COGNITIVE_SERVICES_SCOPE);
    return {
      type: 'openai',
      baseUrl: `${this.aoaiEndpoint}/openai/v1/`,
      bearerToken,
      // GPT-5 family on Azure AI Foundry uses the Responses API surface.
      wireApi: 'responses',
    };
  }

  private async sdk(): Promise<LoadedSdk> {
    if (!this.sdkPromise) {
      this.sdkPromise = this.loader.load();
    }
    return this.sdkPromise;
  }

  private async ensureClient(): Promise<{ sdk: LoadedSdk; client: SdkClientLike }> {
    const sdk = await this.sdk();
    if (!this.client) {
      const token = this.token();
      this.client = sdk.createClient(token || undefined);
    }
    return { sdk, client: this.client };
  }

  /**
   * Map transport-agnostic CopilotTool[] to SDK defineTool objects.
   * Handlers are RETAINED, and skipPermission is set so these read-only
   * grounding tools execute without a permission prompt (otherwise tool calls
   * hang waiting for an approval we never send in a headless server).
   */
  private buildSdkTools(sdk: LoadedSdk, tools: CopilotTool[]): unknown[] {
    return tools.map((t) =>
      sdk.defineTool(t.name, {
        description: t.description,
        parameters: t.parameters,
        handler: (args: unknown) => t.handler((args ?? {}) as Record<string, unknown>),
        skipPermission: true,
      }),
    );
  }

  /** Common session config — restrict to our own tools and skill, no ambient repo instructions. */
  private sessionConfig(
    systemPrompt: string | undefined,
    tools: CopilotTool[],
    sdk: LoadedSdk,
    provider: SdkProviderConfig | undefined,
  ): Record<string, unknown> {
    const cfg: Record<string, unknown> = {
      model: this.model,
      skillDirectories: [this.skillPath],
      tools: this.buildSdkTools(sdk, tools),
      // Only the two grounding tools are available — no built-in shell/filesystem.
      availableTools: tools.map((t) => t.name),
      // Do not absorb ambient repo custom instructions into the advisor session.
      skipCustomInstructions: true,
    };
    if (provider) {
      cfg['provider'] = provider;
    }
    if (systemPrompt !== undefined) {
      cfg['systemMessage'] = { mode: 'append', content: systemPrompt };
    }
    return cfg;
  }

  async createSession(config: CopilotSessionConfig, tools: CopilotTool[]): Promise<CopilotSessionHandle> {
    const { sdk, client } = await this.ensureClient();
    const provider = await this.buildProvider();
    const session = await client.createSession(this.sessionConfig(config.systemPrompt, tools, sdk, provider));
    this.sessions.set(session.sessionId, session);
    return { sessionId: config.organizationId, copilotSdkSessionId: session.sessionId };
  }

  async resumeSession(copilotSdkSessionId: string, tools: CopilotTool[]): Promise<CopilotSessionHandle> {
    // Cosmos is the source of truth; "resume" just ensures a live SDK session
    // exists to talk to. If the in-memory handle is gone, create a fresh one.
    if (this.sessions.has(copilotSdkSessionId)) {
      return { sessionId: copilotSdkSessionId, copilotSdkSessionId };
    }
    const { sdk, client } = await this.ensureClient();
    const provider = await this.buildProvider();
    const session = await client.createSession(this.sessionConfig(undefined, tools, sdk, provider));
    this.sessions.set(session.sessionId, session);
    return { sessionId: copilotSdkSessionId, copilotSdkSessionId: session.sessionId };
  }

  async sendPrompt(copilotSdkSessionId: string, prompt: string): Promise<string> {
    const session = this.sessions.get(copilotSdkSessionId);
    if (!session) {
      throw new Error(`Copilot SDK session not found: ${copilotSdkSessionId}`);
    }
    const response = await session.sendAndWait({ prompt }, this.timeoutMs);
    const content = response?.data?.content;
    if (typeof content !== 'string') {
      throw new Error('Copilot SDK returned no assistant message content.');
    }
    return content;
  }

  async endSession(copilotSdkSessionId: string): Promise<void> {
    const session = this.sessions.get(copilotSdkSessionId);
    if (session?.disconnect) {
      try {
        await session.disconnect();
      } catch (err) {
        log.warn({ copilotSdkSessionId, disconnectError: String(err) }, 'Failed to disconnect Copilot SDK session');
      }
    }
    this.sessions.delete(copilotSdkSessionId);
  }

  /** Stop the underlying CLI client (call on process shutdown). */
  async dispose(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.stop?.();
    } catch (err) {
      log.warn({ disposeError: String(err) }, 'Failed to stop Copilot SDK client');
    }
  }
}
