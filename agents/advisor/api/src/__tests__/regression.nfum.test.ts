/**
 * NFU Mutual CLI Regression Test (Epic 2).
 *
 * Scripted, asserted end-to-end run that drives the NFU Mutual sample intake
 * through Phase 1→2→3 with custom-instruction pre-answering and similar-project
 * lookup. Asserts the complete recommendation output shape and content.
 *
 * Run via: npm test (included in vitest suite) or npm run regression from root.
 *
 * This test exercises the same logical path as the CLI harness but as a
 * programmatic vitest test with explicit assertions — making it machine-checkable
 * and repeatable without interactive I/O.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntakeSubmission } from '@advisor/shared';
import { isNoMatchFound } from '@advisor/shared';
import { buildTestDeps, makeSession } from './testHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load the real NFU Mutual sample intake form and extract answers. */
function loadNfumIntakeFromFile(): IntakeSubmission {
  const formPath = resolve(__dirname, '../../../../../backlog/sample-intake-form-nfum.json');
  let rawForm: unknown;
  try {
    rawForm = JSON.parse(readFileSync(formPath, 'utf-8'));
  } catch {
    // File may not be accessible in all environments — use inline fallback
    return {
      submittedAt: new Date().toISOString(),
      formTitle: 'AI Advisor Intake Form',
      answers: {
        problem_plain_english: 'Claims handlers spend too much time searching policy documents and guidance.',
        sensitive_information: ['personal customer data', 'financial information'],
        information_location: 'SharePoint, policy PDFs, claims system notes',
        main_users: 'Claims handlers and team leaders',
        preferred_place_to_use_agent: ['Microsoft Teams', 'Claims system integration'],
        business_knowledge: ['Policy documents', 'Claim procedures', 'Repair guidance'],
        must_not_happen: 'Agent must never commit claim decisions or approve payments without human review.',
      },
      validationState: 'valid',
    };
  }

  const form = rawForm as { formTitle?: string; sections?: Array<{ questions: Array<{ id: string; sampleAnswer?: unknown }> }> };
  const answers: Record<string, string | string[]> = {};
  for (const section of form.sections ?? []) {
    for (const q of section.questions) {
      if (q.sampleAnswer !== undefined) {
        answers[q.id] = q.sampleAnswer as string | string[];
      }
    }
  }
  return {
    submittedAt: new Date().toISOString(),
    formTitle: form.formTitle ?? 'AI Advisor Intake Form',
    answers,
    validationState: 'valid',
  };
}

