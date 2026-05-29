/**
 * Eval case: NFU Mutual — Insurance claims guidance assistant.
 *
 * Industry: Insurance (UK rural/agricultural)
 * Custom instructions: Yes (3 NFU Mutual instructions)
 * Similar projects: Expected matches (insurance domain)
 * Expected recommendation: Copilot Studio + Azure AI Search + Azure OpenAI
 */

import type { IntakeSubmission } from '@advisor/shared';
import type { EvalCase } from '../runner.test.js';

export const nfumCase: EvalCase = {
  id: 'nfum-insurance-claims-guidance',
  name: 'NFU Mutual — Insurance Claims Guidance Assistant',
  description:
    'Claims handlers need an assistive agent in Microsoft Teams to retrieve policy guidance, summarize procedures, and flag missing information. Human approval required for all claim decisions.',
  orgId: 'org-nfum',
  phase1Answer: 'Yes — SharePoint and claims-system permissions are already in place and maintained by claims operations.',
  phase2Answer: 'For the POC it should only draft and recommend actions. No claims-system write-back.',
  intake: {
    submittedAt: '2026-05-29T12:00:00.000Z',
    formTitle: 'AI Advisor Intake Form',
    answers: {
      problem_plain_english:
        'Claims handlers spend too much time searching policy documents, internal guidance, previous claim notes, and repair guidance before deciding the next best action.',
      sensitive_information: ['personal customer data', 'financial information', 'property assessment records'],
      information_location: 'SharePoint libraries, policy PDFs, claims system notes',
      main_users: 'Claims handlers and team leaders',
      preferred_place_to_use_agent: ['Microsoft Teams', 'Claims system integration'],
      business_knowledge: ['Policy documents', 'Claim procedures', 'Repair guidance notes'],
      must_not_happen: 'Agent must never commit claim decisions, approve payments, or make customer commitments without human review.',
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
    rationaleThemes: ['guidance retrieval', 'Teams', 'human', 'grounded'],
    customInstructionCount: 3,
    expectSimilarProjectMatches: true,
  },
};
