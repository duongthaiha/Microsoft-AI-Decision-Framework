/**
 * Phase 2 nine-questions + custom-instruction pre-answer gate tests.
 *
 * Verifies:
 * - Phase 2 question is generated after Phase 1 answer
 * - Pre-answered questions are recorded from custom instructions (not re-asked)
 * - Remaining open questions are still asked
 * - "do you need an agent?" pre-question evidence is captured in recommendation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AdvisorSession } from '@advisor/shared';
import { buildTestDeps, makeSession, makeNfumIntake, makeMinimalIntake } from './testHelpers.js';

describe('Phase 2 nine-questions + custom-instruction gate', () => {
  let deps: ReturnType<typeof buildTestDeps>;

  beforeEach(() => {
    deps = buildTestDeps();
  });

  it('processMessage() after Phase 1 answer generates a Phase 2 clarifying question', async () => {
    const session = makeSession('org-nfum');
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);

    const s = await deps.conversationStore.loadSession(session.sessionId);
    if (!s) throw new Error('Session lost');

    const result = await deps.orchestrator.processMessage(s, 'Yes — SharePoint permissions are in place.');

    expect(result.agentTurn.phase).toBe('phase2.technologyGroupings');
    expect(result.agentTurn.messageType).toBe('clarifyingQuestion');
  });

  it('Phase 2 question lists pre-answered custom instructions (not re-asked)', async () => {
    const session = makeSession('org-nfum');
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s = await deps.conversationStore.loadSession(session.sessionId);
    if (!s) throw new Error('Session lost');

    const result = await deps.orchestrator.processMessage(s, 'Yes — permissions in place.');

    // Custom instructions for NFU Mutual pre-answer phase2 questions
    expect(result.agentTurn.customInstructionAnswersUsed).toBeDefined();
    expect(result.agentTurn.customInstructionAnswersUsed!.length).toBeGreaterThan(0);
  });

  it('Phase 2 question content shows pre-answered instructions text', async () => {
    const session = makeSession('org-nfum');
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s = await deps.conversationStore.loadSession(session.sessionId);
    if (!s) throw new Error('Session lost');

    const result = await deps.orchestrator.processMessage(s, 'Yes — permissions in place.');

    expect(result.agentTurn.content).toContain('Pre-answered from your organization');
  });

  it('Phase 2 question still asks about at least one remaining question', async () => {
    const session = makeSession('org-nfum');
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s = await deps.conversationStore.loadSession(session.sessionId);
    if (!s) throw new Error('Session lost');

    const result = await deps.orchestrator.processMessage(s, 'Yes — permissions in place.');

    // The turn should still contain a question (Suggested answers or a question mark)
    expect(result.agentTurn.content).toMatch(/\?|Suggested answers/i);
  });

  it('org without custom instructions gets a Phase 2 question without pre-answer block', async () => {
    const session = makeSession('org-unknown');
    const intake = makeMinimalIntake('org-unknown');
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s = await deps.conversationStore.loadSession(session.sessionId);
    if (!s) throw new Error('Session lost');

    const result = await deps.orchestrator.processMessage(s, 'The problem is clear with known impact.');

    expect(result.agentTurn.phase).toBe('phase2.technologyGroupings');
    // No custom instructions → pre-answer block absent
    expect(result.agentTurn.content).not.toContain('Pre-answered from your organization');
  });

  it('readiness state advances to phase2InProgress after Phase 1 answer', async () => {
    const session = makeSession('org-nfum');
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s = await deps.conversationStore.loadSession(session.sessionId);
    if (!s) throw new Error('Session lost');

    const result = await deps.orchestrator.processMessage(s, 'Yes.');

    expect(result.readinessState).toBe('phase2InProgress');
  });
});
