/**
 * Customer guidance document — persisted in Cosmos DB per customer organization.
 *
 * The organizationContext and instructions[] live in the SAME document,
 * with organizationContext at the same level as the instructions array.
 * This matches the shape in sample-project-data-nfum.json and the
 * backlog contract definition.
 *
 * Cosmos DB partition key: customerOrganizationId
 */

// ---------------------------------------------------------------------------
// Organization context
// ---------------------------------------------------------------------------

export interface OrganizationContext {
  companySummary: string;
  businessPriorities: string[];
  preferredChannels: string[];
  operatingConstraints: string[];
  technologyPreferences: string[];
}

// ---------------------------------------------------------------------------
// Individual custom instruction
// ---------------------------------------------------------------------------

export interface CustomInstruction {
  id: string;
  text: string;
  /**
   * Which framework question IDs this instruction applies to.
   * e.g. ["phase2.action_safety", "phase3.trade_offs_accepted"]
   */
  appliesToFrameworkQuestions: string[];
}

// ---------------------------------------------------------------------------
// Audit entry for instruction changes
// ---------------------------------------------------------------------------

export interface GuidanceAuditEntry {
  changedAt: string;
  changedBy: string;
  changeType: 'created' | 'updated' | 'activated' | 'deactivated';
  previousVersion?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Full customer guidance document
// ---------------------------------------------------------------------------

export type GuidanceScope = 'customerOrganization' | 'global';

export interface CustomerGuidanceDocument {
  /** Cosmos DB document ID */
  instructionSetId: string;
  customerOrganizationId: string;
  /** Monotonically increasing version number */
  version: number;
  /** Only one version per org should have activeFlag = true */
  activeFlag: boolean;
  scope: GuidanceScope;
  activeFrom: string;
  /** organizationContext sits at the SAME level as instructions[] */
  organizationContext: OrganizationContext;
  instructions: CustomInstruction[];
  /** Who last edited this document */
  lastEditedBy?: string;
  lastEditedAt?: string;
  auditTrail: GuidanceAuditEntry[];
}
