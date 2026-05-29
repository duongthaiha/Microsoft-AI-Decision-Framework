/**
 * API-safe error tests.
 *
 * Verifies that invalid or missing session state produces typed errors
 * rather than silent fallbacks or undefined behaviour.
 */

import { describe, it, expect } from 'vitest';
import { buildTestDeps, makeSession, makeNfumIntake } from './testHelpers.js';

describe('API-safe errors — session and store', () => {
  it('loadSession() returns null for an unknown session ID (no throw)', async () => {
    const deps = buildTestDeps();
    const result = await deps.conversationStore.loadSession('session-does-not-exist');
    expect(result).toBeNull();
  });

  it('appendTurn() throws for a session that was never created', async () => {
    const deps = buildTestDeps();
    await expect(
      deps.conversationStore.appendTurn('ghost-session', {
        turnId: 'turn-1',
        role: 'user',
        messageType: 'answer',
        content: 'test',
        timestamp: new Date().toISOString(),
      }),
    ).rejects.toThrow('Session not found');
  });

  it('appendFact() throws for a session that was never created', async () => {
    const deps = buildTestDeps();
    await expect(
      deps.conversationStore.appendFact('ghost-session', {
        factId: 'fact-1',
        sourceTurnId: 'turn-1',
        text: 'test',
        usedFor: ['phase1.businessImpactAssessment'],
      }),
    ).rejects.toThrow('Session not found');
  });

  it('updateReadinessState() throws for a session that was never created', async () => {
    const deps = buildTestDeps();
    await expect(
      deps.conversationStore.updateReadinessState('ghost-session', 'phase1InProgress'),
    ).rejects.toThrow('Session not found');
  });

  it('endSession() throws for a session that was never created', async () => {
    const deps = buildTestDeps();
    await expect(
      deps.conversationStore.endSession('ghost-session', new Date().toISOString()),
    ).rejects.toThrow('Session not found');
  });

  it('processMessage() throws when session cannot be found after update (simulates lost session)', async () => {
    const deps = buildTestDeps();
    const session = makeSession('org-nfum');
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: typeof intake };
    await deps.conversationStore.createSession(sessionWithIntake);

    // Start intake, then try to send a message without the session update
    // by constructing a session reference to a non-existent ID
    const fakeSession = { ...session, sessionId: 'missing-session-id' };
    await expect(
      deps.orchestrator.processMessage(fakeSession, 'some answer'),
    ).rejects.toThrow('Session not found');
  });

  it('submitFeedback() throws for unknown session', async () => {
    const deps = buildTestDeps();
    await expect(
      deps.conversationStore.submitFeedback('no-such-session', {
        userRating: 4,
        userComment: null,
        reviewStatus: 'approved',
      }),
    ).rejects.toThrow('Session not found');
  });

  it('loadFeedback() returns null (not throws) for an unknown session', async () => {
    const deps = buildTestDeps();
    const result = await deps.conversationStore.loadFeedback('no-such-session');
    expect(result).toBeNull();
  });
});
