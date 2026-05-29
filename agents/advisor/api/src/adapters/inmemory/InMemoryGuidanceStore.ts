import type { IGuidanceStore } from '@advisor/shared';
import type { CustomerGuidanceDocument } from '@advisor/shared';

const NFU_GUIDANCE: CustomerGuidanceDocument = {
  instructionSetId: 'instr-nfum-claims-001',
  customerOrganizationId: 'org-nfum',
  version: 3,
  activeFlag: true,
  scope: 'customerOrganization',
  activeFrom: '2026-05-20T09:00:00.000+01:00',
  organizationContext: {
    companySummary: 'NFU Mutual is a UK insurance organization serving rural and agricultural customers where trust, consistency, and human accountability are critical.',
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
      text: 'Recommendations must preserve human ownership of claim decisions, approvals, customer commitments, complaint handling, and payment decisions.',
      appliesToFrameworkQuestions: ['phase2.action_safety', 'phase3.trade_offs_accepted'],
    },
    {
      id: 'preferred-user-experience',
      text: 'Prioritize solutions that can appear in Microsoft Teams and later integrate into the claims system.',
      appliesToFrameworkQuestions: ['phase2.user_interaction_pattern', 'phase3.architecture_pattern'],
    },
    {
      id: 'grounded-answers-only',
      text: 'The agent must show source guidance, flag uncertainty, and avoid making coverage decisions.',
      appliesToFrameworkQuestions: ['phase2.data_strategy', 'phase2.compliance_governance', 'phase3.recommendation_quality'],
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
};

export class InMemoryGuidanceStore implements IGuidanceStore {
  private store = new Map<string, CustomerGuidanceDocument[]>([
    ['org-nfum', [NFU_GUIDANCE]],
  ]);

  async loadActiveGuidance(customerOrganizationId: string): Promise<CustomerGuidanceDocument | null> {
    return this.store.get(customerOrganizationId)?.find((doc) => doc.activeFlag) ?? null;
  }

  async loadAllGuidance(customerOrganizationId: string): Promise<CustomerGuidanceDocument[]> {
    return [...(this.store.get(customerOrganizationId) ?? [])];
  }

  async saveGuidance(doc: CustomerGuidanceDocument): Promise<void> {
    const docs = this.store.get(doc.customerOrganizationId) ?? [];
    const index = docs.findIndex((candidate) => candidate.instructionSetId === doc.instructionSetId);
    if (index >= 0) {
      docs[index] = doc;
    } else {
      docs.push(doc);
    }
    this.store.set(doc.customerOrganizationId, docs);
  }

  async activateGuidance(customerOrganizationId: string, instructionSetId: string): Promise<void> {
    const docs = this.store.get(customerOrganizationId) ?? [];
    for (const doc of docs) {
      doc.activeFlag = doc.instructionSetId === instructionSetId;
      if (doc.activeFlag) {
        doc.activeFrom = new Date().toISOString();
      }
    }
    this.store.set(customerOrganizationId, docs);
  }
}
