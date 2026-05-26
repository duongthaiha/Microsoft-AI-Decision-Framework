// TODO M1: replace with shared types package import from ../agent/src/data/models
// These interfaces mirror agent/src/data/models.ts exactly.
// When a shared package is introduced, delete this file and import from there.

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Session {
  id: string;              // sessionId (UUID)
  ownerId: string;         // Entra oid or demo id
  ownerType: 'entra' | 'demo';
  title: string;
  status: 'active' | 'submitted' | 'archived';
  createdAt: string;       // ISO 8601
  lastActiveAt: string;
  turnCount: number;
  currentRequestId?: string;
  submittedRequestId?: string;
}

export interface Request {
  id: string;              // requestId (UUID)
  sessionId: string;
  ownerId: string;
  submitterId?: string;
  title: string;
  businessOutcome: string;
  targetUsers: string;
  desiredBehavior: string;
  dataSources: string[];
  actions: string[];
  constraints: string[];
  frameworkAnswers: Record<string, FrameworkAnswer>;
  bxtScore?: BxtScore;
  similarProjectMatches: SimilarMatch[];
  reuseDecision?: ReuseDecision;
  linkedProjectId?: string;
  readinessBrief?: ReadinessBrief;
  orgContextVersion?: string;
  alignmentNotes: AlignmentNote[];
  status: 'Draft' | 'ReadyForConfirmation' | 'New';
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

export interface Project {
  id: string;              // projectId (UUID)
  name: string;
  summary: string;
  owner: string;
  businessOutcomes: string[];
  userGroups: string[];
  technologies: string[];
  dataDomains: string[];
  status: string;
  lessonsLearned: string[];
  linkedRequestIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrgContext {
  id: string;              // version id (UUID)
  orgId: string;           // "default" in MVP
  version: number;
  editorId: string;
  editedAt: string;
  changeSummary: string;
  systemInventory: SystemEntry[];
  entitlements: Entitlement[];
  customInstructions: CustomInstruction[];
  published: boolean;
}

// ─── Supporting types ──────────────────────────────────────────────────────────

export interface SystemEntry {
  name: string;
  vendor: 'microsoft' | 'non-microsoft';
  category: string;
  notes: string;
  isAuthoritativeFor: string[];
}

export interface Entitlement {
  productId: string;
  status: 'available' | 'available-with-restrictions' | 'unavailable';
  restrictionNotes: string;
  regions: string[];
}

export interface CustomInstruction {
  id: string;
  text: string;
  kind: 'preference' | 'hard-constraint' | 'context-note';
  appliesTo: 'phase-2' | 'phase-3' | 'both';
  tags?: string[];
}

export interface AlignmentNote {
  instructionId: string;
  outcome: 'followed' | 'partially-followed' | 'not-followed';
  reason: string;
  frameworkAnchor: string;
}

export interface FrameworkAnswer {
  questionId: string;
  answer: string;
  rationale?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface BxtScore {
  viability: number;
  desirability: number;
  feasibility: number;
  rationale: string;
  blockers: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface SimilarMatch {
  projectId: string;
  name: string;
  similarity: number;
  summary: string;
}

export interface ReuseDecision {
  decision: 'link-existing' | 'new-candidate' | 'rejected-all';
  selectedProjectId?: string;
  rationale: string;
}

export interface ReadinessBrief {
  recommendedPlatform: string;
  rationale: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
  similarProjects: SimilarMatch[];
  alternatives: string[];
  risks: string[];
  nextActions: string[];
  orgContextVersion: string;
}
