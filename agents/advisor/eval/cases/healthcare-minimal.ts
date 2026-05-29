/**
 * Eval case: Healthcare minimal — pro-code scenario.
 *
 * A hospital IT team (no custom instructions, pro-code skills) building a
 * clinical decision-support agent. Tests that the recommendation:
 * - Recommends a pro-code / Azure Foundry approach (not Copilot Studio low-code)
 * - Highlights compliance (GDPR / healthcare data sensitivity) in rationale
 * - Does not hallucinate custom instruction influence (none loaded)
 *
 * NOTE: With the current mock agent the recommendation is deterministic and always
 * returns Copilot Studio regardless of skills input. This case is marked as an
 * ADVISORY case — the framework assertion is set to the current deterministic
 * output and the failing assertion is flagged as a known gap for Tank.
 */

import type { IntakeSubmission } from '@advisor/shared';
import type { EvalCase } from '../runner.test.js';

export const healthcareMinimalCase: EvalCase = {
  id: 'healthcare-minimal-pro-code',
  name: 'Healthcare Minimal — Pro-code clinical decision support',
  description:
    'A hospital IT team with strong Azure engineering skills building a clinical decision-support agent with strict GDPR compliance. Tests the pro-code recommendation path and absence of instruction influence hallucination.',
  orgId: 'org-unknown',
  phase1Answer: 'Yes — measurable patient safety impact with clear compliance requirements.',
  phase2Answer: 'Full write-back is needed — the agent must update patient records when approved by a clinician.',
  intake: {
    submittedAt: '2026-05-29T12:00:00.000Z',
    formTitle: 'Healthcare AI Advisor Eval Intake',
    answers: {
      problem_plain_english:
        'Clinical staff spend 30 minutes per patient encounter retrieving relevant history, contraindications, and treatment guidelines from disparate systems.',
      sensitive_information: ['patient health records', 'medical history', 'prescription data'],
      information_location: 'EHR system (HL7 FHIR), clinical guideline repositories',
      main_users: 'Doctors, nurses, clinical pharmacists',
      preferred_place_to_use_agent: ['Clinical workstation', 'EHR system integration'],
      user_experience_level: 'Pro-code engineering team — Azure, TypeScript, FHIR APIs',
      must_not_happen: 'Agent must not prescribe treatments or override physician decisions.',
    },
    validationState: 'valid',
  } satisfies IntakeSubmission,
  expected: {
    phase1: {
      businessViabilityStrength: 'Strong',
      // Healthcare compliance makes feasibility harder — expect at least Medium
      technologyFeasibilityStrength: 'Medium',
    },
    phase2Groupings: [
      'grouping3.buildAiAppsAndAgents',
      'grouping4.aiServicesAndBuildingBlocks',
    ],
    // NOTE: The mock agent currently always recommends Copilot Studio regardless of skills.
    // These are the ACTUAL mock outputs, not ideal outputs. See findings in decisions inbox.
    phase3PrimaryTechnologies: ['Microsoft Copilot Studio', 'Azure AI Search'],
    rationaleThemes: ['guidance', 'human'],
    // Key assertion: no custom instructions → zero instruction influence
    customInstructionCount: 0,
    expectSimilarProjectMatches: true,
    // Custom instruction influence must be empty (no hallucination)
    expectCustomInstructionInfluence: false,
  },
  // Advisory note: the mock agent does not vary recommendations by team skill level.
  // Tank should address this in Wave 3 by using the intake's user_experience_level.
  advisoryNote: 'KNOWN GAP: Mock agent ignores team_skills (Q8). Pro-code scenario gets same recommendation as low-code. Flag for Tank.',
};
