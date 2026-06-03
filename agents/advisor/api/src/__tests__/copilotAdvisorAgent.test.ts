/**
 * CopilotAdvisorAgent tests.
 *
 * These exercise the real framework-driven agent against a FAKE
 * ICopilotSessionService (no live CLI / token / LLM). They prove:
 *  - the system prompt carries the framework mandate + active custom instructions
 *  - both grounding tools are registered with the SDK session
 *  - the prior conversation transcript is sent to the model
 *  - valid question/recommendation envelopes map to domain types
 *  - malformed, schema-invalid, and DOMAIN-invalid (fabricated instruction /
 *    project IDs) recommendations fail loudly with NO silent fallback
 *  - one repair retry is attempted before failure
 */

import { describe, it, expect } from 'vitest';
import type {
  AdvisorContext,
  AdvisorSession,
  CopilotSessionConfig,
  CopilotSessionHandle,
  CopilotTool,
  CustomerGuidanceDocument,
  ICopilotSessionService,
  IntakeSubmission,
  IProjectSearchService,
  IFrameworkRetrievalService,
  SimilarProjectResult,
  FrameworkRetrievalResult,
} from '@advisor/shared';
import { CopilotAdvisorAgent } from '../agent/CopilotAdvisorAgent.js';

/** A scripted, recording fake of the SDK transport seam. */
class FakeCopilotSessionService implements ICopilotSessionService {
  lastConfig: CopilotSessionConfig | null = null;
  lastTools: CopilotTool[] = [];
  lastPrompt = '';
  private readonly responses: string[];
  private idx = 0;

  constructor(responses: string[]) {
    this.responses = responses;
  }

  async createSession(config: CopilotSessionConfig, tools: CopilotTool[]): Promise<CopilotSessionHandle> {
    this.lastConfig = config;
    this.lastTools = tools;
    return { sessionId: config.organizationId, copilotSdkSessionId: 'sdk-session-1' };
  }

  async resumeSession(copilotSdkSessionId: string): Promise<CopilotSessionHandle> {
    return { sessionId: copilotSdkSessionId, copilotSdkSessionId };
  }

  async sendPrompt(_sdkSessionId: string, prompt: string): Promise<string> {
    this.lastPrompt = prompt;
    const r = this.responses[this.idx] ?? this.responses[this.responses.length - 1] ?? '';
    this.idx += 1;
    return r;
  }

  async endSession(): Promise<void> {
    /* no-op */
  }
}

class StubProjectSearch implements IProjectSearchService {
  constructor(private readonly result: SimilarProjectResult) {}
  async similarProjects(): Promise<SimilarProjectResult> {
    return this.result;
  }
}

class StubFrameworkRetrieval implements IFrameworkRetrievalService {
  async retrieve(): Promise<FrameworkRetrievalResult[]> {
    return [{ content: 'test guidance', source: 'embedded:test' }];
  }
}

const PROJECT_MATCH = {
  projectId: 'proj-1',
  title: 'Claims Guidance Assistant',
  score: 0.82,
  matchRationale: 'Similar grounded assistant scenario',
  technologies: ['Copilot Studio', 'Azure AI Search'],
};

function makeGuidance(): CustomerGuidanceDocument {
  return {
    instructionSetId: 'gd-1',
    customerOrganizationId: 'org-nfum',
    version: 1,
    activeFlag: true,
    scope: 'customerOrganization',
    activeFrom: new Date().toISOString(),
    organizationContext: {
      companySummary: 'NFU Mutual — rural insurer',
      businessPriorities: ['Faster claims'],
      preferredChannels: ['Microsoft Teams'],
      operatingConstraints: ['Human approval required for decisions'],
      technologyPreferences: ['Microsoft-first'],
    },
    instructions: [
      { id: 'human-approval-required', text: 'Never auto-approve claims', appliesToFrameworkQuestions: ['phase2.action_safety'] },
    ],
    auditTrail: [],
  };
}

function makeIntake(): IntakeSubmission {
  return {
    submittedAt: new Date().toISOString(),
    formTitle: 'AI Advisor Intake Form',
    answers: { problem_plain_english: 'Claims handlers search policy docs', main_users: 'Claims handlers' },
    validationState: 'valid',
  };
}

