#!/usr/bin/env node
/**
 * run-advisor-demo.mjs
 *
 * Walks the full AI Framework Advisor flow against the live API:
 *   1. Create session
 *   2. Submit NFU Mutual-style intake
 *   3. Loop messages until recommendation is ready (max 15 turns)
 *   4. Retrieve recommendation
 *   5. Retrieve similar projects (graceful if index not seeded)
 *   6. Submit feedback + end session
 *
 * Requirements: Node 20+ (uses global fetch, no dependencies)
 * Usage:
 *   node run-advisor-demo.mjs
 *   ADVISOR_BASE_URL=https://your-api.azurecontainerapps.io node run-advisor-demo.mjs
 */

const BASE_URL =
  process.env.ADVISOR_BASE_URL ??
  'https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io';

const CUSTOMER_ORG_ID = 'org-nfum';
const MAX_TURNS = 15;

// ---------------------------------------------------------------------------
// Canned answers for follow-up questions — keeps the demo fully automated
// ---------------------------------------------------------------------------
const CANNED_ANSWERS = [
  // BXT Phase 1 — Business Impact Assessment
  "Our claims handlers spend too much time searching policy documents and internal guidance before deciding on next best action. We want a claims assistant that helps them quickly find relevant guidance, identify missing evidence, and draft customer updates — all while keeping the handler in control of every decision.",
  // Technology questions (Phase 2)
  "The assistant needs to work inside our claims management system and Microsoft Teams. Handlers will ask it questions during live claim handling, so conversational interaction is key. We need it grounded on our internal SharePoint documents and policy PDFs.",
  // Follow-up on data/governance
  "Data sovereignty and regulatory compliance are non-negotiable. Customer PII and claim details must stay within our UK Azure tenant. Full audit trail required for every AI-assisted decision. We need to show the FCA we have human oversight.",
  // Follow-up on team/skills
  "Our IT team is comfortable with Microsoft's Azure platform and Power Platform. We have limited pro-code capacity right now, so a low-code or guided approach would suit us better than building from scratch.",
  // Follow-up on scale/integration
  "Around 500 claims handlers across the UK. Integration with our existing Microsoft 365 environment is a priority. We want something that feels native in Teams, not a separate standalone tool.",
  // Follow-up on deployment urgency
  "We'd like a pilot running within three months to coincide with storm season. Starting with rural property claims — our most complex and highest volume category.",
  // Phase 3 — Scenario selection
  "The primary scenario is a claims handler opening a rural property claim and needing guidance on policy wording, missing evidence checks, and a suggested customer update draft. The agent should wait to be asked but can proactively flag if high-risk indicators are present.",
  // Additional detail if asked
  "Success means handlers can resolve routine rural claims 30% faster with fewer escalations. We measure this via average handling time and escalation rate in our claims system.",
  // Edge case questions
  "We're not looking to fully automate claims decisions — the AI must always recommend and never decide. Any payment or coverage commitment stays with the human handler.",
  // Closing
  "yes",
  "confirm",
  "that's correct",
  "proceed with recommendation",
  "yes please",
];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function apiCall(method, path, body, attempt = 1) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    const json = await res.json();
    return { status: res.status, json };
  } catch (err) {
    if (attempt < 3) {
      console.log(`  ⚠ Network error (attempt ${attempt}/3): ${err.message} — retrying in 5s…`);
      await sleep(5000);
      return apiCall(method, path, body, attempt + 1);
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function banner(title) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function printAgentTurn(turn) {
  if (!turn) return;
  const phase = turn.phase ? ` [${turn.phase}]` : '';
  const type = turn.messageType ? ` (${turn.messageType})` : '';
  console.log(`\n  🤖 Agent${phase}${type}:`);
  const lines = turn.content.split('\n');
  for (const l of lines) console.log(`     ${l}`);
}

// ---------------------------------------------------------------------------
// Main demo flow
// ---------------------------------------------------------------------------

async function runDemo() {
  banner('AI Framework Advisor — End-to-End Demo');
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Org      : ${CUSTOMER_ORG_ID}`);
  console.log(`  Max turns: ${MAX_TURNS}`);

  // ------------------------------------------------------------------
  // Step 0: Health check (handles cold start)
  // ------------------------------------------------------------------
  banner('Step 0: Health check (cold-start probe)');
  console.log('  ⏳ Probing /health — first call may take 10–30 s if replica is cold…');

  let healthy = false;
  for (let i = 1; i <= 6; i++) {
    try {
      const { status, json } = await apiCall('GET', '/health');
      if (status === 200 && json.ok) {
        console.log(`  ✅ API healthy — service: ${json.service}, ts: ${json.ts}`);
        healthy = true;
        break;
      }
    } catch (_) {
      // ignore
    }
    console.log(`  ⏳ Not ready yet (attempt ${i}/6) — waiting 15 s…`);
    await sleep(15000);
  }

  if (!healthy) {
    console.error('  ❌ API did not respond after 90 s. Check the Container App replica state.');
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Step 1: Create session
  // ------------------------------------------------------------------
  banner('Step 1: Create session');
  const { status: s1, json: r1 } = await apiCall('POST', '/sessions', {
    customerOrganizationId: CUSTOMER_ORG_ID,
    userId: 'demo-user-sarah-williams',
  });

  if (s1 !== 201 || !r1.ok) {
    console.error(`  ❌ Failed to create session: ${JSON.stringify(r1)}`);
    process.exit(1);
  }

  const sessionId = r1.data.sessionId;
  console.log(`  ✅ Session created: ${sessionId}`);
  if (r1.data.activeInstructionSetId) {
    console.log(`  📋 Active instruction set: ${r1.data.activeInstructionSetId}`);
  }

  // ------------------------------------------------------------------
  // Step 2: Submit intake
  // ------------------------------------------------------------------
  banner('Step 2: Submit intake (NFU Mutual — rural claims assistant)');

  const intake = {
    submittedAt: new Date().toISOString(),
    formTitle: 'AI Advisor Intake Form',
    respondent: {
      name: 'Sarah Williams',
      role: 'Regional Claims Operations Manager',
      organisation: 'NFU Mutual',
      country: 'United Kingdom',
      areaOfExpertise: 'Rural insurance claims, especially farm property and weather-related damage',
    },
    answers: {
      problem_plain_english:
        'Claims handlers spend too much time searching policy documents, internal guidance, previous claim notes, and repair guidance before deciding the next best action.',
      affected_people:
        'Claims handlers, team leaders, brokers, and customers waiting for claim decisions.',
      why_now:
        'Storm-related claims are increasing, and newer handlers need more support to make consistent decisions.',
      success_description:
        'Handlers can quickly understand what guidance applies to a claim, what information is missing, and what they should do next.',
      improvement_measures: [
        'Faster claim triage',
        'Fewer escalations for routine cases',
        'More consistent decisions',
        'Better customer updates',
        'Less time searching documents',
      ],
      must_not_happen:
        'The AI should not approve or reject claims by itself. It should support the handler, not replace their judgement.',
      main_users: 'Claims handlers and claims team leaders.',
      user_experience_level:
        'Mixed experience. Some are senior specialists; others are newer handlers learning rural and agricultural claims.',
      current_work_locations:
        'They work across claims systems, email, Teams, policy documents, internal guidance, and case notes.',
      preferred_place_to_use_agent: ['Inside the claims system', 'Microsoft Teams'],
      moment_of_need:
        'When a handler opens a new rural property claim, reviews incoming evidence, prepares a customer update, or decides whether to escalate the case.',
      agent_should_interrupt: 'Both, depending on the situation',
      questions_to_answer: [
        'What policy wording may apply to this claim?',
        'What information is missing?',
        'Has this type of claim been handled before?',
        'What guidance should the handler consider?',
        'When should the claim be escalated?',
      ],
      tasks_to_help_complete: [
        'Summarise claim details',
        'Find relevant internal guidance',
        'Draft customer update messages',
        'Suggest next steps',
        'Highlight risks or missing information',
      ],
      human_owned_decisions:
        'Claim decisions, approvals, customer commitments, complaint handling, and any payment decision.',
      business_knowledge: [
        'Policy documents',
        'Claims handling guidance',
        'Farm property claim procedures',
        'Storm and flood claim guidance',
        'Previous similar case examples',
        'Escalation rules',
      ],
      information_location:
        'SharePoint, internal claims systems, email templates, policy PDFs, team guidance notes, and experienced colleagues knowledge.',
      information_freshness:
        'Not always. Some guidance is formal and current, while some local knowledge sits with senior handlers.',
      poor_advice_risk:
        'A handler could give the wrong customer message, miss an escalation point, or apply the wrong policy guidance.',
      sensitive_information: [
        'Customer personal data',
        'Claim details',
        'Financial information',
        'Medical information where relevant',
        'Commercially sensitive farm or business data',
      ],
      comfort_controls: [
        'Show where answers came from',
        'Make uncertainty clear',
        'Require human approval',
        'Keep an audit trail',
        'Respect existing access permissions',
        'Escalate complex or high-value claims',
      ],
      tone:
        'Clear, practical, and careful. It should sound like a helpful senior claims colleague, not a chatbot making decisions.',
      trust_factors:
        'It explains its reasoning, links to source guidance, flags uncertainty, and does not pretend to know things it cannot verify.',
      rejection_factors:
        'Generic answers, overconfidence, wrong policy references, or anything that feels like it is replacing claims expertise.',
      real_world_situation:
        'A customer reports storm damage to several outbuildings on a farm. The handler needs to understand what cover may apply, what evidence is needed, whether any exclusions matter, and whether the case should be escalated.',
      ai_expected_response:
        'Summarise the claim, find the relevant policy wording and claims guidance, list missing information, suggest the next handler actions, and draft a careful customer update.',
      ai_boundaries:
        'It should not confirm cover, reject the claim, approve payment, or send the customer message without handler review.',
      first_use_case:
        'Helping claims handlers find the right guidance quickly and understand the next best action for routine rural property claims.',
    },
    validationState: 'valid',
  };

  const { status: s2, json: r2 } = await apiCall('POST', `/sessions/${sessionId}/intake`, {
    intake,
  });

  if (s2 !== 200 || !r2.ok) {
    console.error(`  ❌ Intake submission failed: ${JSON.stringify(r2)}`);
    process.exit(1);
  }

  console.log('  ✅ Intake submitted');
  if (r2.data.firstAgentTurn) {
    printAgentTurn(r2.data.firstAgentTurn);
  }

  // ------------------------------------------------------------------
  // Step 3: Message loop
  // ------------------------------------------------------------------
  banner('Step 3: Message loop (until recommendation ready)');

  let readinessState = r2.data.firstAgentTurn?.messageType === 'recommendation'
    ? 'readyForRecommendation'
    : 'phase1InProgress';
  let lastAgentTurn = r2.data.firstAgentTurn ?? null;
  let turnCount = 0;
  let cannedIdx = 0;

  const terminalStates = new Set(['readyForRecommendation', 'recommendationDelivered', 'ended']);

  // Check if the first agent turn already put us in Phase 3 summary
  if (lastAgentTurn?.messageType === 'summary') {
    console.log('\n  ℹ Phase 3 summary received from intake — sending proceed trigger.');
  }

  while (!terminalStates.has(readinessState) && turnCount < MAX_TURNS) {
    turnCount++;

    // Phase-aware answer selection:
    // If the last agent turn was a Phase 3 summary asking to proceed → trigger it
    // If the last agent turn was a recommendation → we're done
    let answer;
    if (lastAgentTurn?.messageType === 'summary' && lastAgentTurn?.phase?.startsWith('phase3')) {
      answer = 'proceed';
    } else if (lastAgentTurn?.messageType === 'recommendation') {
      readinessState = 'readyForRecommendation';
      break;
    } else {
      answer = CANNED_ANSWERS[cannedIdx % CANNED_ANSWERS.length] ?? 'yes';
      cannedIdx++;
    }

    console.log(`\n  👤 User turn ${turnCount}: "${answer.substring(0, 80)}${answer.length > 80 ? '…' : ''}"`);

    const { status: sm, json: rm } = await apiCall('POST', `/sessions/${sessionId}/messages`, {
      content: answer,
    });

    if (sm !== 200 || !rm.ok) {
      console.error(`  ❌ Message failed: ${JSON.stringify(rm)}`);
      // Try to recover: check session state via latest messages endpoint
      const { status: sl, json: rl } = await apiCall('GET', `/sessions/${sessionId}/messages/latest`);
      if (sl === 200 && rl.ok) {
        readinessState = rl.data.readinessState ?? readinessState;
        lastAgentTurn = rl.data.latestAgentTurn ?? lastAgentTurn;
        console.log(`  🔄 Recovered state from /messages/latest: ${readinessState}`);
      }
      break;
    }

    readinessState = rm.data.readinessState ?? readinessState;
    lastAgentTurn = rm.data.agentTurn ?? lastAgentTurn;
    console.log(`  📊 Readiness: ${readinessState}`);
    printAgentTurn(rm.data.agentTurn);

    if (terminalStates.has(readinessState)) {
      console.log('\n  🎯 Recommendation gate reached!');
      break;
    }

    // Small pause to be kind to the API
    await sleep(500);
  }

  if (turnCount >= MAX_TURNS && !terminalStates.has(readinessState)) {
    console.log(`\n  ⚠ Reached ${MAX_TURNS} turn cap. Readiness state: ${readinessState}`);
    console.log('  Proceeding to retrieve recommendation anyway…');
  }

  // ------------------------------------------------------------------
  // Step 4: Retrieve recommendation
  // ------------------------------------------------------------------
  banner('Step 4: Retrieve recommendation');

  const { status: s4, json: r4 } = await apiCall('GET', `/sessions/${sessionId}/recommendation`);

  if (s4 === 200 && r4.ok) {
    const rec = r4.data.recommendation;
    console.log('\n  ✅ RECOMMENDATION RECEIVED\n');
    if (rec?.recommendedApproach?.summary) {
      console.log('  🏆 Primary Recommendation:');
      console.log(`     ${rec.recommendedApproach.summary}`);
      if (rec.recommendedApproach.primaryTechnologies?.length) {
        console.log('\n  🔧 Primary Technologies:');
        for (const t of rec.recommendedApproach.primaryTechnologies) {
          console.log(`     • ${t.name}: ${t.role}`);
        }
      }
    }
    if (rec?.rationale) {
      console.log('\n  📖 Rationale:');
      if (Array.isArray(rec.rationale)) {
        for (const r of rec.rationale) {
          console.log(`     • ${r.reason}`);
          if (r.evidence?.length) {
            for (const e of r.evidence) console.log(`       → ${e}`);
          }
        }
      } else {
        const lines = String(rec.rationale).split('\n');
        for (const l of lines) console.log(`     ${l}`);
      }
    }
    if (rec?.assumptions?.length) {
      console.log('\n  📌 Assumptions:');
      for (const a of rec.assumptions) console.log(`     • ${a}`);
    }
    const nextItems = rec?.followUpQuestions ?? rec?.nextSteps;
    if (nextItems?.length) {
      console.log('\n  🚀 Follow-up Questions / Next Steps:');
      for (const s of nextItems) console.log(`     • ${s}`);
    }
    // Print the raw object if structure differs
    if (!rec?.recommendedApproach && !rec?.rationale) {
      console.log('  Raw recommendation data:');
      console.log(JSON.stringify(rec, null, 4).split('\n').map((l) => `  ${l}`).join('\n'));
    }
  } else if (s4 === 422) {
    console.log(`  ⚠ Recommendation not ready yet (state: ${readinessState})`);
    console.log('  Full response:');
    console.log(JSON.stringify(r4, null, 2).split('\n').map((l) => `  ${l}`).join('\n'));
  } else {
    console.log(`  ⚠ Recommendation endpoint returned ${s4}:`);
    console.log(JSON.stringify(r4, null, 2).split('\n').map((l) => `  ${l}`).join('\n'));
  }

  // ------------------------------------------------------------------
  // Step 5: Similar projects (graceful if index not seeded)
  // ------------------------------------------------------------------
  banner('Step 5: Similar projects');

  const { status: s5, json: r5 } = await apiCall('GET', `/sessions/${sessionId}/similar-projects`);

  if (s5 === 200 && r5.ok) {
    const matches = r5.data.searchResult?.matches ?? [];
    const matchArray = Array.isArray(matches) ? matches : [];
    if (matchArray.length === 0) {
      console.log('  ℹ No similar projects found (Search index may not be seeded yet).');
    } else {
      console.log(`  ✅ Found ${matchArray.length} similar project(s):`);
      for (const m of matchArray) {
        console.log(`\n  📁 ${m.title ?? m.projectId ?? 'Unknown project'}`);
        if (m.matchRationale) console.log(`     ${m.matchRationale.substring(0, 120)}…`);
        if (m.score != null) console.log(`     Score: ${m.score.toFixed(3)}`);
      }
    }
  } else if (s5 === 500 && r5.error?.code === 'SEARCH_FAILURE') {
    // Expected when the AI Search index hasn't been seeded yet
    console.log('  ℹ Similar projects unavailable — the Search index is not yet seeded.');
    console.log('  (This is expected for fresh deployments. Run: npm run seed in agents/advisor/)');
  } else {
    console.log(`  ⚠ Similar projects returned ${s5} — skipping gracefully.`);
  }

  // ------------------------------------------------------------------
  // Step 6: Submit feedback + end session
  // ------------------------------------------------------------------
  banner('Step 6: Submit feedback');

  const { status: s6, json: r6 } = await apiCall('POST', `/sessions/${sessionId}/feedback`, {
    rating: 5,
    comment:
      'Excellent guidance — Copilot Studio + M365 Agents SDK recommendation was spot on for our Teams-first, low-code, compliance-heavy scenario.',
  });

  if (s6 === 200 && r6.ok) {
    console.log(`  ✅ Feedback recorded at ${r6.data.recordedAt}`);
  } else {
    console.log(`  ⚠ Feedback returned ${s6}: ${JSON.stringify(r6)}`);
  }

  banner('Step 7: End session');

  const { status: s7, json: r7 } = await apiCall('DELETE', `/sessions/${sessionId}`);

  if (s7 === 200 && r7.ok) {
    console.log(`  ✅ Session ended at ${r7.data.endedAt}`);
  } else {
    console.log(`  ⚠ End session returned ${s7}: ${JSON.stringify(r7)}`);
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  banner('Demo complete');
  console.log(`  Session  : ${sessionId}`);
  console.log(`  Turns    : ${turnCount}`);
  console.log(`  Final state: ${readinessState}`);
  console.log('');
}

runDemo().catch((err) => {
  console.error('\n❌ Demo failed with uncaught error:');
  console.error(err);
  process.exit(1);
});
