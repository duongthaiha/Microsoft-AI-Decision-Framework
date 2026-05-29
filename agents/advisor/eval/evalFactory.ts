/**
 * Eval test factory — builds in-memory dependencies for evaluation cases.
 * Mirrors the API's buildTestDeps but imports relative to the eval workspace.
 */

import { randomUUID } from 'node:crypto';
import type { AdvisorSession, IntakeSubmission, SimilarProjectResult } from '@advisor/shared';
import { InMemoryConversationStore } from '../api/src/adapters/inmemory/InMemoryConversationStore.js';
import { InMemoryGuidanceStore } from '../api/src/adapters/inmemory/InMemoryGuidanceStore.js';
import { InMemoryProjectSearch } from '../api/src/adapters/inmemory/InMemoryProjectSearch.js';
import { InMemoryFrameworkRetrieval } from '../api/src/adapters/inmemory/InMemoryFrameworkRetrieval.js';
import { MockCopilotSessionService } from '../api/src/adapters/inmemory/MockCopilotSessionService.js';
import { AgentOrchestrator } from '../api/src/agent/AgentOrchestrator.js';
import type { IProjectSearchService } from '@advisor/shared';

/** A project search implementation that always returns noMatchFound. */
export class NoMatchProjectSearch implements IProjectSearchService {
  async similarProjects(): Promise<SimilarProjectResult> {
    return { noMatchFound: true, reason: 'No similar projects found for this evaluation case.' };
  }
}

export function buildEvalDeps(opts: { projectSearch?: IProjectSearchService } = {}) {
  const conversationStore = new InMemoryConversationStore();
  const guidanceStore = new InMemoryGuidanceStore();
  const projectSearch = opts.projectSearch ?? new InMemoryProjectSearch();
  const frameworkRetrieval = new InMemoryFrameworkRetrieval('');
  const copilotService = new MockCopilotSessionService(conversationStore, guidanceStore);

  const orchestrator = new AgentOrchestrator({
    conversationStore,
    guidanceStore,
    projectSearch,
    frameworkRetrieval,
    copilotService,
    skillPath: '',
  });

  return { conversationStore, guidanceStore, projectSearch, frameworkRetrieval, copilotService, orchestrator };
}

export function makeEvalSession(orgId: string): AdvisorSession {
  const sessionId = `eval-${randomUUID()}`;
  const now = new Date().toISOString();
  return {
    sessionId,
    customerOrganizationId: orgId,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    conversationCapture: {
      sessionId,
      startedAt: now,
      turns: [],
      capturedFacts: [],
      readinessState: 'awaitingIntake',
    },
  };
}

/** Run the complete Phase 1→2→3 flow for an eval case. */
export async function runEvalFlow(
  orgId: string,
  intake: IntakeSubmission,
  phase1Answer: string,
  phase2Answer: string,
  deps = buildEvalDeps(),
): Promise<import('@advisor/shared').RecommendationOutput> {
  const { conversationStore, orchestrator } = deps;

  const session = makeEvalSession(orgId);
  const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: IntakeSubmission };
  await conversationStore.createSession(sessionWithIntake);

  await orchestrator.processIntake(sessionWithIntake, intake);

  const s1 = await conversationStore.loadSession(session.sessionId);
  if (!s1) throw new Error('Session lost after intake');
  await orchestrator.processMessage(s1, phase1Answer);

  const s2 = await conversationStore.loadSession(session.sessionId);
  if (!s2) throw new Error('Session lost after phase1 answer');
  await orchestrator.processMessage(s2, phase2Answer);

  const s3 = await conversationStore.loadSession(session.sessionId);
  if (!s3) throw new Error('Session lost after phase2 answer');
  await orchestrator.processMessage(s3, 'proceed');

  const finalSession = await conversationStore.loadSession(session.sessionId);
  if (!finalSession) throw new Error('Session lost before recommendation');

  return orchestrator.buildRecommendation(finalSession);
}
