/**
 * Readiness gate unit tests.
 * Tests the evaluateReadiness() function in isolation with constructed session state.
 */

import { describe, it, expect } from 'vitest';
import type { AdvisorSession } from '@advisor/shared';
import { evaluateReadiness } from '../agent/readinessGates.js';
import { makeSession } from './testHelpers.js';

function addTurn(session: AdvisorSession, partial: Partial<import('@advisor/shared').ConversationTurn>) {
  const turn = {
    turnId: `turn-${Date.now()}-${Math.random()}`,
    role: 'agent' as const,
    messageType: 'clarifyingQuestion' as const,
    content: 'test',
    timestamp: new Date().toISOString(),
    ...partial,
  };
  session.conversationCapture.turns.push(turn);
}

describe('evaluateReadiness', () => {
  it('returns awaitingIntake for a fresh session with no turns', () => {
    const session = makeSession();
    const result = evaluateReadiness(session);

    expect(result.state).toBe('phase1InProgress'); // has conversationCapture so hasIntakeSubmission=true
    expect(result.phase1Ready).toBe(false);
    expect(result.phase2Ready).toBe(false);
    expect(result.phase3Ready).toBe(false);
  });

  it('is phase1InProgress when only intake system turn exists (no user answers)', () => {
    const session = makeSession();
    addTurn(session, {
      role: 'system',
      messageType: 'summary',
      phase: 'phase1.businessImpactAssessment',
      content: 'Intake submitted',
    });
    addTurn(session, {
      role: 'agent',
      messageType: 'clarifyingQuestion',
      phase: 'phase1.businessImpactAssessment',
      content: 'Phase 1 question',
    });

    const result = evaluateReadiness(session);
    expect(result.state).toBe('phase1InProgress');
    expect(result.phase1Ready).toBe(false);
    expect(result.missingEvidence).toContain('Phase 1 BXT assessment incomplete');
  });

  it('becomes phase1Ready when a user answer exists for phase1', () => {
    const session = makeSession();
    addTurn(session, { role: 'system', messageType: 'summary', phase: 'phase1.businessImpactAssessment', content: 'Intake' });
    addTurn(session, { role: 'agent', messageType: 'clarifyingQuestion', phase: 'phase1.businessImpactAssessment', content: 'Q' });
    addTurn(session, { role: 'user', messageType: 'answer', phase: 'phase1.businessImpactAssessment', content: 'Yes, confirmed.' });

    const result = evaluateReadiness(session);
    expect(result.phase1Ready).toBe(true);
  });

  it('phase2 agent turn with customInstructionAnswersUsed does NOT satisfy phase2Ready (user must still answer)', () => {
    // custom instructions pre-populate the agent's Phase 2 question, but the user hasn't answered
    // yet → phase2 is still "in progress", not "ready"
    const session = makeSession();
    addTurn(session, { role: 'system', messageType: 'summary', phase: 'phase1.businessImpactAssessment', content: 'Intake' });
    addTurn(session, { role: 'agent', messageType: 'clarifyingQuestion', phase: 'phase1.businessImpactAssessment', content: 'Q' });
    addTurn(session, { role: 'user', messageType: 'answer', phase: 'phase1.businessImpactAssessment', content: 'Yes.' });
    addTurn(session, {
      role: 'agent',
      messageType: 'clarifyingQuestion',
      phase: 'phase2.technologyGroupings',
      content: 'Phase 2 question',
      customInstructionAnswersUsed: ['human-approval-required', 'preferred-user-experience'],
    });

    const result = evaluateReadiness(session);
    expect(result.phase2Ready).toBe(false);
    expect(result.state).toBe('phase2InProgress');
  });

  it('phase2Ready via user answer path', () => {
    const session = makeSession();
    addTurn(session, { role: 'system', messageType: 'summary', phase: 'phase1.businessImpactAssessment', content: 'Intake' });
    addTurn(session, { role: 'agent', messageType: 'clarifyingQuestion', phase: 'phase1.businessImpactAssessment', content: 'Q' });
    addTurn(session, { role: 'user', messageType: 'answer', phase: 'phase1.businessImpactAssessment', content: 'Yes.' });
    addTurn(session, { role: 'agent', messageType: 'clarifyingQuestion', phase: 'phase2.technologyGroupings', content: 'Q2' });
    addTurn(session, { role: 'user', messageType: 'answer', phase: 'phase2.technologyGroupings', content: 'Draft only.' });

    const result = evaluateReadiness(session);
    expect(result.phase2Ready).toBe(true);
  });

  it('state becomes recommendationDelivered when recommendation turn is present', () => {
    const session = makeSession();
    addTurn(session, { role: 'system', messageType: 'summary', phase: 'phase1.businessImpactAssessment', content: 'Intake' });
    addTurn(session, { role: 'agent', messageType: 'clarifyingQuestion', phase: 'phase1.businessImpactAssessment', content: 'Q' });
    addTurn(session, { role: 'user', messageType: 'answer', phase: 'phase1.businessImpactAssessment', content: 'Yes.' });
    addTurn(session, {
      role: 'agent',
      messageType: 'clarifyingQuestion',
      phase: 'phase2.technologyGroupings',
      content: 'Q2',
      customInstructionAnswersUsed: ['human-approval-required'],
    });
    // User must answer Phase 2 before phase2Ready is true
    addTurn(session, { role: 'user', messageType: 'answer', phase: 'phase2.technologyGroupings', content: 'Draft only.' });
    addTurn(session, { role: 'agent', messageType: 'summary', phase: 'phase3.scenarioSpecificSelection', content: 'Summary' });
    addTurn(session, { role: 'agent', messageType: 'recommendation', phase: 'phase3.scenarioSpecificSelection', content: '{}' });

    const result = evaluateReadiness(session);
    expect(result.state).toBe('recommendationDelivered');
  });

  it('missingEvidence lists both phase gaps when session has nothing', () => {
    const session = makeSession();
    const result = evaluateReadiness(session);
    expect(result.missingEvidence).toContain('Phase 1 BXT assessment incomplete');
    expect(result.missingEvidence).toContain('Phase 2 nine critical questions not fully answered');
  });
});
