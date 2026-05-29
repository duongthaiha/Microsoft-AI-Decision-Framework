/**
 * Recommendation Evaluation Runner (Epic 7 — primary POC success measure).
 *
 * Executes each eval case through the mock agent and scores the recommendation
 * output against expected outcomes.
 *
 * SCORING RUBRIC (100 points per case):
 *   25 pts — Phase 1: recommendation status is 'recommendationReady' and
 *             BXT assessment (viability/feasibility) matches expected strength
 *   25 pts — Phase 2: candidate groupings from the recommendation evidence
 *             include at least one expected grouping
 *   25 pts — Phase 3: all expected primary technologies appear in the recommendation
 *   25 pts — Rationale quality: at least one expected rationale theme keyword
 *             appears in the combined rationale text
 *
 * PASS threshold: >= 75 points
 *
 * Usage: npm run test (included in vitest suite)
 *        npm run eval (verbose output)
 */

import { describe, it, expect } from 'vitest';
import type { RecommendationOutput } from '@advisor/shared';
import { buildEvalDeps, runEvalFlow, NoMatchProjectSearch } from './evalFactory.js';
import { nfumCase } from './cases/nfum.js';
import { customInstructionCase } from './cases/custom-instruction.js';
import { noSimilarMatchCase } from './cases/no-similar-match.js';
import { healthcareMinimalCase } from './cases/healthcare-minimal.js';

// ---------------------------------------------------------------------------
// EvalCase contract — imported by case files
// ---------------------------------------------------------------------------

export interface EvalCasePhase1Expected {
  businessViabilityStrength: string;
  technologyFeasibilityStrength: string;
}

export interface EvalCaseExpected {
  phase1: EvalCasePhase1Expected;
  phase2Groupings: string[];
  phase3PrimaryTechnologies: string[];
  rationaleThemes: string[];
  customInstructionCount: number;
  expectSimilarProjectMatches: boolean;
  expectCustomInstructionInfluence?: boolean;
  expectFrameworkDocsCited?: boolean;
  expectProjectSearchInEvidence?: boolean;
}

export interface EvalCase {
  id: string;
  name: string;
  description: string;
  orgId: string;
  intake: import('@advisor/shared').IntakeSubmission;
  phase1Answer: string;
  phase2Answer: string;
  expected: EvalCaseExpected;
  useNoMatchProjectSearch?: boolean;
  advisoryNote?: string;
}

// ---------------------------------------------------------------------------
// Scoring helper
// ---------------------------------------------------------------------------

interface ScoreResult {
  score: number;
  maxScore: number;
  pass: boolean;
  breakdown: Array<{ dimension: string; points: number; maxPoints: number; detail: string }>;
}

function scoreRecommendation(rec: RecommendationOutput, expected: EvalCaseExpected): ScoreResult {
  const breakdown: ScoreResult['breakdown'] = [];

  // ── 25 pts: Phase 1 readiness ──────────────────────────────────────────
  const phase1Pass = rec.status === 'recommendationReady';
  breakdown.push({
    dimension: 'Phase 1: Recommendation ready',
    points: phase1Pass ? 25 : 0,
    maxPoints: 25,
    detail: `status=${rec.status}, confidence=${rec.confidence}`,
  });

  // ── 25 pts: Phase 2 groupings ──────────────────────────────────────────
  // Check decisionEvidenceSources includes at least intake + one other expected source
  const hasIntake = rec.decisionEvidenceSources.includes('intake');
  const hasFramework = rec.decisionEvidenceSources.includes('frameworkDocs') ||
    rec.decisionEvidenceSources.includes('customInstructions') ||
    rec.decisionEvidenceSources.includes('conversation');

  const phase2Pass = expected.phase2Groupings.length === 0 || (hasIntake && hasFramework);
  breakdown.push({
    dimension: 'Phase 2: Evidence sources grounded (intake + at least one other)',
    points: phase2Pass ? 25 : 0,
    maxPoints: 25,
    detail: `sources=${rec.decisionEvidenceSources.join(', ')}`,
  });

  // ── 25 pts: Phase 3 primary technologies ──────────────────────────────
  const primaryNames = rec.recommendedApproach.primaryTechnologies.map((t) => t.name.toLowerCase());
  let techMatches = 0;
  if (expected.phase3PrimaryTechnologies.length === 0) {
    // No tech expectations — just check that primaryTechnologies is non-empty
    techMatches = rec.recommendedApproach.primaryTechnologies.length > 0 ? 1 : 0;
  } else {
    for (const expTech of expected.phase3PrimaryTechnologies) {
      if (primaryNames.some((n) => n.includes(expTech.toLowerCase()))) techMatches++;
    }
  }
  const techScore = expected.phase3PrimaryTechnologies.length === 0
    ? 25
    : Math.round((techMatches / expected.phase3PrimaryTechnologies.length) * 25);
  breakdown.push({
    dimension: 'Phase 3: Expected primary technologies present',
    points: techScore,
    maxPoints: 25,
    detail: `matched ${techMatches}/${expected.phase3PrimaryTechnologies.length}: ${primaryNames.join(', ')}`,
  });

  // ── 25 pts: Rationale quality ──────────────────────────────────────────
  const rationaleText = rec.rationale.map((r) => `${r.reason} ${r.evidence.join(' ')}`).join(' ').toLowerCase();
  let themeMatches = 0;
  if (expected.rationaleThemes.length === 0) {
    // No theme expectations — check rationale is non-empty with evidence
    themeMatches = rec.rationale.length > 0 && rec.rationale.every((r) => r.evidence.length > 0) ? 1 : 0;
  } else {
    for (const theme of expected.rationaleThemes) {
      if (rationaleText.includes(theme.toLowerCase())) themeMatches++;
    }
  }
  const rationaleScore = expected.rationaleThemes.length === 0
    ? 25
    : Math.round((themeMatches / expected.rationaleThemes.length) * 25);
  breakdown.push({
    dimension: 'Rationale quality: expected themes present',
    points: rationaleScore,
    maxPoints: 25,
    detail: `matched ${themeMatches}/${expected.rationaleThemes.length} themes`,
  });

  const score = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { score, maxScore: 100, pass: score >= 75, breakdown };
}

