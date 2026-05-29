# Cosmos DB Data Model

**Package:** `@advisor/data`
_Last updated: 2026-05-29_

---

## Overview

Cosmos DB is the **conversation and guidance store**. It owns mutable session state, turn history, captured facts, and customer-organization custom instructions. It does **not** own project knowledge or similar-project lookup — those live in Azure AI Search.

---

## Database

| Property | Value |
|---|---|
| Database ID | `advisor` (configurable via `COSMOS_DATABASE`) |
| API | Cosmos DB for NoSQL |
| Auth | DefaultAzureCredential (managed identity / Entra) — no key-based auth |
| Connectivity | Private endpoint recommended; public access disabled in production |

---

## Containers

### `sessions`

Stores `AdvisorSession` documents — the durable record combining all state for one advisor interaction.

| Property | Value |
|---|---|
| Container ID | `sessions` |
| Partition key | `/customerOrganizationId` |
| Document ID | `sessionId` (maps 1:1 to Cosmos DB `id`) |
| TTL | Enabled at container level (`defaultTtl = -1`). Per-document TTL honored via `AdvisorSession.ttlSeconds`. A `ttlSeconds` of `null` or `undefined` means no expiry. |
| Recommended TTL | 90 days (`7776000` seconds) for standard sessions; set on `AdvisorSession.ttlSeconds` at creation time |
| Indexing | Default (all paths) — suitable for POC; scope to `/customerOrganizationId` and `/sessionId` for production |

**Document shape** (core fields):

```json
{
  "id": "<sessionId>",
  "sessionId": "<sessionId>",
  "customerOrganizationId": "org-nfum",
  "userId": "...",
  "createdAt": "2026-05-29T13:00:00Z",
  "updatedAt": "2026-05-29T13:00:00Z",
  "lastActivityAt": "2026-05-29T13:00:00Z",
  "activeInstructionSetId": "instr-nfum-claims-001",
  "copilotSdkSessionId": "...",
  "ttlSeconds": 7776000,
  "conversationCapture": {
    "sessionId": "...",
    "startedAt": "...",
    "turns": [...],
    "capturedFacts": [...],
    "readinessState": "phase2InProgress",
    "phaseReadiness": [...]
  }
}
```

**Access patterns:**
- `loadSession(sessionId)` — cross-partition query by `sessionId` (required since the interface doesn't carry org ID)
- `createSession(session)` — point-write via partition key
- `updateSession(session)` / append operations — point-replace via `sessionId` + `customerOrganizationId`

---

### `guidance`

Stores `CustomerGuidanceDocument` records — per-organization custom instructions and organization context.

| Property | Value |
|---|---|
| Container ID | `guidance` |
| Partition key | `/customerOrganizationId` |
| Document ID | `instructionSetId` |
| TTL | **Disabled** — guidance documents are permanent records |
| Versioning | `version` is monotonically increasing; only one document per org has `activeFlag = true` |
| Isolation | Partition key ensures cross-organization reads are physically separated |

**Document shape** (core fields):

```json
{
  "id": "<instructionSetId>",
  "instructionSetId": "instr-nfum-claims-001",
  "customerOrganizationId": "org-nfum",
  "version": 3,
  "activeFlag": true,
  "scope": "customerOrganization",
  "activeFrom": "2026-05-20T09:00:00.000+01:00",
  "organizationContext": {
    "companySummary": "...",
    "businessPriorities": [...],
    "preferredChannels": [...],
    "operatingConstraints": [...],
    "technologyPreferences": [...]
  },
  "instructions": [
    {
      "id": "human-approval-required",
      "text": "...",
      "appliesToFrameworkQuestions": ["phase2.action_safety"]
    }
  ],
  "lastEditedBy": "admin@org.com",
  "lastEditedAt": "...",
  "auditTrail": [
    { "changedAt": "...", "changedBy": "...", "changeType": "created" }
  ]
}
```

**Access patterns:**
- `loadActiveGuidance(customerOrganizationId)` — within-partition query: `WHERE customerOrganizationId = @orgId AND activeFlag = true`
- `createGuidance(doc)` — point-write via partition key
- `updateGuidance(doc)` — point-replace via `instructionSetId` + `customerOrganizationId`
- `activateGuidance(...)` — fan-out: reads all docs for org, replaces changed ones (bounded at ~1–5 versions per org)

---

## TTL Design Rationale

Sessions use per-document TTL to allow different retention periods by conversation type:

| Scenario | Recommended `ttlSeconds` |
|---|---|
| Standard advisor session | 7,776,000 (90 days) |
| Demo / test session | 86,400 (1 day) |
| Archived session (keep indefinitely) | `null` |

Setting `defaultTtl = -1` on the container means the container TTL engine is active, but documents without a `ttl` property or with `ttl = -1` are never automatically expired. Per-document `ttl` values override this.

Guidance documents carry no TTL — they are the authoritative record of what instructions were in place at a given time (audit compliance requirement).

---

## Cross-Partition Queries

The `loadSession(sessionId)` operation issues a cross-partition query because the `IConversationStore` interface only exposes `sessionId` (not `customerOrganizationId`). For the POC scale (hundreds of sessions), this is acceptable. For production scale, options include:

1. Cache `sessionId → customerOrganizationId` in the API layer (in-process map or Redis).
2. Extend the interface to pass the partition key (breaking change requiring Trinity's approval).
3. Use a separate index container (adds write complexity).

**POC decision:** cross-partition query is correct behavior. Flag for production hardening.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `COSMOS_ENDPOINT` | — | Cosmos DB account endpoint URL (required for Azure mode) |
| `COSMOS_DATABASE` | `advisor` | Database ID |
| `COSMOS_SESSIONS_CONTAINER` | `sessions` | Sessions container ID |
| `COSMOS_GUIDANCE_CONTAINER` | `guidance` | Guidance container ID |
