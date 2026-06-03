/**
 * CopilotAdvisorAgent — the real, framework-driven agent.
 *
 * Selected when ADVISOR_AGENT_MODE=copilot. It loads the
 * microsoft-ai-decision-framework skill into a GitHub Copilot SDK session
 * (via ICopilotSessionService) and reasons over the gathered intake +
 * conversation + custom-instruction context to produce BOTH the next
 * clarifying question and the final recommendation. Nothing about the
 * recommendation content is hardcoded here.
 *
 * Design choices (see plan / rubber-duck critique):
 *  - Cosmos is the single source of truth. Each call creates a fresh SDK
 *    session and sends a compact reconstructed context, so there is no
 *    divergence between SDK session memory and the app's conversation store.
 *  - LLM output is an unreliable boundary. The recommendation is extracted +
 *    shape-validated (zod) + DOMAIN-validated (instruction IDs and
 *    similar-project IDs must be real), with one repair retry, then loud
 *    failure. No silent fallback to scripted output.
 *  - The model emits the typed object directly; this class only parses,
 *    validates, injects grounding context, and maps. There is deliberately NO
 *    "if scenario looks like X then recommend Y" logic.
 */

import type {
  AdvisorContext,
  AdvisorStage,
  ConversationTurn,
  CopilotTool,
  CustomerGuidanceDocument,
  IAdvisorAgent,
  IFrameworkRetrievalService,
  IProjectSearchService,
  PhaseId,
  QuestionEnvelope,
  RecommendationOutput,
  SimilarProjectMatch,
  SimilarProjectResult,
} from '@advisor/shared';
import {
  extractAndParseRecommendation,
  extractJsonObject,
  isNoMatchFound,
} from '@advisor/shared';
import type { ICopilotSessionService } from '@advisor/shared';
import { assembleSystemPrompt } from './instructions.js';
import { createFrameworkRetrievalTool } from '../tools/frameworkRetrievalTool.js';
import { createSimilarProjectLookupTool } from '../tools/similarProjectLookupTool.js';
import { log } from '../logger.js';

export interface CopilotAdvisorAgentDeps {
  copilotService: ICopilotSessionService;
  skillPath: string;
  projectSearch: IProjectSearchService;
  frameworkRetrieval: IFrameworkRetrievalService;
}

const STAGE_PHASE: Record<AdvisorStage, PhaseId> = {
  phase1: 'phase1.businessImpactAssessment',
  phase2: 'phase2.technologyGroupings',
  phase2FollowUp: 'phase2.technologyGroupings',
  phase3Summary: 'phase3.scenarioSpecificSelection',
};

const STAGE_GOAL: Record<AdvisorStage, string> = {
  phase1:
    'Ask ONE Phase 1 Business Impact Assessment (BXT) clarifying question that probes the biggest remaining gap in business viability, user desirability, or technical feasibility.',
  phase2:
    'Ask ONE Phase 2 question from the Nine Critical Questions that is NOT already answered by intake or active custom instructions. Note any questions already pre-answered by custom instructions and do not re-ask them.',
  phase2FollowUp:
    'Ask ONE additional Phase 2 question covering a Nine-Questions dimension still missing (e.g. team skills/build style, scale/cost, or action safety).',
  phase3Summary:
    'Do NOT ask a question. Produce a short Phase 3 readiness SUMMARY of the selected scenario shape (interaction pattern, data strategy, action safety, orchestration) and invite the user to proceed to the recommendation.',
};

export class CopilotAdvisorAgent implements IAdvisorAgent {
  readonly name = 'copilot';

  private readonly tools: CopilotTool[];

  constructor(private readonly deps: CopilotAdvisorAgentDeps) {
    this.tools = [
      createFrameworkRetrievalTool(deps.frameworkRetrieval),
      createSimilarProjectLookupTool(deps.projectSearch),
    ];
  }

  // -------------------------------------------------------------------------
  // Question / summary generation
  // -------------------------------------------------------------------------

  async generateQuestion(ctx: AdvisorContext): Promise<QuestionEnvelope> {
    const phase = STAGE_PHASE[ctx.stage];
    const messageType = ctx.stage === 'phase3Summary' ? 'summary' : 'clarifyingQuestion';

    const systemPrompt = `${assembleSystemPrompt(ctx.guidance, ctx.intake)}

## Output Protocol (STRICT)
Respond with a SINGLE JSON object and nothing else:
{
  "phase": "${phase}",
  "messageType": "${messageType}",
  "content": "<your message to the user, markdown allowed>",
  "reasonAsked": "<short reason this is the right next question>",
  "customInstructionAnswersUsed": ["<instruction id>", ...]
}
Use retrieve_framework_guidance to ground your choice of question in the framework. Only include customInstructionAnswersUsed for instructions that genuinely pre-answer the question.`;

    const prompt = `${this.renderTranscript(ctx)}

## Your task now
${STAGE_GOAL[ctx.stage]}
Return only the JSON object described in the Output Protocol.`;

    const text = await this.runOnce(ctx, systemPrompt, prompt);
    return this.parseQuestionEnvelope(text, phase, messageType, ctx);
  }