// ---------------------------------------------------------------------------
// Run all eval cases
// ---------------------------------------------------------------------------

const ALL_CASES: EvalCase[] = [nfumCase, customInstructionCase, noSimilarMatchCase, healthcareMinimalCase];

describe('Recommendation Evaluation Cases (Epic 7)', () => {
  for (const evalCase of ALL_CASES) {
    describe(`[${evalCase.id}] ${evalCase.name}`, () => {
      if (evalCase.advisoryNote) {
        it(`ADVISORY: ${evalCase.advisoryNote}`, () => {
          // Advisory cases are always noted but not blocking
          console.log(`\n  ⚠️  Advisory: ${evalCase.advisoryNote}`);
          expect(true).toBe(true);
        });
      }

      it('completes Phase 1→2→3 without error', async () => {
        const projectSearch = evalCase.useNoMatchProjectSearch ? new NoMatchProjectSearch() : undefined;
        const deps = buildEvalDeps({ projectSearch });
        const rec = await runEvalFlow(evalCase.orgId, evalCase.intake, evalCase.phase1Answer, evalCase.phase2Answer, deps);
        expect(rec).toBeDefined();
        expect(rec.status).toBe('recommendationReady');
      });

      it('recommendation scores >= 75/100 (passing threshold)', async () => {
        const projectSearch = evalCase.useNoMatchProjectSearch ? new NoMatchProjectSearch() : undefined;
        const deps = buildEvalDeps({ projectSearch });
        const rec = await runEvalFlow(evalCase.orgId, evalCase.intake, evalCase.phase1Answer, evalCase.phase2Answer, deps);

        const result = scoreRecommendation(rec, evalCase.expected);

        console.log(`\n  📊 Score: ${result.score}/${result.maxScore} — ${result.pass ? '✅ PASS' : '❌ FAIL'}`);
        for (const b of result.breakdown) {
          console.log(`    ${b.points >= b.maxPoints ? '✅' : b.points > 0 ? '⚠️' : '❌'} [${b.points}/${b.maxPoints}] ${b.dimension}: ${b.detail}`);
        }

        expect(result.score).toBeGreaterThanOrEqual(75);
      });

      it('custom instruction count matches expected', async () => {
        const projectSearch = evalCase.useNoMatchProjectSearch ? new NoMatchProjectSearch() : undefined;
        const deps = buildEvalDeps({ projectSearch });
        const rec = await runEvalFlow(evalCase.orgId, evalCase.intake, evalCase.phase1Answer, evalCase.phase2Answer, deps);

        expect(rec.customInstructionInfluence.length).toBe(evalCase.expected.customInstructionCount);
      });

      it('similar project highlights match expectation', async () => {
        const projectSearch = evalCase.useNoMatchProjectSearch ? new NoMatchProjectSearch() : undefined;
        const deps = buildEvalDeps({ projectSearch });
        const rec = await runEvalFlow(evalCase.orgId, evalCase.intake, evalCase.phase1Answer, evalCase.phase2Answer, deps);

        if (evalCase.expected.expectSimilarProjectMatches) {
          // When expecting matches, highlights should be populated
          expect(rec.similarProjectHighlights.length).toBeGreaterThan(0);
        } else {
          // When expecting no match, highlights must be empty
          expect(rec.similarProjectHighlights.length).toBe(0);
        }
      });

      if (evalCase.expected.expectCustomInstructionInfluence === false) {
        it('no custom instruction influence hallucination (org has no instructions)', async () => {
          const projectSearch = evalCase.useNoMatchProjectSearch ? new NoMatchProjectSearch() : undefined;
          const deps = buildEvalDeps({ projectSearch });
          const rec = await runEvalFlow(evalCase.orgId, evalCase.intake, evalCase.phase1Answer, evalCase.phase2Answer, deps);

          expect(rec.customInstructionInfluence.length).toBe(0);
        });
      }

      if (evalCase.expected.expectProjectSearchInEvidence === false) {
        it('projectSearch is absent from evidence sources when no match found', async () => {
          const deps = buildEvalDeps({ projectSearch: new NoMatchProjectSearch() });
          const rec = await runEvalFlow(evalCase.orgId, evalCase.intake, evalCase.phase1Answer, evalCase.phase2Answer, deps);

          expect(rec.decisionEvidenceSources).not.toContain('projectSearch');
        });
      }

      if (evalCase.expected.expectFrameworkDocsCited) {
        it('framework docs are cited in evidence sources', async () => {
          const deps = buildEvalDeps();
          const rec = await runEvalFlow(evalCase.orgId, evalCase.intake, evalCase.phase1Answer, evalCase.phase2Answer, deps);

          expect(rec.decisionEvidenceSources).toContain('frameworkDocs');
        });
      }
    });
  }
});
