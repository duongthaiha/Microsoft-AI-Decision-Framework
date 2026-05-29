/**
 * Shared test helpers — in-memory dependency factory and session/intake builders.
 * All tests import from here to avoid boilerplate.
 */

import { randomUUID } from 'node:crypto';
import type { AdvisorSession, IntakeSubmission } from '@advisor/shared';
import { InMemoryConversationStore } from '../adapters/inmemory/InMemoryConversationStore.js';
import { InMemoryGuidanceStore } from '../adapters/inmemory/InMemoryGuidanceStore.js';
import { InMemoryProjectSearch } from '../adapters/inmemory/InMemoryProjectSearch.js';
import { InMemoryFrameworkRetrieval } from '../adapters/inmemory/InMemoryFrameworkRetrieval.js';
import { MockCopilotSessionService } from '../adapters/inmemory/MockCopilotSessionService.js';
import { AgentOrchestrator } from '../agent/AgentOrchestrator.js';

/** Build a full set of in-memory dependencies with the mock agent. */
export function buildTestDeps() {
  const conversationStore = new InMemoryConversationStore();
  const guidanceStore = new InMemoryGuidanceStore();
  const projectSearch = new InMemoryProjectSearch();
  // Empty skillPath triggers embedded THREE_PHASE_SUMMARY fallback — no file I/O in tests
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

/** Create a bare AdvisorSession (no intake, no turns). */
export function makeSession(orgId = 'org-nfum'): AdvisorSession {
  const sessionId = `test-session-${randomUUID()}`;
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

/** Create a representative IntakeSubmission for NFU Mutual. */
export function makeNfumIntake(overrides: Record<string, string | string[]> = {}): IntakeSubmission {
  return {
    submittedAt: new Date().toISOString(),
    formTitle: 'AI Advisor Intake Form',
    answers: {
      problem_plain_english:
        'Claims handlers spend too much time searching policy documents, internal guidance, previous claim notes, and repair guidance before deciding the next best action.',
      affected_people: 'Claims handlers, team leaders, brokers, and customers waiting for claim decisions.',
      why_now: 'Storm-related claims are increasing, and newer handlers need more support to make consistent decisions.',
      sensitive_information: ['personal customer data', 'financial information', 'property assessment records'],
      information_location: 'SharePoint libraries, policy PDFs, claims system notes',
      main_users: 'Claims handlers and team leaders',
      preferred_place_to_use_agent: ['Microsoft Teams', 'Claims system integration'],
      agent_should_interrupt: 'Only when flagging missing information or escalation triggers',
      user_experience_level: 'Mixed team — mostly claims handlers with varying tech confidence',
      business_knowledge: ['Policy documents', 'Claim procedures', 'Repair guidance notes'],
      must_not_happen: 'Agent must never commit claim decisions, approve payments, or make customer commitments without human review.',
      ...overrides,
    },
    validationState: 'valid',
  };
}

/** Create a minimal intake with no sensitive data (triggers the alternate Phase 1 question). */
export function makeMinimalIntake(orgId = 'org-test'): IntakeSubmission {
  return {
    submittedAt: new Date().toISOString(),
    formTitle: 'Minimal Test Intake',
    answers: {
      problem_plain_english: 'Need help finding HR policies',
      main_users: 'HR team',
      preferred_place_to_use_agent: ['Web chat'],
    },
    validationState: 'valid',
  };
}

/**
 * Drive the full Phase 1→2→3 flow and return the final recommendation.
 * Convenience helper used by regression and eval tests.
 */
export async function runFullFlow(
  orgId: string,
  intake: IntakeSubmission,
  deps = buildTestDeps(),
): Promise<{
  recommendation: import('@advisor/shared').RecommendationOutput;
  sessionId: string;
}> {
  const { conversationStore, orchestrator } = deps;

  const session = makeSession(orgId);
  const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: IntakeSubmission };
  await conversationStore.createSession(sessionWithIntake);

  // Phase 1 — submit intake
  await orchestrator.processIntake(sessionWithIntake, intake);

  // Phase 1 — user answers
  const s1 = await conversationStore.loadSession(session.sessionId);
  if (!s1) throw new Error('Session lost after intake');
  await orchestrator.processMessage(s1, 'Yes — SharePoint and system permissions are already in place.');

  // Phase 2 — user answers
  const s2 = await conversationStore.loadSession(session.sessionId);
  if (!s2) throw new Error('Session lost after phase1 answer');
  await orchestrator.processMessage(s2, 'Draft and recommend only — no system write-back in the POC.');

  // Phase 3 — proceed to recommendation
  const s3 = await conversationStore.loadSession(session.sessionId);
  if (!s3) throw new Error('Session lost after phase2 answer');
  await orchestrator.processMessage(s3, 'proceed');

  const finalSession = await conversationStore.loadSession(session.sessionId);
  if (!finalSession) throw new Error('Session lost before recommendation');

  const recommendation = await orchestrator.buildRecommendation(finalSession);
  return { recommendation, sessionId: session.sessionId };
}
