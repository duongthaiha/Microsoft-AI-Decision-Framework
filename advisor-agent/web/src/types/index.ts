// TODO M1: replace with shared types package import from ../agent/src/data/models
// These interfaces mirror agent/src/data/models.ts exactly (reconciled 2026-05-26).
// When a shared package is introduced, delete this file and import from there.

export type ISOTimestamp = string;

// ─── Session ──────────────────────────────────────────────────────────────────

export type OwnerType = 'entra' | 'demo';
export type SessionStatus = 'active' | 'submitted' | 'archived';

export interface Session {
  id: string;
  sessionId: string;
  ownerId: string;
  ownerType: OwnerType;
  title: string;
  status: SessionStatus;
  createdAt: ISOTimestamp;
  lastActiveAt: ISOTimestamp;
  turnCount: number;
  currentRequestId?: string;
  submittedRequestId?: string;
  _etag?: string;
}

export interface SessionTurn {
  turnId: string;
  sessionId: string;
  ownerId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: ISOTimestamp;
}

// ─── Request ──────────────────────────────────────────────────────────────────

export type RequestStatus = 'Draft' | 'ReadyForConfirmation' | 'New' | 'Archived';
export type ReuseDecisionKind = 'link-to-existing' | 'continue-as-new' | 'pending';

export interface FrameworkAnswers {
  q1UserInteraction?: string;
  q2BuildStyle?: string;
  q3DataStrategy?: string;
  q4OrchestrationComplexity?: string;
  q5Compliance?: string;
  q6ScaleAndCost?: string;
  q7ActionSafety?: string;
  q8TeamSkills?: string;
  q9ProactiveVsReactive?: string;
  clarifications?: Record<string, string>;
}

export interface SimilarProjectMatch {
  projectId: string;
  name: string;
  score: number;
  summary: string;
  technologies: string[];
}

export interface AlignmentNote {
  instructionId: string;
  outcome: 'followed' | 'partially-followed' | 'not-followed';
  reason: string;
  frameworkAnchor: string;
}

export interface RecommendedPlatform {
  platformKey: string;
  displayName: string;
  rationale: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
  tradeOffs: string;
  runnerUpAlternatives: string[];
}

export interface BxtScore {
  viability: number;
  desirability: number;
  feasibility: number;
  summary: string;
}

export interface ReuseGateDecision {
  decision: ReuseDecisionKind;
  rationale?: string;
  selectedProjectId?: string;
  matchesPresented: SimilarProjectMatch[];
}

export interface ReadinessBrief {
  recommendedPlatform: RecommendedPlatform;
  bxtScore: BxtScore;
  alignmentNotes: AlignmentNote[];
  risks: string[];
  nextActions: string[];
  orgContextVersion: string;
  generatedAt: ISOTimestamp;
}

export interface Request {
  id: string;
  requestId: string;
  sessionId: string;
  ownerId: string;
  submitterId?: string;
  title: string;
  businessOutcome: string;
  targetUsers: string;
  desiredBehavior: string;
  dataSources: string;
  actions: string;
  constraints: string;
  frameworkAnswers: FrameworkAnswers;
  similarProjectMatches: SimilarProjectMatch[];
  reuseDecision: ReuseGateDecision;
  linkedProjectId?: string;
  readinessBrief?: ReadinessBrief;
  readinessBriefRef?: string;
  status: RequestStatus;
  orgContextVersion?: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  submittedAt?: ISOTimestamp;
  _etag?: string;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'archived' | 'completed';

export interface Project {
  id: string;
  projectId: string;
  name: string;
  summary: string;
  owner: string;
  businessOutcomes: string[];
  userGroups: string[];
  technologies: string[];
  dataDomains: string[];
  status: ProjectStatus;
  lessonsLearned?: string;
  linkedRequestIds: string[];
  tags: string[];
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

// ─── OrgContext ───────────────────────────────────────────────────────────────

export type ProductAvailability = 'available' | 'available-with-restrictions' | 'unavailable';
export type InstructionKind = 'preference' | 'hard-constraint' | 'context-note';
export type InstructionPhase = 'phase-2' | 'phase-3' | 'both';
export type VendorType = 'microsoft' | 'non-microsoft';

export interface SystemInventoryEntry {
  name: string;
  vendor: VendorType;
  category: string;
  notes?: string;
  isAuthoritativeFor: string[];
}

export interface EntitlementEntry {
  productId: string;
  displayName: string;
  status: ProductAvailability;
  restrictionNotes?: string;
  regions: string[];
}

export interface CustomInstruction {
  id: string;
  text: string;
  kind: InstructionKind;
  appliesTo: InstructionPhase;
  tags?: string[];
}

export interface OrgContext {
  id: string;
  orgId: string;
  version: string;
  editorId: string;
  editedAt: ISOTimestamp;
  changeSummary: string;
  systemInventory: SystemInventoryEntry[];
  entitlements: EntitlementEntry[];
  customInstructions: CustomInstruction[];
  published: boolean;
}

// ─── Hosted Agent Responses protocol shape ────────────────────────────────────

export interface ResponseOutputContent {
  type: string;
  text?: string;
}

export interface ResponseOutputItem {
  type: string;
  role?: string;
  content?: ResponseOutputContent[];
}

export interface AdvisorResponse {
  id: string;
  object: string;
  created_at: number;
  status: string;
  output: ResponseOutputItem[];
  session?: { id: string; title?: string };
}
