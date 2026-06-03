/**
 * RealCopilotSessionService wiring tests.
 *
 * These use a FAKE CopilotSdkLoader (no real @github/copilot-sdk CLI, no token)
 * to prove the adapter wires the SDK correctly:
 *  - tool HANDLERS are retained (the previous implementation dropped them)
 *  - skillDirectories points at the framework skill
 *  - systemMessage uses { mode:'append', content } (keeps SDK guardrails)
 *  - sendPrompt reads response.data.content
 *  - startup validation fails fast without a token
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CopilotTool } from '@advisor/shared';
import {
  RealCopilotSessionService,
  type CopilotSdkLoader,
  type LoadedSdk,
  type SdkClientLike,
  type SdkSessionLike,
} from '../adapters/inmemory/RealCopilotSessionService.js';

interface CapturedSession {
  config: Record<string, unknown>;
  session: SdkSessionLike;
}

/** A fake loader that records createSession config and lets tests script responses. */
function makeFakeLoader(responseContent = 'hello from model'): {
  loader: CopilotSdkLoader;
  captured: CapturedSession[];
  definedTools: Array<{ name: string; config: { handler?: (a: unknown) => unknown; skipPermission?: boolean } }>;
  disconnected: { count: number };
  stopped: { value: boolean };
} {
  const captured: CapturedSession[] = [];
  const definedTools: Array<{ name: string; config: { handler?: (a: unknown) => unknown; skipPermission?: boolean } }> = [];
  const disconnected = { count: 0 };
  const stopped = { value: false };

  const client: SdkClientLike = {
    async createSession(config: Record<string, unknown>): Promise<SdkSessionLike> {
      const session: SdkSessionLike = {
        sessionId: `sdk-${captured.length + 1}`,
        async sendAndWait() {
          return { data: { content: responseContent } };
        },
        async disconnect() {
          disconnected.count += 1;
        },
      };
      captured.push({ config, session });
      return session;
    },
    async stop() {
      stopped.value = true;
      return undefined;
    },
  };

  const loaded: LoadedSdk = {
    createClient: () => client,
    defineTool: (name, config) => {
      definedTools.push({ name, config });
      return { name, ...config };
    },
  };

  return { loader: { async load() { return loaded; } }, captured, definedTools, disconnected, stopped };
}

function makeTool(name: string, handler: (a: Record<string, unknown>) => Promise<unknown>): CopilotTool {
  return { name, description: `${name} desc`, parameters: { type: 'object', properties: {} }, handler };
}

