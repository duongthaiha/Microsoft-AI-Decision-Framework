/**
 * Phase 1 BXT gating tests.
 *
 * Verifies that the orchestrator asks clarifying Phase 1 questions and does NOT
 * jump ahead to technology selection without BXT evidence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AdvisorSession } from '@advisor/shared';
import { buildTestDeps, makeSession, makeNfumIntake, makeMinimalIntake } from './testHelpers.js';

describe('Phase 1 BXT gating', () => {
  let session: AdvisorSession;
  let deps: ReturnType<typeof buildTestDeps>;

  beforeEach(async () => {
    deps = buildTestDeps();
    session = makeSession('org-nfum');
    await deps.conversationStore.createSession(session);
  });

  it('processIntake() generates a Phase 1 clarifying question', async () => {
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.updateSession(sessionWithIntake);

    const turn = await deps.orchestrator.processIntake(sessionWithIntake, intake);

    expect(turn.role).toBe('agent');
    expect(turn.messageType).toBe('clarifyingQuestion');
    expect(turn.phase).toBe('phase1.businessImpactAssessment');
  });

  it('Phase 1 question contains suggested answer options', async () => {
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.updateSession(sessionWithIntake);

    const turn = await deps.orchestrator.processIntake(sessionWithIntake, intake);

    expect(turn.content).toContain('Suggested answers');
  });

  it('Phase 1 question includes reasonAsked (audit trace)', async () => {
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.updateSession(sessionWithIntake);

    const turn = await deps.orchestrator.processIntake(sessionWithIntake, intake);

    expect(turn.reasonAsked).toBeTruthy();
    expect(typeof turn.reasonAsked).toBe('string');
  });

  it('asks about access controls when sensitive_information is populated', async () => {
    const intake = makeNfumIntake({
      sensitive_information: ['personal customer data', 'financial information'],
    });
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.updateSession(sessionWithIntake);

    const turn = await deps.orchestrator.processIntake(sessionWithIntake, intake);

    // The sensitive-data path asks about access controls, not the generic problem question
    expect(turn.content.toLowerCase()).toMatch(/access control|permission|sharepoint|sensitive/);
  });

  it('asks about measurable operational problem when no sensitive data', async () => {
    const intake = makeMinimalIntake();
    const session2 = makeSession('org-test');
    await deps.conversationStore.createSession(session2);
    const sessionWithIntake = { ...session2, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.updateSession(sessionWithIntake);

    const turn = await deps.orchestrator.processIntake(sessionWithIntake, intake);

    expect(turn.content.toLowerCase()).toMatch(/operational problem|business|impact|measurable/);
  });

  it('does NOT generate a Phase 2 or Phase 3 response from processIntake() alone', async () => {
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as AdvisorSession & { _intake: typeof intake };
    await deps.conversationStore.updateSession(sessionWithIntake);

    const turn = await deps.orchestrator.processIntake(sessionWithIntake, intake);

    expect(turn.phase).not.toBe('phase2.technologyGroupings');
    expect(turn.phase).not.toBe('phase3.scenarioSpecificSelection');
    expect(turn.messageType).not.toBe('recommendation');
  });
});
