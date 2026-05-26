/**
 * Canonical TypeScript data-model interfaces for the AI Project Advisor Agent.
 *
 * Azure Cosmos DB (NoSQL API) backs all four containers:
 *   sessions    — partition key /ownerId
 *   requests    — partition key /ownerId
 *   projects    — partition key /projectId
 *   org-context — partition key /orgId
 *
 * Microsoft Learn: https://learn.microsoft.com/azure/cosmos-db/nosql/
 *
 * see spec §7 Backend model (product-spec.md lines 262–308)
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** ISO-8601 timestamp string (e.g. "2026-05-26T17:18:45Z"). */
export type ISOTimestamp = string;

// ---------------------------------------------------------------------------
// Session (container: sessions, partition key: /ownerId)
// see spec §7 — "Conversation/Session"
// ---------------------------------------------------------------------------

export type OwnerType = "entra" | "demo";
export type SessionStatus = "active" | "submitted" | "archived";

/**
 * A single ongoing or completed advisor conversation owned by exactly one user.
 * A user can have many sessions; sessions are never shared across users.
 */
export interface Session {
  /** Cosmos DB document id — same value as sessionId for clarity. */
  id: string;
  sessionId: string;
  /** Entra oid when ownerType is 'entra'; opaque demo id when 'demo'. */
  ownerId: string;
  ownerType: OwnerType;
  title: string;
  status: SessionStatus;
  createdAt: ISOTimestamp;
  lastActiveAt: ISOTimestamp;
  turnCount: number;
  /** Id of the Request currently being drafted in this session. */
  currentRequestId?: string;
  /** Id of the Request that reached status:New (set on submission). */
  submittedRequestId?: string;
  /** Cosmos DB ETag for optimistic concurrency. */
  _etag?: string;
}

/**
 * One conversation turn appended to a Session document (or stored as a child document).
 * see spec §7 — Session lifecycle
 */
export interface SessionTurn {
  turnId: string;
  sessionId: string;
  ownerId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Request (container: requests, partition key: /ownerId)
// see spec §7 — "Request"
// ---------------------------------------------------------------------------

export type RequestStatus =
  | "Draft"
  | "ReadyForConfirmation"
  | "New"
  | "Archived";

export type ReuseDecision = "link-to-existing" | "continue-as-new" | "pending";

/** Answers captured during the 9-question Technology Groupings phase. */
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
  /** Additional clarification answers keyed by question id. */
  clarifications?: Record<string, string>;
}

/** A project match returned by the Reuse Gate search. */
export interface SimilarProjectMatch {
  projectId: string;
  name: string;
  score: number;
  summary: string;
  technologies: string[];
}

/** Alignment of the final recommendation with one custom instruction. */
export interface AlignmentNote {
  /** References OrgContext customInstruction.id. */
  instructionId: string;
  outcome: "followed" | "partially-followed" | "not-followed";
  reason: string;
  /** The framework question anchor, e.g. "Q2 build style". */
  frameworkAnchor: string;
}

/** Recommended platform in the readiness brief. */
export interface RecommendedPlatform {
  platformKey: string;
  displayName: string;
  rationale: string;
  estimatedComplexity: "low" | "medium" | "high";
  tradeOffs: string;
  runnerUpAlternatives: string[];
}

/** Full project readiness brief attached to a Request. */
export interface ReadinessBrief {
  recommendedPlatform: RecommendedPlatform;
  bxtScore: BxtScore;
  /** Per-instruction alignment — one entry per active custom instruction. */
  alignmentNotes: AlignmentNote[];
  risks: string[];
  nextActions: string[];
  /** Id of the OrgContext version used to generate this brief. */
  orgContextVersion: string;
  generatedAt: ISOTimestamp;
}

export interface BxtScore {
  viability: number;
  desirability: number;
  feasibility: number;
  summary: string;
}

export interface ReuseGateDecision {
  decision: ReuseDecision;
  rationale?: string;
  selectedProjectId?: string;
  matchesPresented: SimilarProjectMatch[];
}

/** The conversational intake artifact for one business user's idea. */
export interface Request {
  id: string;
  requestId: string;
  sessionId: string;
  /** Partition key — Entra oid or demo id. */
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
  /** Reference id (or inline payload) for the readiness brief. */
  readinessBriefRef?: string;
  status: RequestStatus;
  /** Id of the OrgContext version captured at submission time. */
  orgContextVersion?: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  submittedAt?: ISOTimestamp;
  /** Cosmos DB ETag for optimistic concurrency on status transitions. */
  _etag?: string;
}

// ---------------------------------------------------------------------------
// Project (container: projects, partition key: /projectId)
// see spec §7 — "Project"
// ---------------------------------------------------------------------------

export type ProjectStatus = "active" | "archived" | "completed";

/** A durable existing or accepted AI initiative. Organization-wide artifact. */
export interface Project {
  id: string;
  /** Partition key. */
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

// ---------------------------------------------------------------------------
// OrgContext (container: org-context, partition key: /orgId)
// see spec §7 — "Organisation Context"
// ---------------------------------------------------------------------------

export type ProductAvailability =
  | "available"
  | "available-with-restrictions"
  | "unavailable";

export type InstructionKind = "preference" | "hard-constraint" | "context-note";
export type InstructionPhase = "phase-2" | "phase-3" | "both";
export type VendorType = "microsoft" | "non-microsoft";

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

/**
 * Admin-curated context the advisor must consider on every recommendation.
 * Versioned — only one document has published:true at a time.
 */
export interface OrgContext {
  id: string;
  /** Partition key — "default" in MVP (single org). */
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
