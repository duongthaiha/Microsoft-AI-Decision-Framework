#!/usr/bin/env node
/**
 * @advisor/cli — NFU Mutual regression runner.
 *
 * Scripted, asserted run of the full Phase 1→2→3 flow using the sample NFU
 * Mutual intake form. Exits with code 0 on all assertions passing, code 1 on
 * any failure. Designed to be run from CI or as part of `npm run regression`.
 *
 * Usage: node dist/regression.js [--org org-nfum] [--intake path/to/intake.json]
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntakeSubmission, RecommendationOutput } from '@advisor/shared';
import { isNoMatchFound } from '@advisor/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passCount++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.log(`  ❌ FAIL: ${msg}`);
    failures.push(msg);
    failCount++;
  }
}

function assertContains(label: string, haystack: string, needle: string): void {
  assert(label, haystack.toLowerCase().includes(needle.toLowerCase()), `Expected to contain: "${needle}"`);
}

// ---------------------------------------------------------------------------
// Main regression runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const orgId = getArg(args, '--org') ?? 'org-nfum';
  const intakePath = getArg(args, '--intake') ??
    resolve(__dirname, '../../../backlog/sample-intake-form-nfum.json');

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      AI Framework Advisor — NFU Mutual Regression Run      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // ── Load API dependencies ────────────────────────────────────────────────
  let buildDependencies: unknown;
  try {
    const compMod = await import('../../api/dist/composition.js');
    buildDependencies = compMod.buildDependencies;
  } catch (err) {
    console.error('ERROR: Could not load @advisor/api. Run `npm run build` first.');
    console.error(String(err));
    process.exit(1);
  }

  const deps = await (buildDependencies as () => Promise<{ conversationStore: any; orchestrator: any }>)();
  const { conversationStore, orchestrator } = deps;

  // ── Load intake form ─────────────────────────────────────────────────────
  let intake: IntakeSubmission;
  try {
    const raw = JSON.parse(readFileSync(intakePath, 'utf-8')) as {
      formTitle?: string;
      sections?: Array<{ questions: Array<{ id: string; sampleAnswer?: unknown }> }>;
    };
    const answers: Record<string, string | string[]> = {};
    for (const s of raw.sections ?? []) {
      for (const q of s.questions) {
        if (q.sampleAnswer !== undefined) answers[q.id] = q.sampleAnswer as string | string[];
      }
    }
    intake = { submittedAt: new Date().toISOString(), formTitle: raw.formTitle ?? 'Test', answers, validationState: 'valid' };
  } catch {
    console.error(`Could not load intake file: ${intakePath}`);
    process.exit(1);
  }

  console.log(`Organization: ${orgId}  |  Intake answers: ${Object.keys(intake.answers).length}\n`);

  // ── Create session ───────────────────────────────────────────────────────
  const sessionId = `regression-${Date.now()}`;
  const now = new Date().toISOString();
  const session = {
    sessionId, customerOrganizationId: orgId, createdAt: now, updatedAt: now, lastActivityAt: now,
    conversationCapture: { sessionId, startedAt: now, turns: [], capturedFacts: [], readinessState: 'awaitingIntake' as const },
  };
  const sessionWithIntake = { ...session, _intake: intake };
  await conversationStore.createSession(sessionWithIntake);

  console.log('── PHASE 1: BXT Assessment ──────────────────────────────────');

  // ── Step 1: processIntake ────────────────────────────────────────────────
  const firstTurn = await orchestrator.processIntake(sessionWithIntake, intake);
  assert('Phase 1 question generated (role=agent)', firstTurn.role === 'agent');
  assert('Phase 1 question phase is phase1.businessImpactAssessment', firstTurn.phase === 'phase1.businessImpactAssessment');
  assert('Phase 1 question messageType is clarifyingQuestion', firstTurn.messageType === 'clarifyingQuestion');
  assertContains('Phase 1 question contains Suggested answers', firstTurn.content, 'Suggested answers');
  assert('Phase 1 question has reasonAsked audit trace', !!firstTurn.reasonAsked);

  // ── Step 2: Phase 1 answer ───────────────────────────────────────────────
  const s1 = await conversationStore.loadSession(sessionId);
  const result1 = await orchestrator.processMessage(s1, 'Yes — SharePoint and claims-system permissions are already in place and maintained by claims operations.');

  console.log('\n── PHASE 2: Technology Groupings ────────────────────────────');
  assert('Phase 2 question generated (phase2.technologyGroupings)', result1.agentTurn.phase === 'phase2.technologyGroupings');
  assert('Readiness advanced to phase2InProgress', result1.readinessState === 'phase2InProgress');
  assert('Custom instructions pre-answered Phase 2 questions', (result1.agentTurn.customInstructionAnswersUsed?.length ?? 0) >= 1);
  assertContains('Phase 2 content shows pre-answered instructions', result1.agentTurn.content, 'Pre-answered from your organization');

  // ── Step 3: Phase 2 answer ───────────────────────────────────────────────
  const s2 = await conversationStore.loadSession(sessionId);
  const result2 = await orchestrator.processMessage(s2, 'For the POC it should only draft and recommend actions. No claims-system write-back.');

  console.log('\n── PHASE 3: Scenario Selection & Recommendation ─────────────');
  assert('Phase 3 summary generated (phase3.scenarioSpecificSelection)', result2.agentTurn.phase === 'phase3.scenarioSpecificSelection');
  assert('Phase 3 turn is a summary', result2.agentTurn.messageType === 'summary');

  // ── Step 4: Proceed to recommendation ───────────────────────────────────
  const s3 = await conversationStore.loadSession(sessionId);
  const result3 = await orchestrator.processMessage(s3, 'proceed');
  assert('Recommendation turn generated', result3.agentTurn.messageType === 'recommendation');
  assert('Readiness is recommendationDelivered', result3.readinessState === 'recommendationDelivered');

  // ── Step 5: Validate recommendation output shape ─────────────────────────
  const finalSession = await conversationStore.loadSession(sessionId);
  const rec = await orchestrator.buildRecommendation(finalSession) as RecommendationOutput;

  assert('status = recommendationReady', rec.status === 'recommendationReady');
  assert('confidence is set', !!rec.confidence);
  assert('recommendedApproach.summary is non-empty', rec.recommendedApproach.summary.length > 20);
  assert('primaryTechnologies >= 2 (framework combination)', rec.recommendedApproach.primaryTechnologies.length >= 2);
  assert('rationale has >= 2 entries', rec.rationale.length >= 2);
  assert('customInstructionInfluence has 3 entries (NFU Mutual)', rec.customInstructionInfluence.length === 3);
  assert('tradeOffs has >= 2 entries', rec.tradeOffs.length >= 2);
  assert('assumptions is non-empty', rec.assumptions.length > 0);
  assert('followUpQuestions is non-empty', rec.followUpQuestions.length > 0);
  assert('decisionEvidenceSources includes intake', rec.decisionEvidenceSources.includes('intake'));
  assert('decisionEvidenceSources includes customInstructions', rec.decisionEvidenceSources.includes('customInstructions'));

  const primaryNames = rec.recommendedApproach.primaryTechnologies.map((t: { name: string }) => t.name.toLowerCase());
  assert('Copilot Studio in primary technologies', primaryNames.some((n: string) => n.includes('copilot studio')));
  assert('Azure AI Search in primary technologies', primaryNames.some((n: string) => n.includes('ai search')));

  const instructionIds = rec.customInstructionInfluence.map((ci: { instructionId: string }) => ci.instructionId);
  assert('human-approval-required instruction influence present', instructionIds.includes('human-approval-required'));
  assert('preferred-user-experience instruction influence present', instructionIds.includes('preferred-user-experience'));
  assert('grounded-answers-only instruction influence present', instructionIds.includes('grounded-answers-only'));

  // ── Step 6: Similar project lookup ───────────────────────────────────────
  console.log('\n── STEP 8: Similar Project Lookup ───────────────────────────');
  const similarResult = await orchestrator.searchSimilarProjects(finalSession);
  assert('Similar project search returns results (not noMatchFound)', !isNoMatchFound(similarResult));
  if (!isNoMatchFound(similarResult)) {
    assert('At least one similar project found', similarResult.length > 0);
    assert('Top match has score > 0.5', (similarResult[0]?.score ?? 0) > 0.5);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log(`║  Regression complete: ${passCount} passed, ${failCount} failed                       ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (failures.length > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(`  • ${f}`);
    console.log('');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

main().catch((err) => {
  console.error('Regression runner crashed:', err);
  process.exit(1);
});
