# Data Model

The AI Project Advisor Agent stores all state in **Azure Cosmos DB** across four containers. Each container is partitioned by a logical key that enforces data isolation and supports efficient querying.

## Containers

### 1. `sessions` — Partition key: `/ownerId`

**Purpose:** Store per-user advisor conversation sessions.

**TypeScript interface** (from `agent/src/data/models.ts`):

```typescript
interface Session {
  sessionId: string;                    // Unique session identifier
  ownerId: string;                      // Entra oid (or demo id)
  ownerType: "entra" | "demo";          // Auth method
  title: string;                        // User-given session name
  status: "active" | "submitted" | "archived";
  createdAt: ISO8601;
  lastActiveAt: ISO8601;
  turnCount: number;                    // Number of conversation turns
  currentRequestId?: string;            // Draft Request being built
  submittedRequestId?: string;          // Request after submission
}
```

**Partition isolation:** All queries filter by the caller's `ownerId`. A user can never see another user's sessions.

**Audit logging:** Session create, resume, rename, delete, and submission events are logged with `sessionId`, `ownerId`, and timestamp.

**Retention:** Sessions are soft-deleted (marked `archived`); they remain queryable for audit purposes. Implement a TTL policy (90 days for non-submitted drafts, indefinite for submitted) in M2.

---

### 2. `requests` — Partition key: `/ownerId`

**Purpose:** Store submitted and draft project ideas with intake answers, framework scoring, and readiness briefs.

**TypeScript interface** (from `agent/src/data/models.ts`):

```typescript
interface Request {
  requestId: string;
  sessionId: string;                    // Reference to owning session
  ownerId: string;                      // Entra oid or demo id
  submitterId: string;                  // May differ from owner if delegated
  title: string;
  businessOutcome: string;              // What the user hopes to achieve
  targetUsers: string;                  // Who benefits
  desiredBehavior: string;              // How they interact with the AI
  dataSources: string[];                // Data the AI consumes
  actions: string[];                    // Actions the AI takes
  constraints: string[];                // Regulatory, technical, or org constraints
  frameworkAnswers: {
    // BXT phase
    viability: number;                  // 1–5 score
    desirability: number;
    feasibility: number;
    // Technology grouping answers (Q1–Q9)
    q1_userInteraction: "conversational" | "autonomous" | "api";
    q2_buildStyle: "low-code" | "pro-code";
    q3_dataStrategy: "grounding" | "memory" | "analytics";
    q4_orchestrationComplexity: number; // 1–5
    q5_compliance: string;              // Regulatory notes
    q6_scale: "low" | "medium" | "high";
    q7_actionSafety: "supervised" | "autonomous";
    q8_teamSkills: string[];            // Expected skills
    q9_proactive: boolean;              // Proactive vs. reactive
  };
  similarProjectMatches?: {
    projectId: string;
    name: string;
    owner: string;
    relevanceScore: number;             // 0–1
  }[];
  reuseDecision: "new" | "link-to-existing" | "cancel";
  linkedProjectId?: string;             // If reuseDecision = "link-to-existing"
  readinessBriefRef: {
    recommendedPlatform: string;        // e.g., "Copilot Studio"
    rationale: string;
    estimatedComplexity: "Low" | "Medium" | "High";
    risks: string[];
    nextActions: string[];
    customInstructionAlignment: {
      instructionId: string;
      outcome: "followed" | "partially-followed" | "not-followed";
      reason?: string;
    }[];
  };
  status: "Draft" | "ReadyForConfirmation" | "New";
  orgContextVersion: number;            // Version of org policy applied
  timestamps: {
    createdAt: ISO8601;
    clarificationAskedAt?: ISO8601;
    readinessBriefGeneratedAt?: ISO8601;
    submittedAt?: ISO8601;
  };
}
```

**Partition isolation:** All queries filter by the caller's `ownerId`. Admin endpoints can cross-partition query to list all Requests across users (with explicit `AdvisorAdmin` role check and audit logging).

**Audit logging:**
- Request creation, update, status transitions
- Clarification questions asked
- Readiness brief generation
- Step 1b match decision and Project link choice
- Submission confirmation
- Cross-user access attempts (should never occur in normal flow)

**Retention:** Indefinite for submitted Requests (`status: New`). Draft Requests follow the same TTL as sessions (90 days, soft-delete).

**Linked to spec:**
- FR-007: Per-user Request isolation
- FR-018: Multiple sessions per user
- FR-020: Entra `oid` as partition key
- FR-022: Org context version stamped
- FR-023: Custom instruction alignment recorded

---

### 3. `projects` — Partition key: `/projectId`

**Purpose:** Store durable existing or candidate AI initiatives that can accumulate linked Requests.

**TypeScript interface** (from `agent/src/data/models.ts`):

