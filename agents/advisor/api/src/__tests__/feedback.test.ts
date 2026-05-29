/**
 * Feedback capture tests.
 *
 * Verifies the submit/load feedback lifecycle on a session.
 * After a recommendation is delivered, the user can mark it useful/not-useful
 * with an optional reason. The feedback is persisted on the session record.
 */

import { describe, it, expect } from 'vitest';
import { buildTestDeps, makeSession, makeNfumIntake, runFullFlow } from './testHelpers.js';

describe('Feedback capture', () => {
  it('submitFeedback() stores a rating and loads it back correctly', async () => {
    const deps = buildTestDeps();
    const { sessionId } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    await deps.conversationStore.submitFeedback(sessionId, {
      userRating: 5,
      userComment: 'Very clear recommendation, well-aligned with our constraints.',
      reviewStatus: 'approved',
    });

    const stored = await deps.conversationStore.loadFeedback(sessionId);
    expect(stored).not.toBeNull();
    expect(stored!.userRating).toBe(5);
    expect(stored!.userComment).toContain('Very clear recommendation');
    expect(stored!.reviewStatus).toBe('approved');
  });

  it('submitFeedback() with low rating and reason is persisted', async () => {
    const deps = buildTestDeps();
    const { sessionId } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    await deps.conversationStore.submitFeedback(sessionId, {
      userRating: 2,
      userComment: 'Missing consideration of our existing Power Platform investment.',
      reviewStatus: 'pendingStakeholderReview',
    });

    const stored = await deps.conversationStore.loadFeedback(sessionId);
    expect(stored!.userRating).toBe(2);
    expect(stored!.userComment).toContain('Power Platform');
  });

  it('submitFeedback() with null rating (not yet rated) is accepted', async () => {
    const deps = buildTestDeps();
    const { sessionId } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    await deps.conversationStore.submitFeedback(sessionId, {
      userRating: null,
      userComment: null,
      reviewStatus: 'pendingStakeholderReview',
    });

    const stored = await deps.conversationStore.loadFeedback(sessionId);
    expect(stored!.userRating).toBeNull();
  });

  it('loadFeedback() returns null when no feedback has been submitted', async () => {
    const deps = buildTestDeps();
    const session = makeSession('org-nfum');
    await deps.conversationStore.createSession(session);

    const result = await deps.conversationStore.loadFeedback(session.sessionId);
    expect(result).toBeNull();
  });

  it('submitFeedback() on a non-existent session throws an error', async () => {
    const deps = buildTestDeps();

    await expect(
      deps.conversationStore.submitFeedback('session-does-not-exist', {
        userRating: 3,
        userComment: null,
        reviewStatus: 'pendingStakeholderReview',
      }),
    ).rejects.toThrow('Session not found');
  });

  it('overwriting feedback replaces the previous entry', async () => {
    const deps = buildTestDeps();
    const { sessionId } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    await deps.conversationStore.submitFeedback(sessionId, {
      userRating: 3,
      userComment: 'Initial review.',
      reviewStatus: 'pendingStakeholderReview',
    });

    // Stakeholder reviewed and updated rating
    await deps.conversationStore.submitFeedback(sessionId, {
      userRating: 4,
      userComment: 'After further review — recommendation is sound.',
      reviewStatus: 'approved',
    });

    const stored = await deps.conversationStore.loadFeedback(sessionId);
    expect(stored!.userRating).toBe(4);
    expect(stored!.reviewStatus).toBe('approved');
    expect(stored!.userComment).toContain('After further review');
  });
});