describe('NFU Mutual CLI regression — Phase 1→2→3 full flow', () => {
  const intake = loadNfumIntakeFromFile();
  const ORG_ID = 'org-nfum';

  it('Step 1: intake has at least 5 answers extracted', () => {
    expect(Object.keys(intake.answers).length).toBeGreaterThanOrEqual(5);
  });

  it('Step 2: processIntake() generates a Phase 1 BXT question with Suggested answers', async () => {
    const deps = buildTestDeps();
    const session = makeSession(ORG_ID);
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: IntakeSubmission };
    await deps.conversationStore.createSession(sessionWithIntake);

    const turn = await deps.orchestrator.processIntake(sessionWithIntake, intake);

    expect(turn.role).toBe('agent');
    expect(turn.phase).toBe('phase1.businessImpactAssessment');
    expect(turn.content).toContain('Suggested answers');
    expect(turn.reasonAsked).toBeTruthy();
  });

  it('Step 3: Phase 1 answer transitions to Phase 2 with custom-instruction pre-answering', async () => {
    const deps = buildTestDeps();
    const session = makeSession(ORG_ID);
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: IntakeSubmission };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s1 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s1) throw new Error('Session lost after intake');

    const PHASE1_ANSWER =
      'Yes — SharePoint and claims-system permissions are already in place and maintained by claims operations.';
    const result1 = await deps.orchestrator.processMessage(s1, PHASE1_ANSWER);

    expect(result1.agentTurn.phase).toBe('phase2.technologyGroupings');
    // NFU Mutual has 3 custom instructions that should pre-answer Phase 2 questions
    expect(result1.agentTurn.customInstructionAnswersUsed).toBeDefined();
    expect(result1.agentTurn.customInstructionAnswersUsed!.length).toBeGreaterThanOrEqual(1);
    expect(result1.agentTurn.content).toContain('Pre-answered from your organization');
    expect(result1.readinessState).toBe('phase2InProgress');
  });

  it('Step 4: Phase 2 answer transitions to Phase 3 summary', async () => {
    const deps = buildTestDeps();
    const session = makeSession(ORG_ID);
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: IntakeSubmission };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s1 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s1) throw new Error();
    await deps.orchestrator.processMessage(s1, 'Yes — SharePoint permissions in place.');

    const s2 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s2) throw new Error();
    const PHASE2_ANSWER = 'For the POC it should only draft and recommend actions. No claims-system write-back.';
    const result2 = await deps.orchestrator.processMessage(s2, PHASE2_ANSWER);

    expect(result2.agentTurn.phase).toBe('phase3.scenarioSpecificSelection');
    expect(result2.agentTurn.messageType).toBe('summary');
    expect(result2.agentTurn.content).toMatch(/Teams|guidance|Interaction pattern/i);
  });

  it('Step 5: "proceed" message generates recommendation', async () => {
    const deps = buildTestDeps();
    const session = makeSession(ORG_ID);
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: IntakeSubmission };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s1 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s1) throw new Error();
    await deps.orchestrator.processMessage(s1, 'Yes — permissions in place.');

    const s2 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s2) throw new Error();
    await deps.orchestrator.processMessage(s2, 'Draft and recommend only — no write-back.');

    const s3 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s3) throw new Error();
    const result3 = await deps.orchestrator.processMessage(s3, 'proceed');

    expect(result3.agentTurn.messageType).toBe('recommendation');
    expect(result3.readinessState).toBe('recommendationDelivered');
  });

  it('Step 6: recommendation output shape — all required fields present', async () => {
    const deps = buildTestDeps();
    const session = makeSession(ORG_ID);
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: IntakeSubmission };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s1 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s1) throw new Error();
    await deps.orchestrator.processMessage(s1, 'Yes — permissions in place.');
    const s2 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s2) throw new Error();
    await deps.orchestrator.processMessage(s2, 'Draft only.');
    const s3 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s3) throw new Error();
    await deps.orchestrator.processMessage(s3, 'proceed');

    const finalSession = await deps.conversationStore.loadSession(session.sessionId);
    if (!finalSession) throw new Error();
    const rec = await deps.orchestrator.buildRecommendation(finalSession);

    // Required top-level fields
    expect(rec.status).toBe('recommendationReady');
    expect(rec.confidence).toMatch(/Low|Medium|High/);
    expect(rec.generatedAt).toBeTruthy();

    // Required sections
    expect(rec.recommendedApproach.summary.length).toBeGreaterThan(20);
    expect(rec.recommendedApproach.primaryTechnologies.length).toBeGreaterThanOrEqual(2);
    expect(rec.rationale.length).toBeGreaterThanOrEqual(2);
    expect(rec.customInstructionInfluence.length).toBe(3);
    expect(rec.tradeOffs.length).toBeGreaterThanOrEqual(2);
    expect(rec.assumptions.length).toBeGreaterThan(0);
    expect(rec.followUpQuestions.length).toBeGreaterThan(0);
    expect(rec.decisionEvidenceSources).toContain('intake');
    expect(rec.decisionEvidenceSources).toContain('customInstructions');
  });

  it('Step 7: recommendation content — Copilot Studio + Azure AI Search in primary stack', async () => {
    const deps = buildTestDeps();
    const session = makeSession(ORG_ID);
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: IntakeSubmission };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s1 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s1) throw new Error();
    await deps.orchestrator.processMessage(s1, 'Yes — permissions in place.');
    const s2 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s2) throw new Error();
    await deps.orchestrator.processMessage(s2, 'Draft only.');
    const s3 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s3) throw new Error();
    await deps.orchestrator.processMessage(s3, 'proceed');

    const finalSession = await deps.conversationStore.loadSession(session.sessionId);
    if (!finalSession) throw new Error();
    const rec = await deps.orchestrator.buildRecommendation(finalSession);

    const names = rec.recommendedApproach.primaryTechnologies.map((t) => t.name.toLowerCase());
    expect(names.some((n) => n.includes('copilot studio'))).toBe(true);
    expect(names.some((n) => n.includes('ai search'))).toBe(true);
  });

  it('Step 8: similar project lookup returns relevant matches (not noMatchFound)', async () => {
    const deps = buildTestDeps();
    const session = makeSession(ORG_ID);
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: IntakeSubmission };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s1 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s1) throw new Error();
    await deps.orchestrator.processMessage(s1, 'Yes — permissions in place.');
    const s2 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s2) throw new Error();
    await deps.orchestrator.processMessage(s2, 'Draft only.');
    const s3 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s3) throw new Error();
    await deps.orchestrator.processMessage(s3, 'proceed');

    const finalSession = await deps.conversationStore.loadSession(session.sessionId);
    if (!finalSession) throw new Error();

    const similarResult = await deps.orchestrator.searchSimilarProjects(finalSession);

    expect(isNoMatchFound(similarResult)).toBe(false);
    if (!isNoMatchFound(similarResult)) {
      expect(similarResult.length).toBeGreaterThan(0);
      const first = similarResult[0]!;
      expect(first.projectId).toBeTruthy();
      expect(first.score).toBeGreaterThan(0.5);
    }
  });
});