```typescript
interface Project {
  projectId: string;
  name: string;
  summary: string;                      // Indexed for similarity search
  owner: string;                        // Org/team owner
  status: "active" | "completed" | "paused" | "candidate";
  businessOutcomes: string[];           // Indexed for similarity
  userGroups: string[];                 // Who benefits
  technologies: string[];               // Tech stack (indexed)
  dataDomains: string[];                // Data sources
  lessonsLearned: string;               // Post-project notes (indexed)
  linkedRequestIds: string[];           // Requests associated with this project
  timestamps: {
    createdAt: ISO8601;
    lastUpdatedAt: ISO8601;
  };
}
```

**Partition isolation:** Projects are **not** partitioned by user; they are organization-wide artifacts. Any user can initiate a similarity search against all Projects. Only admins can update Projects (out of band for M0; ingestion is a separate process).

**Searchability:** The `summary`, `businessOutcomes`, `technologies`, and `lessonsLearned` fields are indexed in Azure AI Search for semantic similarity matching during Step 1b.

**Audit logging:** Project linkage decisions and Request associations are logged on the Request, not on the Project.

**Retention:** Indefinite.

---

### 4. `org-context` — Partition key: `/orgId`

**Purpose:** Store admin-curated organizational context (system inventory, license boundaries, custom decision instructions).

**TypeScript interface** (from `agent/src/data/models.ts`):

```typescript
interface OrgContext {
  orgId: string;                        // "default" for MVP
  version: number;
  editorId: string;                     // Entra oid of admin who edited
  editedAt: ISO8601;
  changeSummary: string;                // What changed in this version
  published: boolean;                   // Only one version is "active"
  systemInventory: {
    name: string;
    vendor: "microsoft" | "non-microsoft";
    category: string;                   // e.g., "Productivity", "Analytics"
    notes: string;                      // Usage/notes
    isAuthoritativeFor: string[];       // Data domains (e.g., ["CRM", "Finance"])
  }[];
  entitlements: {
    productId: string;                  // e.g., "copilot-studio", "foundry-agent"
    status: "available" | "available-with-restrictions" | "unavailable";
    restrictionNotes: string;           // License limits, region restrictions, etc.
    regions?: string[];                 // Allowed regions if restricted
  }[];
  customInstructions: {
    id: string;
    text: string;                       // Plain-text instruction
    kind: "preference" | "hard-constraint" | "context-note";
    appliesTo: "phase-2" | "phase-3" | "both";
    structuredTags?: string[];          // Optional tags for grouping
  }[];
}
```

**Partition isolation:** In MVP, `orgId` is hardcoded to `"default"`. The partition key reserves space for multi-organization support in M2+.

**Access control:**
- Agent identity: Read-only
- Admin backend: Read/write (only users in `AdvisorAdmin` role)
- Requests stamp the version they were generated against

**Versioning:** Each save creates a new immutable version. Only one version has `published: true` (the "active" version loaded by the advisor). Admins can revert by republishing an older version.

**Audit logging:**
- Version creation, edit, publish, revert
- Agent load of active version (with version number and timestamp)
- Admin sign-in and updates
- Per-instruction alignment analysis on each Request

**Linked to spec:**
- FR-021: Admin role gate
- FR-022: System inventory + entitlements + custom instructions
- FR-023: Version tracking and per-Request stamping

---

## Per-User Isolation (Critical Security Boundary)

Every query against `sessions` or `requests` **must** filter by the caller's `ownerId`. Example (pseudocode):

```typescript
// User's own sessions (correct)
const sessions = await cosmosContainer
  .items
  .query("SELECT * FROM c WHERE c.ownerId = @ownerId", { 
    parameters: [{ name: "@ownerId", value: userOwnerId }] 
  })
  .fetchAll();

// Cross-user read (forbidden in user flow)
const allRequests = await cosmosContainer
  .items
  .query("SELECT * FROM c") // ❌ WRONG: No partition filter
  .fetchAll();

// Admin cross-partition read (requires AdvisorAdmin role check)
if (userHasRole("AdvisorAdmin")) {
  const allRequests = await adminCosmosContainer
    .items
    .query("SELECT * FROM c")  // ✅ OK: Admin is verified; query unfiltered
    .fetchAll();
  // Log: adminId, filter parameters, result count
}
```

---

## Change Feed Contract

Downstream systems can consume newly submitted Requests via Cosmos DB's Change Feed. See [docs/change-feed-consumer.md](./change-feed-consumer.md) for the contract and a sample TypeScript consumer.

---

## Audit Logging & Retention

All CRUD operations, submissions, and cross-user access attempts must be logged with:
- Operation type (create, update, delete, cross-partition read)
- Entity type and ID (sessionId, requestId, projectId, orgContextVersion)
- Caller identity (user ownerId, admin id, service identity)
- Timestamp
- Result (success, failure, rejection reason)

Logs are stored in **Application Insights** for querying and alerting. Sensitive payloads (e.g., raw project ideas) are **never** logged; only metadata (IDs, timestamps, types, status) is captured.

---

## Next Steps (M1+)

- Implement Cosmos DB CRUD operations in `agent/src/data/*-store.ts`
- Wire Session lifecycle (create, list, resume, rename, delete)
- Implement Request draft-to-submission state machine
- Validate per-user isolation in integration tests
- Set up Change Feed consumer and downstream notification
