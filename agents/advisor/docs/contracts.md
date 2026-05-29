# Shared Contracts

**AI Framework Advisor Agent POC — `@advisor/shared`**
_Last updated: 2026-05-29_

This document describes the shared TypeScript contracts in `agents\advisor\shared\src\types\` and explains the responsibility split between Cosmos DB and Azure AI Search.

---

## Contract Overview

### `IntakeForm` + `IntakeSubmission` (`intake.ts`)

The **form template** (`IntakeForm`) is what the front end renders — sections, questions, answer types, and options. It is derived from `agents\backlog\sample-intake-form-nfum.json`.

The **submitted payload** (`IntakeSubmission`) is what the API receives: a flat `answers` map (question ID → answer value), respondent metadata, timestamps, and validation state. This payload becomes the opening structured context for the Copilot SDK session. It is stored as a snapshot inside `AdvisorSession` in Cosmos DB.

**Key design:** question IDs are the stable contract between form template and submission. Sections and labels can change without breaking the data model.

---

### `DecisionFrameworkEvidence` (`framework.ts`)

Three-phase evidence collected during an advisor conversation:

| Phase | Type | Key fields |
|---|---|---|
| Phase 1 BXT | `Phase1Evidence` | `businessViability`, `experienceDesirability`, `technologyFeasibility` — each with assessment strength + evidence strings |
| Phase 2 | `Phase2Evidence` | `preQuestionDoYouNeedAnAgent`, `criticalQuestionAnswers` (9 questions with `EvidenceSource`), `candidateTechnologyGroupings` |
| Phase 3 | `Phase3Evidence` | `selectedScenarioPattern`, inputs covered by custom instructions, remaining open questions |

`EvidenceSource` is the key auditability field: every answer must trace to `intake | conversation | customInstructions | organizationContext | frameworkDocs | projectSearch | agentInference | missingEvidence`.

---

### `RecommendationOutput` (`recommendation.ts`)

The primary POC success measure. Structured as:

- `recommendedApproach` — primary + supporting technologies with roles
- `rationale[]` — each entry has a reason + evidence strings
- `customInstructionInfluence[]` — which instruction IDs shaped the recommendation and how
- `tradeOffs[]` — explicit trade-offs with `acceptedForPoc` flag
- `assumptions[]` — what must be true for the recommendation to hold
- `followUpQuestions[]` — what the customer needs to decide next
- `similarProjectHighlights[]` — matched projects with `whyItMatters`
- `decisionEvidenceSources[]` — proves the recommendation is grounded

Supports combinations of Microsoft AI frameworks (multiple entries in `primaryTechnologies`).

---

### `CustomerGuidanceDocument` (`guidance.ts`)

Persisted in Cosmos DB, partitioned by `customerOrganizationId`. Contains:

- `organizationContext` — company summary, priorities, preferred channels, constraints, technology preferences
- `instructions[]` — per-instruction ID, text, and which framework question IDs each instruction answers
- `version` + `activeFlag` — versioned; only one document per org has `activeFlag = true`
- `auditTrail[]` — who changed what and when

**Critical design rule:** `organizationContext` is at the **same level** as `instructions[]`, not nested inside instructions. This matches the sample data and the backlog contract.

---

### `ConversationCapture` + `AdvisorSession` (`conversation.ts`)

`ConversationCapture` is the in-session state:
- `turns[]` — each turn has role, message type, phase ID, content, and optional `customInstructionAnswersUsed`
- `capturedFacts[]` — extracted facts with `usedFor` question IDs and `evidenceSource`
- `readinessState` + `phaseReadiness[]` — per-phase readiness with missing evidence

`AdvisorSession` is the durable Cosmos DB document:
- Wraps `ConversationCapture`
- Carries `customerOrganizationId`, `userId`, `activeInstructionSetId`, `copilotSdkSessionId`
- Supports TTL for conversation retention

---

### `ProjectCase` (`project-case.ts`)

The full end-to-end record for one advisor engagement. Combines:
- `customerOrganization` + `respondent`
- `activeCustomInstructions` snapshot (point-in-time copy from Cosmos DB)
- `intakeSubmission`
- `conversationCapture`
- `decisionFrameworkEvidence`
- `similarProjectSearch` result
- `recommendationOutput`
- `projectKnowledgeDocument` (projected to Azure AI Search)
- `feedback`

---

### `ProjectKnowledgeDocument` (`similar-projects.ts`)

The shape indexed into **Azure AI Search** for similar-project lookup. Key fields:

| Field | Purpose |
|---|---|
| `searchableText` | Denormalized plain text for keyword/semantic search |
| `similarProjectSignals` | Structured signals (interaction pattern, data pattern, governance) for precise filtering |
| `frameworkTags` | Phase and grouping tags for faceted search |
| `technologyTags` | Technology name tags |
| `useCaseTags` | Use case keyword tags |
| `sensitivityLevel` | Controls whether a project can surface to other customers |

---

### API DTOs (`api.ts`)

Seven endpoint pairs (request + response):

| Endpoint | Request | Response |
|---|---|---|
| `POST /sessions` | `CreateSessionRequest` | `CreateSessionResponse` |
| `POST /sessions/:id/intake` | `SubmitIntakeRequest` | `SubmitIntakeResponse` |
| `POST /sessions/:id/messages` | `SendMessageRequest` | `SendMessageResponse` |
| `GET /sessions/:id/messages/latest` | — | `GetResponseResponse` |
| `GET /sessions/:id/recommendation` | — | `RetrieveRecommendationResponse` |
| `GET /sessions/:id/similar-projects` | — | `RetrieveSimilarProjectsResponse` |
| `DELETE /sessions/:id` | — | `EndSessionResponse` |

All error paths use `ApiError` with a typed `ApiErrorCode`. No silent failures.

---

## Cosmos DB vs Azure AI Search — Responsibility Split

These stores have **non-overlapping responsibilities**:

| Concern | Cosmos DB | Azure AI Search |
|---|---|---|
| Session state | ✅ `AdvisorSession` | ✗ |
| Conversation turns | ✅ `ConversationCapture.turns` | ✗ |
| Custom instructions | ✅ `CustomerGuidanceDocument` | ✗ |
| Recommendation output (live) | ✅ Embedded in `AdvisorSession` | ✗ |
| Project knowledge (searchable) | ✗ | ✅ `ProjectKnowledgeDocument` |
| Similar-project lookup | ✗ | ✅ Hybrid search over `ProjectKnowledgeDocument` |
| Framework doc retrieval | ✗ | ✅ (future: indexed repo content) |

Cosmos DB owns **mutable session and guidance state**. Azure AI Search owns **searchable project knowledge**. The `ProjectCase` record is the handoff: after a recommendation is delivered, the `projectKnowledgeDocument` projection is indexed into Azure AI Search so future sessions can surface it as a similar project.