  private parseQuestionEnvelope(
    text: string,
    phase: PhaseId,
    messageType: 'summary' | 'clarifyingQuestion',
    ctx: AdvisorContext,
  ): QuestionEnvelope {
    const json = extractJsonObject(text);
    if (json !== null) {
      try {
        const obj = JSON.parse(json) as Record<string, unknown>;
        const content = typeof obj['content'] === 'string' ? (obj['content'] as string).trim() : '';
        if (content.length > 0) {
          // Phase and messageType are OWNED by the orchestrator state machine —
          // we deliberately ignore any model-provided values to prevent the LLM
          // from corrupting phase progression.
          const env: QuestionEnvelope = { phase, messageType, content };
          if (typeof obj['reasonAsked'] === 'string' && obj['reasonAsked']) {
            env.reasonAsked = obj['reasonAsked'] as string;
          }
          const used = this.validInstructionIds(obj['customInstructionAnswersUsed'], ctx.guidance);
          if (used.length > 0) {
            env.customInstructionAnswersUsed = used;
          }
          return env;
        }
      } catch (err) {
        log.warn({ sessionId: ctx.session.sessionId, parseError: String(err) }, 'Question envelope JSON parse failed — using raw model text');
      }
    }

    // Resilient fallback for conversational turns: use the model's OWN text as
    // the question content (this is still model-generated, not hardcoded).
    const content = text.trim();
    if (content.length === 0) {
      throw new Error('Copilot agent returned an empty question response.');
    }
    log.warn({ sessionId: ctx.session.sessionId, stage: ctx.stage }, 'Question envelope not structured — wrapping raw model text');
    return { phase, messageType, content };
  }

  // -------------------------------------------------------------------------
  // Recommendation generation
  // -------------------------------------------------------------------------

  async generateRecommendation(ctx: AdvisorContext): Promise<RecommendationOutput> {
    // Run similar-project search ourselves so we can (a) ground the prompt and
    // (b) constrain the model to real project IDs (anti-hallucination).
    const similar = await this.safeSimilarProjects(ctx);
    const allowedProjectIds = new Set(similar.map((m) => m.projectId));
    const instructionIds = new Set((ctx.guidance?.instructions ?? []).map((i) => i.id));

    const systemPrompt = `${assembleSystemPrompt(ctx.guidance, ctx.intake)}

## Recommendation Output Protocol (STRICT — JSON ONLY)
Apply the Microsoft AI Decision Framework (Intake Filter → BXT → Nine Questions → Technology Selection). Frame technologies as a CAST OF ROLES, not a single winner. Respond with a SINGLE JSON object and NOTHING else, conforming exactly to this TypeScript type:

interface RecommendationOutput {
  generatedAt: string;            // ISO timestamp
  status: 'awaitingEvidence' | 'recommendationReady' | 'humanReviewRequired' | 'insufficientEvidence';
  confidence: 'Low' | 'Medium' | 'Medium-High' | 'High';
  recommendedApproach: { summary: string; primaryTechnologies: { name: string; role: string }[]; supportingTechnologies: { name: string; role: string }[] };
  rationale: { reason: string; evidence: string[] }[];           // every reason MUST cite evidence
  customInstructionInfluence: { instructionId: string; effect: string }[];
  tradeOffs: { tradeOff: string; acceptedForPoc: boolean }[];
  assumptions: string[];
  followUpQuestions: string[];
  similarProjectHighlights: { projectId: string; title: string; whyItMatters: string }[];
  decisionEvidenceSources: ('intake'|'conversation'|'customInstructions'|'organizationContext'|'frameworkDocs'|'projectSearch'|'agentInference'|'missingEvidence')[];
}

Hard constraints:
- primaryTechnologies MUST have at least one entry and reflect the ACTUAL scenario (do not default to a fixed stack).
- customInstructionInfluence MUST only reference these active instruction IDs: ${instructionIds.size > 0 ? [...instructionIds].join(', ') : '(none — this array MUST be empty)'}.
- similarProjectHighlights MUST only reference these project IDs returned by lookup_similar_projects: ${allowedProjectIds.size > 0 ? [...allowedProjectIds].join(', ') : '(none found — this array MUST be empty)'}.
- Ground every rationale reason in intake, conversation, custom instructions, retrieved framework guidance, or similar projects. Do not invent evidence.
- Call retrieve_framework_guidance to ground the selection before answering.`;

    const prompt = `${this.renderTranscript(ctx)}

## Similar prior projects (from lookup_similar_projects)
${this.renderSimilar(similar)}

## Your task now
Produce the final RecommendationOutput JSON for this organization. Return ONLY the JSON object.`;

    let lastError = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const userPrompt =
        attempt === 1
          ? prompt
          : `${prompt}

## Your previous response was rejected
${lastError}
Fix these problems and return ONLY a corrected RecommendationOutput JSON object.`;

      const text = await this.runOnce(ctx, systemPrompt, userPrompt);
      const parsed = extractAndParseRecommendation(text);
      if (!parsed.ok || !parsed.value) {
        lastError = parsed.error ?? 'Unknown parse error.';
        log.warn({ sessionId: ctx.session.sessionId, attempt, error: lastError }, 'Recommendation shape validation failed');
        continue;
      }

      const domainError = this.validateRecommendationDomain(parsed.value, instructionIds, allowedProjectIds);
      if (domainError) {
        lastError = domainError;
        log.warn({ sessionId: ctx.session.sessionId, attempt, error: domainError }, 'Recommendation domain validation failed');
        continue;
      }

      log.info({ sessionId: ctx.session.sessionId, attempt }, 'Copilot recommendation generated and validated');
      return parsed.value;
    }