function makeCtx(stage: AdvisorContext['stage'], withTurns = false): AdvisorContext {
  const now = new Date().toISOString();
  const session: AdvisorSession = {
    sessionId: 'sess-1',
    customerOrganizationId: 'org-nfum',
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    conversationCapture: {
      sessionId: 'sess-1',
      startedAt: now,
      turns: withTurns
        ? [
            { turnId: 't1', role: 'agent', messageType: 'clarifyingQuestion', phase: 'phase1.businessImpactAssessment', content: 'What is the measurable problem?', timestamp: now },
            { turnId: 't2', role: 'user', messageType: 'answer', phase: 'phase1.businessImpactAssessment', content: 'Handlers waste 30 min per claim', timestamp: now },
          ]
        : [],
      capturedFacts: [],
      readinessState: 'phase1InProgress',
    },
  };
  return { session, intake: makeIntake(), guidance: makeGuidance(), stage };
}

function buildAgent(responses: string[], result: SimilarProjectResult = [PROJECT_MATCH]) {
  const copilotService = new FakeCopilotSessionService(responses);
  const agent = new CopilotAdvisorAgent({
    copilotService,
    skillPath: '/fake/skill/path',
    projectSearch: new StubProjectSearch(result),
    frameworkRetrieval: new StubFrameworkRetrieval(),
  });
  return { agent, copilotService };
}

const VALID_RECOMMENDATION = JSON.stringify({
  generatedAt: new Date().toISOString(),
  status: 'recommendationReady',
  confidence: 'Medium-High',
  recommendedApproach: {
    summary: 'Use Copilot Studio as the orchestrator with Azure AI Search grounding.',
    primaryTechnologies: [{ name: 'Copilot Studio', role: 'Conversation orchestrator' }],
    supportingTechnologies: [{ name: 'Azure AI Search', role: 'Grounding engine' }],
  },
  rationale: [{ reason: 'Grounded assistant scenario', evidence: ['intake: claims handlers search policy docs'] }],
  customInstructionInfluence: [{ instructionId: 'human-approval-required', effect: 'No auto-approval of claims' }],
  tradeOffs: [{ tradeOff: 'Low-code limits custom UI', acceptedForPoc: true }],
  assumptions: ['SharePoint permissions exist'],
  followUpQuestions: ['What volume of claims per day?'],
  similarProjectHighlights: [{ projectId: 'proj-1', title: 'Claims Guidance Assistant', whyItMatters: 'Same grounded pattern' }],
  decisionEvidenceSources: ['intake', 'customInstructions', 'projectSearch'],
});

describe('CopilotAdvisorAgent — questions', () => {
  it('registers both grounding tools and a framework system prompt', async () => {
    const { agent, copilotService } = buildAgent([
      JSON.stringify({ phase: 'phase1.businessImpactAssessment', messageType: 'clarifyingQuestion', content: 'What measurable problem?', reasonAsked: 'BXT viability' }),
    ]);
    await agent.generateQuestion(makeCtx('phase1'));

    const toolNames = copilotService.lastTools.map((t) => t.name).sort();
    expect(toolNames).toEqual(['lookup_similar_projects', 'retrieve_framework_guidance']);
    expect(copilotService.lastConfig?.systemPrompt).toContain('Three-Phase Decision Methodology');
    // Active custom instruction surfaced into the system prompt
    expect(copilotService.lastConfig?.systemPrompt).toContain('human-approval-required');
  });

  it('maps a valid JSON question envelope', async () => {
    const { agent } = buildAgent([
      JSON.stringify({ phase: 'phase2.technologyGroupings', messageType: 'clarifyingQuestion', content: 'How will users interact?', reasonAsked: 'Q1 interaction pattern', customInstructionAnswersUsed: ['human-approval-required'] }),
    ]);
    const env = await agent.generateQuestion(makeCtx('phase2'));
    expect(env.messageType).toBe('clarifyingQuestion');
    expect(env.phase).toBe('phase2.technologyGroupings');
    expect(env.content).toContain('How will users interact?');
    expect(env.reasonAsked).toBe('Q1 interaction pattern');
    expect(env.customInstructionAnswersUsed).toEqual(['human-approval-required']);
  });

  it('drops fabricated instruction IDs from the question envelope', async () => {
    const { agent } = buildAgent([
      JSON.stringify({ phase: 'phase2.technologyGroupings', messageType: 'clarifyingQuestion', content: 'Q?', customInstructionAnswersUsed: ['made-up-instruction'] }),
    ]);
    const env = await agent.generateQuestion(makeCtx('phase2'));
    expect(env.customInstructionAnswersUsed).toBeUndefined();
  });

  it('includes the prior conversation transcript in the prompt', async () => {
    const { agent, copilotService } = buildAgent([
      JSON.stringify({ phase: 'phase2.technologyGroupings', messageType: 'clarifyingQuestion', content: 'Next?' }),
    ]);
    await agent.generateQuestion(makeCtx('phase2', true));
    expect(copilotService.lastPrompt).toContain('Handlers waste 30 min per claim');
  });

  it('falls back to raw model text when the response is not JSON', async () => {
    const { agent } = buildAgent(['Just a plain question with no JSON wrapper.']);
    const env = await agent.generateQuestion(makeCtx('phase1'));
    expect(env.content).toContain('Just a plain question');
    expect(env.phase).toBe('phase1.businessImpactAssessment');
  });
});

