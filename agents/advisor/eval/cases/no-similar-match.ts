/**
 * Eval case: No similar-project match scenario.
 *
 * Uses an unknown org (no custom instructions) with a niche use case where the
 * InMemoryProjectSearch returns noMatchFound. Verifies that:
 * - The recommendation is still generated (not blocked by missing projects)
 * - similarProjectHighlights is empty
 * - The recommendation is honest about the absence of reference projects
 * - decisionEvidenceSources does NOT include 'projectSearch'
 */

import type { IntakeSubmission } from '@advisor/shared';
import type { EvalCase } from '../runner.test.js';

export const noSimilarMatchCase: EvalCase = {
  id: 'no-similar-match',
  name: 'No Similar Project Match — niche IoT use case',
  description:
    'A manufacturing org needs an agent to monitor IoT sensor data and alert engineers to anomalies. No prior similar projects in the search index. Verifies the honest "no match found" path.',
  orgId: 'org-unknown',
  phase1Answer: 'Yes — there is a clear operational problem with measurable impact on production uptime.',
  phase2Answer: 'We need the agent to only send alerts to engineers — no automated machine controls.',
  intake: {
    submittedAt: '2026-05-29T12:00:00.000Z',
    formTitle: 'IoT Anomaly Detection Eval Intake',
    answers: {
      problem_plain_english: 'Production engineers miss early warning signs from IoT sensor data causing unplanned downtime.',
      sensitive_information: [] as string[],
      information_location: 'Azure IoT Hub telemetry streams',
      main_users: 'Production engineers',
      preferred_place_to_use_agent: ['Web chat', 'Email alerts'],
    },
    validationState: 'valid',
  } satisfies IntakeSubmission,
  expected: {
    phase1: {
      businessViabilityStrength: 'Strong',
      technologyFeasibilityStrength: 'Medium',
    },
    phase2Groupings: [
      'grouping3.buildAiAppsAndAgents',
      'grouping4.aiServicesAndBuildingBlocks',
    ],
    phase3PrimaryTechnologies: [],
    rationaleThemes: [],
    customInstructionCount: 0,
    // The key assertion: no similar projects should be in the highlights
    expectSimilarProjectMatches: false,
    // projectSearch should be absent from evidence sources when no match
    expectProjectSearchInEvidence: false,
  },
  // Force no-match by overriding project search
  useNoMatchProjectSearch: true,
};
