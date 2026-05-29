#!/usr/bin/env node
/**
 * @advisor/cli — AI Framework Advisor CLI test harness.
 *
 * Exercises the full Phase 1→2→3 flow against in-memory adapters + mock agent.
 * Usage: node dist/index.js [--org org-nfum] [--intake path/to/intake.json]
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import API internals directly (no HTTP needed — same process)
// We import from the dist output since CLI and API are sibling workspaces
import type { IntakeSubmission, RecommendationOutput } from '@advisor/shared';
import { isNoMatchFound } from '@advisor/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const orgId = getArg(args, '--org') ?? 'org-nfum';
  const intakePath = getArg(args, '--intake') ??
    resolve(__dirname, '../../../backlog/sample-intake-form-nfum.json');

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        AI Framework Advisor — CLI Test Harness             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`Organization: ${orgId}`);
  console.log(`Intake file:  ${intakePath}\n`);

  // Dynamically import API components (built output)
  let buildDependencies: unknown;
  let createApp: unknown;

  try {
    const compMod = await import('../../api/dist/composition.js');
    const appMod = await import('../../api/dist/app.js');
    buildDependencies = compMod.buildDependencies;
    createApp = appMod.createApp;
  } catch (err) {
    console.error('ERROR: Could not load @advisor/api. Run `npm run build` from agents/advisor/ first.');
    console.error(String(err));
    process.exit(1);
  }

  const deps = (buildDependencies as any)();
  const { conversationStore, orchestrator } = deps;

  // ── Step 1: Load intake form and build submission ────────────────────────
  console.log('── Step 1: Loading intake form ─────────────────────────────');
  const intakeForm = JSON.parse(readFileSync(intakePath, 'utf-8')) as { sections: Array<{ questions: Array<{ id: string; sampleAnswer?: unknown }> }> };

  const answers: Record<string, string | string[]> = {};
  for (const section of intakeForm.sections) {
    for (const q of section.questions) {
      if (q.sampleAnswer !== undefined) {
        answers[q.id] = q.sampleAnswer as string | string[];
      }
    }
  }

  const intake: IntakeSubmission = {
    submittedAt: new Date().toISOString(),
    formTitle: (intakeForm as { formTitle?: string }).formTitle ?? 'AI Advisor Intake Form',
    answers,
    validationState: 'valid',
  };
  console.log(`  ✓ Loaded ${Object.keys(answers).length} answers from intake form\n`);

  // ── Step 2: Create session ───────────────────────────────────────────────
  console.log('── Step 2: Creating advisor session ────────────────────────');
  const sessionId = `cli-session-${Date.now()}`;
  const now = new Date().toISOString();
  const session = {
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
      readinessState: 'awaitingIntake' as const,
    },
  };
  await conversationStore.createSession(session);
  console.log(`  ✓ Session created: ${sessionId}\n`);

  // ── Step 3: Submit intake ────────────────────────────────────────────────
  console.log('── Step 3: Submitting intake → Phase 1 begins ───────────────');
  const sessionWithIntake = { ...session, _intake: intake } as typeof session & { _intake: IntakeSubmission };
  await conversationStore.updateSession(sessionWithIntake);

  const firstTurn = await orchestrator.processIntake(sessionWithIntake, intake);
  console.log(`\n  [AGENT — ${firstTurn.phase}]`);
  console.log(`  ${firstTurn.content.slice(0, 300)}...\n`);

  // ── Step 4: Phase 1 answer ───────────────────────────────────────────────
  console.log('── Step 4: Answering Phase 1 BXT question ───────────────────');
  const phase1Answer = 'Yes — SharePoint and claims-system permissions are already in place and maintained by claims operations.';
  console.log(`  [USER]: ${phase1Answer}`);

  const loadedSession1 = await conversationStore.loadSession(sessionId);
  if (!loadedSession1) throw new Error('Session lost');
  const result1 = await orchestrator.processMessage(loadedSession1, phase1Answer);
  console.log(`\n  [AGENT — ${result1.agentTurn.phase}] (readiness: ${result1.readinessState})`);
  if (result1.agentTurn.customInstructionAnswersUsed?.length) {
    console.log(`  ⚡ Custom instructions pre-answered: ${result1.agentTurn.customInstructionAnswersUsed.join(', ')}`);
  }
  console.log(`  ${result1.agentTurn.content.slice(0, 400)}...\n`);

  // ── Step 5: Phase 2 answer ───────────────────────────────────────────────
  console.log('── Step 5: Answering Phase 2 action-safety question ─────────');
  const phase2Answer = 'For the POC it should only draft and recommend actions. No claims-system write-back.';
  console.log(`  [USER]: ${phase2Answer}`);

  const loadedSession2 = await conversationStore.loadSession(sessionId);
  if (!loadedSession2) throw new Error('Session lost');
  const result2 = await orchestrator.processMessage(loadedSession2, phase2Answer);
  console.log(`\n  [AGENT — ${result2.agentTurn.phase}] (readiness: ${result2.readinessState})`);
  console.log(`  ${result2.agentTurn.content.slice(0, 400)}...\n`);

  // ── Step 6: Proceed to recommendation ───────────────────────────────────
  console.log('── Step 6: Requesting recommendation (Phase 3) ──────────────');
  const loadedSession3 = await conversationStore.loadSession(sessionId);
  if (!loadedSession3) throw new Error('Session lost');
  const result3 = await orchestrator.processMessage(loadedSession3, 'proceed');
  console.log(`\n  [AGENT] (readiness: ${result3.readinessState})`);

  // ── Step 7: Retrieve and display recommendation ──────────────────────────
  console.log('\n── Step 7: Retrieving final recommendation ───────────────────');
  const finalSession = await conversationStore.loadSession(sessionId);
  if (!finalSession) throw new Error('Session lost');

  const recommendation = await orchestrator.buildRecommendation(finalSession);
  printRecommendation(recommendation as RecommendationOutput);

  // ── Step 8: Similar projects ─────────────────────────────────────────────
  console.log('\n── Step 8: Similar project lookup ────────────────────────────');
  const similarResult = await orchestrator.searchSimilarProjects(finalSession);
  if (isNoMatchFound(similarResult)) {
    console.log(`  No similar projects found: ${similarResult.reason}`);
  } else {
    console.log(`  Found ${similarResult.length} similar project(s):`);
    for (const match of similarResult) {
      console.log(`  - [${match.score.toFixed(2)}] ${match.title}`);
      console.log(`    → ${match.matchRationale.slice(0, 100)}`);
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  CLI harness complete — all phases exercised successfully  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

function printRecommendation(rec: RecommendationOutput): void {
  console.log('\n┌─ RECOMMENDATION OUTPUT ────────────────────────────────────┐');
  console.log(`  Status:     ${rec.status}`);
  console.log(`  Confidence: ${rec.confidence}`);
  console.log(`\n  RECOMMENDED APPROACH:`);
  console.log(`  ${rec.recommendedApproach.summary}`);
  console.log(`\n  PRIMARY TECHNOLOGIES:`);
  for (const t of rec.recommendedApproach.primaryTechnologies) {
    console.log(`  - ${t.name}: ${t.role}`);
  }
  console.log(`\n  RATIONALE (${rec.rationale.length} entries):`);
  for (const r of rec.rationale.slice(0, 2)) {
    console.log(`  • ${r.reason}`);
    console.log(`    Evidence: ${r.evidence[0] ?? 'N/A'}`);
  }
  console.log(`\n  CUSTOM INSTRUCTION INFLUENCE:`);
  for (const ci of rec.customInstructionInfluence) {
    console.log(`  [${ci.instructionId}] ${ci.effect}`);
  }
  console.log(`\n  SIMILAR PROJECT HIGHLIGHTS:`);
  if (rec.similarProjectHighlights.length === 0) {
    console.log('  None found.');
  }
  for (const sp of rec.similarProjectHighlights) {
    console.log(`  - ${sp.title}: ${sp.whyItMatters.slice(0, 80)}`);
  }
  console.log(`\n  DECISION EVIDENCE SOURCES: ${rec.decisionEvidenceSources.join(', ')}`);
  console.log(`\n  TRADE-OFFS:`);
  for (const t of rec.tradeOffs) {
    console.log(`  • ${t.tradeOff.slice(0, 90)} [POC accepted: ${t.acceptedForPoc}]`);
  }
  console.log('└────────────────────────────────────────────────────────────┘');

  // Print full JSON at end
  console.log('\n── Full RecommendationOutput JSON ────────────────────────────');
  console.log(JSON.stringify(rec, null, 2));
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

main().catch((err) => {
  console.error('CLI harness failed:', err);
  process.exit(1);
});
