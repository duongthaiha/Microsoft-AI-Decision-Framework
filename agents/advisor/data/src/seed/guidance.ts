/**
 * Seed CustomerGuidanceDocument records.
 *
 * One document per organization. These are the "active" starting state for
 * the POC — the loader upserts them with activeFlag = true.
 *
 * org-nfum is the primary POC reference org, consistent with
 * agents/backlog/sample-project-data-nfum.json and InMemoryGuidanceStore.
 *
 * No real customer-sensitive data.
 */

import type { CustomerGuidanceDocument } from '@advisor/shared';

export const SEED_GUIDANCE_DOCUMENTS: CustomerGuidanceDocument[] = [
  // -------------------------------------------------------------------------
  // NFU Mutual — Rural Claims Advisor
  // -------------------------------------------------------------------------
  {
    instructionSetId: 'instr-nfum-claims-001',
    customerOrganizationId: 'org-nfum',
    version: 3,
    activeFlag: true,
    scope: 'customerOrganization',
    activeFrom: '2026-05-20T09:00:00.000+01:00',
    organizationContext: {
      companySummary:
        'NFU Mutual is a UK insurance organization serving rural and agricultural ' +
        'customers where trust, consistency, and human accountability are critical.',
      businessPriorities: [
        'Improve claim handler productivity',
        'Preserve customer trust during weather-related claim spikes',
        'Support newer handlers with consistent guidance',
      ],
      preferredChannels: ['Microsoft Teams', 'Claims system integration'],
      operatingConstraints: [
        'Claim decisions and payments require human accountability',
        'Coverage interpretation must remain grounded in approved policy and guidance sources',
        'Recommendations should be explainable to team leaders and compliance reviewers',
      ],
      technologyPreferences: [
        'Prefer Microsoft 365 and Azure services already approved by the organization',
        'Favor reusable agent patterns over one-off automation',
      ],
    },
    instructions: [
      {
        id: 'human-approval-required',
        text:
          'Recommendations must preserve human ownership of claim decisions, approvals, ' +
          'customer commitments, complaint handling, and payment decisions.',
        appliesToFrameworkQuestions: ['phase2.action_safety', 'phase3.trade_offs_accepted'],
      },
      {
        id: 'preferred-user-experience',
        text:
          'Prioritize solutions that can appear in Microsoft Teams and later integrate ' +
          'into the claims system.',
        appliesToFrameworkQuestions: [
          'phase2.user_interaction_pattern',
          'phase3.architecture_pattern',
        ],
      },
      {
        id: 'grounded-answers-only',
        text:
          'The agent must show source guidance, flag uncertainty, and avoid making ' +
          'coverage decisions.',
        appliesToFrameworkQuestions: [
          'phase2.data_strategy',
          'phase2.compliance_governance',
          'phase3.recommendation_quality',
        ],
      },
    ],
    lastEditedBy: 'admin@nfumutual.co.uk',
    lastEditedAt: '2026-05-20T09:00:00.000+01:00',
    auditTrail: [
      {
        changedAt: '2026-05-20T09:00:00.000+01:00',
        changedBy: 'admin@nfumutual.co.uk',
        changeType: 'created',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Demo org — generic enterprise AI project
  // (useful for demo scenarios outside the insurance vertical)
  // -------------------------------------------------------------------------
  {
    instructionSetId: 'instr-demo-enterprise-001',
    customerOrganizationId: 'org-demo',
    version: 1,
    activeFlag: true,
    scope: 'customerOrganization',
    activeFrom: '2026-05-29T13:00:00.000+01:00',
    organizationContext: {
      companySummary:
        'Generic enterprise organization evaluating Microsoft AI technology for ' +
        'internal knowledge management and employee productivity use cases.',
      businessPriorities: [
        'Improve employee productivity with AI-assisted tools',
        'Reduce time spent finding internal information',
      ],
      preferredChannels: ['Microsoft Teams', 'SharePoint'],
      operatingConstraints: [
        'Must use Microsoft-approved services only',
        'Data must remain within the Azure tenant',
      ],
      technologyPreferences: [
        'Prefer low-code solutions where possible',
        'Microsoft 365 ecosystem preferred',
      ],
    },
    instructions: [
      {
        id: 'm365-first',
        text:
          'Prioritize Microsoft 365 and Copilot Studio solutions before recommending ' +
          'pro-code or custom-build options.',
        appliesToFrameworkQuestions: [
          'phase2.build_style_control_level',
          'phase3.architecture_pattern',
        ],
      },
      {
        id: 'data-residency',
        text:
          'All data must remain within the organization Azure tenant — no external ' +
          'data processing or third-party models.',
        appliesToFrameworkQuestions: [
          'phase2.compliance_governance',
          'phase2.data_strategy',
        ],
      },
    ],
    lastEditedBy: 'admin@demo.example.com',
    lastEditedAt: '2026-05-29T13:00:00.000+01:00',
    auditTrail: [
      {
        changedAt: '2026-05-29T13:00:00.000+01:00',
        changedBy: 'admin@demo.example.com',
        changeType: 'created',
      },
    ],
  },
];
