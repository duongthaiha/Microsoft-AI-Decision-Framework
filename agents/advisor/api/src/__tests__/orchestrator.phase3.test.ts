/**
 * Phase 3 scenario selection + recommendation output quality tests.
 *
 * Verifies:
 * - Recommendation is generated after Phase 2 answer + proceed
 * - Output separates recommendation, rationale, trade-offs, evidence, instruction influence
 * - Framework combinations present (not single-product shortcut)
 * - Evidence sources are tracked and include customInstructions + intake
 * - Similar project highlights are populated when search finds matches
 * - Custom instruction influence has entries for each active instruction
 * - Trade-offs are present with acceptedForPoc field
 * - Follow-up questions are present
 */

import { describe, it, expect } from 'vitest';
import { buildTestDeps, makeSession, makeNfumIntake, runFullFlow } from './testHelpers.js';

describe('Phase 3 scenario selection and recommendation output quality', () => {
  it('generates a Phase 3 summary after Phase 2 answer', async () => {
    const deps = buildTestDeps();
    const session = makeSession('org-nfum');
    const intake = makeNfumIntake();
    const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: typeof intake };
    await deps.conversationStore.createSession(sessionWithIntake);

    await deps.orchestrator.processIntake(sessionWithIntake, intake);
    const s1 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s1) throw new Error('Session lost');
    await deps.orchestrator.processMessage(s1, 'Yes — permissions in place.');

    const s2 = await deps.conversationStore.loadSession(session.sessionId);
    if (!s2) throw new Error('Session lost');
    const result = await deps.orchestrator.processMessage(s2, 'Draft and recommend only — no write-back.');

    // After Phase 2 complete, agent generates Phase 3 summary
    expect(result.agentTurn.phase).toBe('phase3.scenarioSpecificSelection');
    expect(result.agentTurn.messageType).toBe('summary');
  });

  it('recommendation turn is generated after the proceed message', async () => {
    const deps = buildTestDeps();
    const { recommendation } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    expect(recommendation).toBeDefined();
    expect(recommendation.status).toBe('recommendationReady');
  });

  it('recommendation output has all required fields', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    expect(rec.generatedAt).toBeTruthy();
    expect(rec.status).toBe('recommendationReady');
    expect(rec.confidence).toBeTruthy();
    expect(rec.recommendedApproach).toBeDefined();
    expect(rec.recommendedApproach.summary).toBeTruthy();
    expect(rec.recommendedApproach.primaryTechnologies.length).toBeGreaterThan(0);
    expect(rec.recommendedApproach.supportingTechnologies.length).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(rec.rationale)).toBe(true);
    expect(rec.rationale.length).toBeGreaterThan(0);
    expect(Array.isArray(rec.customInstructionInfluence)).toBe(true);
    expect(Array.isArray(rec.tradeOffs)).toBe(true);
    expect(Array.isArray(rec.assumptions)).toBe(true);
    expect(Array.isArray(rec.followUpQuestions)).toBe(true);
    expect(Array.isArray(rec.similarProjectHighlights)).toBe(true);
    expect(Array.isArray(rec.decisionEvidenceSources)).toBe(true);
  });

  it('recommendation primary technologies include a framework COMBINATION (not single product)', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    const primaryNames = rec.recommendedApproach.primaryTechnologies.map((t) => t.name.toLowerCase());
    // Must include at least two distinct primary technologies
    expect(rec.recommendedApproach.primaryTechnologies.length).toBeGreaterThanOrEqual(2);
    // NFU scenario must recommend Copilot Studio
    expect(primaryNames.some((n) => n.includes('copilot studio'))).toBe(true);
    // And Azure AI Search for grounded retrieval
    expect(primaryNames.some((n) => n.includes('azure ai search') || n.includes('ai search'))).toBe(true);
  });

  it('evidence sources include intake and customInstructions', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    expect(rec.decisionEvidenceSources).toContain('intake');
    expect(rec.decisionEvidenceSources).toContain('customInstructions');
  });

  it('custom instruction influence has an entry for each NFU Mutual instruction', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    // NFU Mutual has 3 instructions: human-approval-required, preferred-user-experience, grounded-answers-only
    expect(rec.customInstructionInfluence.length).toBe(3);
    const ids = rec.customInstructionInfluence.map((ci) => ci.instructionId);
    expect(ids).toContain('human-approval-required');
    expect(ids).toContain('preferred-user-experience');
    expect(ids).toContain('grounded-answers-only');
  });

  it('custom instruction influence includes non-empty effect descriptions', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    for (const ci of rec.customInstructionInfluence) {
      expect(ci.effect).toBeTruthy();
      expect(ci.effect.length).toBeGreaterThan(10);
    }
  });

  it('similar project highlights are populated when search finds matches', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    // NFU intake has insurance/claims keywords that match seed projects
    expect(rec.similarProjectHighlights.length).toBeGreaterThan(0);
    for (const h of rec.similarProjectHighlights) {
      expect(h.projectId).toBeTruthy();
      expect(h.title).toBeTruthy();
      expect(h.whyItMatters).toBeTruthy();
    }
  });

  it('trade-offs are present and have acceptedForPoc field', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    expect(rec.tradeOffs.length).toBeGreaterThanOrEqual(2);
    for (const t of rec.tradeOffs) {
      expect(t.tradeOff).toBeTruthy();
      expect(typeof t.acceptedForPoc).toBe('boolean');
    }
  });

  it('rationale entries have evidence arrays', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    for (const r of rec.rationale) {
      expect(r.reason).toBeTruthy();
      expect(Array.isArray(r.evidence)).toBe(true);
      expect(r.evidence.length).toBeGreaterThan(0);
    }
  });

  it('assumptions and follow-up questions are non-empty', async () => {
    const deps = buildTestDeps();
    const { recommendation: rec } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    expect(rec.assumptions.length).toBeGreaterThan(0);
    expect(rec.followUpQuestions.length).toBeGreaterThan(0);
  });

  it('buildRecommendation() from cached turn returns same shape (no re-generation)', async () => {
    const deps = buildTestDeps();
    const { sessionId } = await runFullFlow('org-nfum', makeNfumIntake(), deps);

    const finalSession = await deps.conversationStore.loadSession(sessionId);
    if (!finalSession) throw new Error('Session lost');

    const rec1 = await deps.orchestrator.buildRecommendation(finalSession);
    const rec2 = await deps.orchestrator.buildRecommendation(finalSession);

    // Both calls should return equivalent recommendations
    expect(rec1.status).toBe(rec2.status);
    expect(rec1.recommendedApproach.primaryTechnologies.length).toBe(rec2.recommendedApproach.primaryTechnologies.length);
  });
});