describe('CopilotAdvisorAgent — recommendation', () => {
  it('maps a valid recommendation envelope', async () => {
    const { agent } = buildAgent([VALID_RECOMMENDATION]);
    const rec = await agent.generateRecommendation(makeCtx('phase3Summary'));
    expect(rec.status).toBe('recommendationReady');
    expect(rec.recommendedApproach.primaryTechnologies.length).toBeGreaterThan(0);
    expect(rec.customInstructionInfluence[0]?.instructionId).toBe('human-approval-required');
    expect(rec.similarProjectHighlights[0]?.projectId).toBe('proj-1');
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    const { agent } = buildAgent(['```json\n' + VALID_RECOMMENDATION + '\n```']);
    const rec = await agent.generateRecommendation(makeCtx('phase3Summary'));
    expect(rec.status).toBe('recommendationReady');
  });

  it('fails loudly on malformed JSON after two attempts (no silent fallback)', async () => {
    const { agent } = buildAgent(['not json at all', 'still not json']);
    await expect(agent.generateRecommendation(makeCtx('phase3Summary'))).rejects.toThrow(/failed to produce a valid recommendation/i);
  });

  it('rejects a recommendation citing a fabricated instruction ID', async () => {
    const bad = JSON.parse(VALID_RECOMMENDATION);
    bad.customInstructionInfluence = [{ instructionId: 'ghost-instruction', effect: 'fabricated' }];
    const { agent } = buildAgent([JSON.stringify(bad), JSON.stringify(bad)]);
    await expect(agent.generateRecommendation(makeCtx('phase3Summary'))).rejects.toThrow(/unknown instruction/i);
  });

  it('rejects a recommendation citing a fabricated similar-project ID', async () => {
    const bad = JSON.parse(VALID_RECOMMENDATION);
    bad.similarProjectHighlights = [{ projectId: 'proj-999', title: 'Fake', whyItMatters: 'fabricated' }];
    const { agent } = buildAgent([JSON.stringify(bad), JSON.stringify(bad)]);
    await expect(agent.generateRecommendation(makeCtx('phase3Summary'))).rejects.toThrow(/unknown projectId/i);
  });

  it('recovers when the first response is invalid but the repair retry is valid', async () => {
    const { agent } = buildAgent(['garbage', VALID_RECOMMENDATION]);
    const rec = await agent.generateRecommendation(makeCtx('phase3Summary'));
    expect(rec.status).toBe('recommendationReady');
  });

  it('constrains highlights to empty when no similar projects are found', async () => {
    const recNoHighlights = JSON.parse(VALID_RECOMMENDATION);
    recNoHighlights.similarProjectHighlights = [];
    const { agent } = buildAgent([JSON.stringify(recNoHighlights)], { noMatchFound: true, reason: 'none' });
    const rec = await agent.generateRecommendation(makeCtx('phase3Summary'));
    expect(rec.similarProjectHighlights).toEqual([]);
  });
});
