/**
 * Eval case: Custom-instruction pre-answer scenario.
 *
 * Uses the NFU Mutual org (which has 3 active custom instructions) and verifies
 * that the custom instructions pre-answer Phase 2 questions, reducing the number
 * of clarifying questions asked. The recommendation records instruction influence.
 *
 * This case specifically validates:
 * - Pre-answer gate fires: customInstructionAnswersUsed populated on Phase 2 turn
 * - Recommendation.customInstructionInfluence has entries for each instruction
 * - Instructions do NOT override verified framework facts (framework docs still cited)
 */

import type { IntakeSubmission } from '@advisor/shared';
import type { EvalCase } from '../runner.test.js';

export const customInstructionCase: EvalCase = {
  id: 'custom-instruction-pre-answer',
  name: 'Custom Instruction Pre-Answer Gate — NFU Mutual variant',
  description:
    'Verifies that active custom instructions pre-answer Phase 2 questions and record instruction influence without overriding verified framework guidance.',
  orgId: 'org-nfum',
  phase1Answer: 'Yes — data access controls are in place.',
  phase2Answer: 'Read-only plus draft — can read from systems, draft responses, but no writes.',
  intake: {
    submittedAt: '2026-05-29T12:00:00.000Z',
    formTitle: 'Custom Instruction Eval Intake',
    answers: {
      problem_plain_english: 'Policy specialists need a fast way to check coverage eligibility without leaving their claims system.',
      sensitive_information: ['personal customer data', 'policy information'],
      information_location: 'SharePoint document library, claims database',
      main_users: 'Policy specialists and compliance officers',
      preferred_place_to_use_agent: ['Microsoft Teams'],
      must_not_happen: 'Must not make coverage decisions autonomously.',
    },
    validationState: 'valid',
  } satisfies IntakeSubmission,
  expected: {
    phase1: {
      businessViabilityStrength: 'Strong',
      technologyFeasibilityStrength: 'Medium',
    },
    phase2Groupings: [
      'grouping2.extensibilityIntoExistingCopilots',
      'grouping3.buildAiAppsAndAgents',
      'grouping4.aiServicesAndBuildingBlocks',
    ],
    phase3PrimaryTechnologies: ['Microsoft Copilot Studio', 'Azure AI Search'],
    rationaleThemes: ['guidance', 'human', 'approval', 'Teams'],
    customInstructionCount: 3,
    expectSimilarProjectMatches: true,
    // Key eval check: instructions must influence the recommendation
    expectCustomInstructionInfluence: true,
    // Framework docs must still be cited (instructions don't override facts)
    expectFrameworkDocsCited: true,
  },
};