describe('RealCopilotSessionService wiring', () => {
  const ORIGINAL = { ...process.env };
  let SKILL_DIR = '';

  beforeAll(() => {
    SKILL_DIR = mkdtempSync(join(tmpdir(), 'advisor-skill-'));
    writeFileSync(join(SKILL_DIR, 'SKILL.md'), '# Test Skill\n');
  });

  afterAll(() => {
    rmSync(SKILL_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env['GITHUB_TOKEN'] = 'ghu_faketoken';
    delete process.env['AZURE_OPENAI_ENDPOINT'];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('throws on startup when no token is present', () => {
    delete process.env['GITHUB_TOKEN'];
    delete process.env['COPILOT_TOKEN'];
    delete process.env['GH_TOKEN'];
    expect(() => new RealCopilotSessionService(SKILL_DIR, makeFakeLoader().loader)).toThrow(/requires GITHUB_TOKEN/i);
  });

  it('throws on startup when skillPath is empty', () => {
    expect(() => new RealCopilotSessionService('', makeFakeLoader().loader)).toThrow(/skillPath/i);
  });

  it('throws on startup when SKILL.md is missing from skillPath', () => {
    expect(() => new RealCopilotSessionService(join(tmpdir(), 'advisor-no-skill-here'), makeFakeLoader().loader))
      .toThrow(/could not find the framework skill/i);
  });

  it('wires skillDirectories, append-mode systemMessage, and RETAINS tool handlers', async () => {
    const handlerSpy = vi.fn(async () => ({ ok: true }));
    const fake = makeFakeLoader();
    const svc = new RealCopilotSessionService(SKILL_DIR, fake.loader, 'gpt-5.5');

    await svc.createSession(
      { organizationId: 'org-nfum', skillPath: SKILL_DIR, systemPrompt: 'SYSTEM_PROMPT_TEXT' },
      [makeTool('retrieve_framework_guidance', handlerSpy)],
    );

    const cfg = fake.captured[0]!.config;
    expect(cfg['model']).toBe('gpt-5.5');
    expect(cfg['skillDirectories']).toEqual([SKILL_DIR]);
    expect(cfg['systemMessage']).toEqual({ mode: 'append', content: 'SYSTEM_PROMPT_TEXT' });
    // Ambient repo instructions are suppressed and tools are restricted.
    expect(cfg['skipCustomInstructions']).toBe(true);
    expect(cfg['availableTools']).toEqual(['retrieve_framework_guidance']);

    // The defined SDK tool must carry a handler that delegates to our CopilotTool,
    // and skipPermission so it executes without an approval prompt.
    const defined = fake.definedTools.find((t) => t.name === 'retrieve_framework_guidance');
    expect(defined).toBeDefined();
    expect(typeof defined!.config.handler).toBe('function');
    expect(defined!.config.skipPermission).toBe(true);
    await defined!.config.handler!({ query: 'x' });
    expect(handlerSpy).toHaveBeenCalledOnce();
  });

  it('returns the org id as the public sessionId and reads response.data.content', async () => {
    const fake = makeFakeLoader('the model reply');
    const svc = new RealCopilotSessionService(SKILL_DIR, fake.loader);

    const handle = await svc.createSession(
      { organizationId: 'org-nfum', skillPath: SKILL_DIR, systemPrompt: 'sys' },
      [],
    );
    expect(handle.sessionId).toBe('org-nfum');
    expect(handle.copilotSdkSessionId).toBe('sdk-1');

    const reply = await svc.sendPrompt(handle.copilotSdkSessionId, 'hi');
    expect(reply).toBe('the model reply');
  });

  it('throws when sending to an unknown session', async () => {
    const svc = new RealCopilotSessionService(SKILL_DIR, makeFakeLoader().loader);
    await expect(svc.sendPrompt('nope', 'hi')).rejects.toThrow(/session not found/i);
  });

  it('endSession disconnects the SDK session', async () => {
    const fake = makeFakeLoader();
    const svc = new RealCopilotSessionService(SKILL_DIR, fake.loader);
    const handle = await svc.createSession({ organizationId: 'o', skillPath: SKILL_DIR, systemPrompt: 's' }, []);
    await svc.endSession(handle.copilotSdkSessionId);
    expect(fake.disconnected.count).toBe(1);
  });

  it('dispose stops the underlying client', async () => {
    const fake = makeFakeLoader();
    const svc = new RealCopilotSessionService(SKILL_DIR, fake.loader);
    await svc.createSession({ organizationId: 'o', skillPath: SKILL_DIR, systemPrompt: 's' }, []);
    await svc.dispose();
    expect(fake.stopped.value).toBe(true);
  });
});

describe('RealCopilotSessionService — Azure AI Foundry BYOK', () => {
  const ORIGINAL = { ...process.env };
  let SKILL_DIR = '';

  beforeAll(() => {
    SKILL_DIR = mkdtempSync(join(tmpdir(), 'advisor-skill-byok-'));
    writeFileSync(join(SKILL_DIR, 'SKILL.md'), '# Test Skill\n');
  });
  afterAll(() => {
    rmSync(SKILL_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    delete process.env['GITHUB_TOKEN'];
    delete process.env['COPILOT_TOKEN'];
    delete process.env['GH_TOKEN'];
    process.env['AZURE_OPENAI_ENDPOINT'] = 'https://aoai-advisor-test.openai.azure.com/';
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('does NOT require a GitHub token when a Foundry endpoint is configured', () => {
    expect(() => new RealCopilotSessionService(SKILL_DIR, makeFakeLoader().loader)).not.toThrow();
  });

  it('wires a Responses-API openai provider with a managed-identity bearer token', async () => {
    const fake = makeFakeLoader();
    const tokenProvider = { getToken: vi.fn(async () => 'aad-bearer-token') };
    const svc = new RealCopilotSessionService(SKILL_DIR, fake.loader, 'gpt-5', tokenProvider);

    await svc.createSession({ organizationId: 'org-nfum', skillPath: SKILL_DIR, systemPrompt: 'sys' }, []);

    const provider = fake.captured[0]!.config['provider'] as Record<string, unknown>;
    expect(provider).toBeDefined();
    expect(provider['type']).toBe('openai');
    expect(provider['wireApi']).toBe('responses');
    expect(provider['baseUrl']).toBe('https://aoai-advisor-test.openai.azure.com/openai/v1/');
    expect(provider['bearerToken']).toBe('aad-bearer-token');
    // Cognitive Services scope is requested for the AAD token.
    expect(tokenProvider.getToken).toHaveBeenCalledWith('https://cognitiveservices.azure.com/.default');
  });

  it('fetches a fresh bearer token per session (no reuse of stale tokens)', async () => {
    const fake = makeFakeLoader();
    let n = 0;
    const tokenProvider = { getToken: vi.fn(async () => `token-${++n}`) };
    const svc = new RealCopilotSessionService(SKILL_DIR, fake.loader, 'gpt-5', tokenProvider);

    await svc.createSession({ organizationId: 'a', skillPath: SKILL_DIR, systemPrompt: 's' }, []);
    await svc.createSession({ organizationId: 'b', skillPath: SKILL_DIR, systemPrompt: 's' }, []);

    expect(tokenProvider.getToken).toHaveBeenCalledTimes(2);
    expect((fake.captured[0]!.config['provider'] as Record<string, unknown>)['bearerToken']).toBe('token-1');
    expect((fake.captured[1]!.config['provider'] as Record<string, unknown>)['bearerToken']).toBe('token-2');
  });
});