    // Loud failure — NO silent fallback to scripted output.
    throw new Error(
      `Copilot agent failed to produce a valid recommendation after 2 attempts. Last error: ${lastError}`,
    );
  }

  /** Returns an error string if the recommendation violates domain constraints, else null. */
  private validateRecommendationDomain(
    rec: RecommendationOutput,
    allowedInstructionIds: Set<string>,
    allowedProjectIds: Set<string>,
  ): string | null {
    const errors: string[] = [];

    for (const ci of rec.customInstructionInfluence) {
      if (!allowedInstructionIds.has(ci.instructionId)) {
        errors.push(
          `customInstructionInfluence references unknown instruction "${ci.instructionId}". Allowed: ${allowedInstructionIds.size > 0 ? [...allowedInstructionIds].join(', ') : 'none'}.`,
        );
      }
    }

    for (const h of rec.similarProjectHighlights) {
      if (!allowedProjectIds.has(h.projectId)) {
        errors.push(
          `similarProjectHighlights references unknown projectId "${h.projectId}". Allowed: ${allowedProjectIds.size > 0 ? [...allowedProjectIds].join(', ') : 'none'}.`,
        );
      }
    }

    if (rec.recommendedApproach.primaryTechnologies.length === 0) {
      errors.push('recommendedApproach.primaryTechnologies must not be empty.');
    }

    return errors.length > 0 ? errors.join(' ') : null;
  }

  // -------------------------------------------------------------------------
  // SDK plumbing + context rendering
  // -------------------------------------------------------------------------

  /** Create a fresh SDK session, send one prompt, return the text, end the session. */
  private async runOnce(ctx: AdvisorContext, systemPrompt: string, prompt: string): Promise<string> {
    const handle = await this.deps.copilotService.createSession(
      {
        organizationId: ctx.session.customerOrganizationId,
        skillPath: this.deps.skillPath,
        systemPrompt,
      },
      this.tools,
    );
    try {
      return await this.deps.copilotService.sendPrompt(handle.copilotSdkSessionId, prompt);
    } finally {
      try {
        await this.deps.copilotService.endSession(handle.copilotSdkSessionId);
      } catch (err) {
        log.warn({ sessionId: ctx.session.sessionId, endError: String(err) }, 'Failed to end Copilot SDK session');
      }
    }
  }

  private renderTranscript(ctx: AdvisorContext): string {
    const turns = ctx.session.conversationCapture.turns ?? [];
    const transcript = turns
      .filter((t: ConversationTurn) => t.role !== 'system')
      .map((t: ConversationTurn) => `- ${t.role.toUpperCase()} [${t.phase ?? 'n/a'}]: ${t.content}`)
      .join('\n');
    return `## Conversation so far\n${transcript.length > 0 ? transcript : '(no turns yet)'}`;
  }

  private renderSimilar(matches: SimilarProjectMatch[]): string {
    if (matches.length === 0) return '(no similar projects found)';
    return matches
      .map((m) => `- [${m.projectId}] ${m.title}: ${m.matchRationale}`)
      .join('\n');
  }

  private async safeSimilarProjects(ctx: AdvisorContext): Promise<SimilarProjectMatch[]> {
    const query = ctx.intake
      ? Object.values(ctx.intake.answers).flat().join(' ').slice(0, 400)
      : `${ctx.session.customerOrganizationId} AI assistant`;
    let result: SimilarProjectResult;
    try {
      result = await this.deps.projectSearch.similarProjects({
        query,
        indexName: 'advisor-project-knowledge',
        topK: 3,
      });
    } catch (err) {
      log.warn({ sessionId: ctx.session.sessionId, searchError: String(err) }, 'Similar project search failed — treating as no matches');
      return [];
    }
    return isNoMatchFound(result) ? [] : result;
  }

  private validInstructionIds(
    raw: unknown,
    guidance: CustomerGuidanceDocument | null,
  ): string[] {
    if (!Array.isArray(raw)) return [];
    const allowed = new Set((guidance?.instructions ?? []).map((i) => i.id));
    return raw.filter((v): v is string => typeof v === 'string' && allowed.has(v));
  }
}
