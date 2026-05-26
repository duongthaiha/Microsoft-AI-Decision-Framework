# Architecture

## The Vision

Imagine a university admissions office. When a high schooler walks in with a question—"Can I double major?"—they don't go straight to the dean. They go to the front desk. The front desk clerk asks the right intake questions, jots down the answers, then hands off a file to the librarian, who pulls similar cases from the archive to say: "Hey, we've seen this before. Here's what happened last time." That's the AI Project Advisor Agent. The advisor is the intake desk *and* the librarian *and* the filing system.

But there's a third act: **house policy**. If the university has specific constraints—"We only admit students with SAT scores above 1450 in Q4 applicants"—those rules get applied. In our case, an organization admin can encode policies like "We're licensed for Copilot Studio but not Microsoft Foundry" or "All production code must stay in US regions." The advisor loads those policies on every recommendation and surfaces where it's following them and where it's breaking them.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User Browser (React Web App)                               │
│  ├─ Session List / New Session                              │
│  ├─ Intake Form (conversational)                            │
│  ├─ Readiness Brief View                                    │
│  └─ Admin Backend (Org Context, Requests, Projects)         │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS + Entra Sign-In
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Copilot SDK Service (Hosted Agent Runtime)          │
│  ├─ Responses Protocol Adapter                              │
│  ├─ Framework Flow (Intake → BXT → Reuse Gate → Brief)      │
│  ├─ Tool Calls (Search, Cosmos, Org Context Load)           │
│  └─ Managed Identity for Azure Service Access              │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
 ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐
 │ Cosmos   │  │ AI Search  │  │ Org      │  │ Container  │
 │ DB       │  │ (Project   │  │ Context  │  │ Registry   │
 │ Sessions,│  │ Index)     │  │ Policy   │  │ (image)    │
 │ Requests,│  │            │  │ Store    │  │            │
 │ Projects │  │            │  │          │  │            │
 └──────────┘  └────────────┘  └──────────┘  └────────────┘
       ▲              △              ▲
       └──────────────┴──────────────┘
       Managed Identity + Azure RBAC
       (no service keys or connection strings)
```

## Core Components

### 1. Copilot SDK Service (Backend Agent)

Hosted as a **Microsoft Foundry Hosted Agent** (Preview). The agent runs the intake conversation using GitHub Copilot SDK and executes the framework flow:

- **Intake Filter:** Captures the business problem, user scope, desired behavior, data sources, and constraints.
- **Phase 1 BXT:** Scores viability, desirability, and feasibility.
- **Step 1b Reuse Gate:** Searches for similar existing projects via Azure AI Search and presents matches to the user.
- **Phase 2 Groupings:** Shortlists candidate Microsoft AI technologies based on the business need and organizational constraints (loaded from Org Context).
- **Phase 3 Selection:** Scores and ranks candidates, applies custom decision instructions, and produces a readiness brief.

The agent never stores secrets. It uses a **managed identity** to obtain bearer tokens for Cosmos DB and AI Search reads.

### 2. Web App (React Frontend)

A single React + Vite application hosting:

- **User surface:** Session list, intake form conversation, readiness brief view
- **Admin surface:** Org Context editor, Requests browse (read-only), Projects browse (read-only)

Entra sign-in gates the user surface. The `AdvisorAdmin` Entra app role gates the admin surface.

### 3. Azure Cosmos DB (Request & Project Store)

Four containers with strict partition isolation:

| Container | Partition Key | Purpose |
|-----------|---------------|---------|
| `sessions` | `/ownerId` | Per-user conversation sessions; owner can only see their own |
| `requests` | `/ownerId` | Submitted ideas; owner can only see their own; admins cross-partition |
| `projects` | `/projectId` | Durable existing initiatives; shared read via Search |
| `org-context` | `/orgId` | Admin-curated policy (single "default" org in MVP) |

Each container is indexed by its partition key to enforce per-user isolation at the data plane.

### 4. Azure AI Search (Similarity Index)

Indexes the `projects` container to power Step 1b similarity matching. Embeddings are computed using `text-embedding-3-small` (1536 dimensions). Queries search across project briefs, tags, and outcomes to surface similar work when a user submits a new idea.

### 5. Azure Container Registry (Image Registry)

Stores the Hosted Agent container image built from `agent/src/index.ts`. The image is pushed to ACR; Foundry pulls it to run the agent runtime.

### 6. Managed Identity & Entra Integration

- **Hosted Agent identity:** Service principal with least-privilege RBAC roles for Cosmos DB (read-only on `org-context`, read/write on `sessions/requests/projects`) and AI Search (read-only).
- **Entra sign-in:** Users sign in with their Entra identity; the Entra `oid` is the session ownership key.
- **Admin gate:** Only users in the `AdvisorAdmin` Entra app role can access the admin backend.

### 7. Organization Context (Policy Store)

A single Cosmos DB document that admins can version and publish. It contains:

- **System inventory:** Microsoft and non-Microsoft platforms in use (e.g., M365 E5, Dynamics 365, SAP).
- **License/entitlement boundaries:** Which Microsoft AI products are `available`, `available-with-restrictions`, or `unavailable` for the organization.
- **Custom decision instructions:** Free-text and structured preferences (e.g., "Prefer Copilot Studio for low-code", "No new Azure subscriptions for MVP").

On every recommendation, the advisor loads the active published version and applies it during Phase 2 (filtering out unavailable products) and Phase 3 (soft-weighting candidates based on preferences). The readiness brief shows the alignment outcome for each instruction.

## Design Rationale

### Why Hosted Agent, not App Service?

The Copilot SDK has a lightweight protocol (Responses) designed for hosted runtimes. Foundry Hosted Agents handle:
- Session lifecycle and telemetry
- Container image deployment
- Managed identity wiring
- Protocol marshalling

App Service would require us to build a web API layer on top. Hosted Agent is simpler for M0/M1 and scales naturally.

### Why Cosmos DB, not a relational database?

Cosmos DB offers:
- **Partition isolation at the data plane:** Per-user sessions/requests are partitioned by `/ownerId`, enforcing that a single query cannot leak another user's data.
- **Change Feed:** Downstream systems can consume newly submitted Requests (`status: New`) via Cosmos DB's Change Feed without polling or webhooks.
- **Multi-region replication:** Extensible for future scale-out; not required for MVP.

A relational database would require application-level row-level security (RLS). Cosmos DB's partitioning model is architecturally simpler for this intake workload.

### Why AI Search for similarity, not a keyword search?

Semantic similarity (embeddings) catches projects that are conceptually similar but use different terminology. Example: A user asks about "automating customer feedback triage"—semantic search finds a project about "intelligent ticket routing" even though the words don't overlap. Keyword search would miss it.

### Why Entra sign-in by default?

- Prevents anonymous idea spam in production.
- Ties each session to an authenticated identity for audit logging.
- Enables the admin backend to filter requests by user and pull user display names.
- Demo mode can bypass Entra for internal testing, but the flag is visibly enabled/disabled in telemetry.

### Why two Entra roles, not three?

- **`AdvisorUser` (implicit):** Anyone who signs in.
- **`AdvisorAdmin` (explicit):** Users in this app role access the admin backend.

No intermediate "reviewer" role. The advisor produces a structured Request in Cosmos DB; downstream systems pull and review via their own process.

---

## Deployment & Operations

The advisor is deployed using **Azure Developer CLI (azd)** with **Bicep** IaC. The `azure.yaml` file defines:

- Cosmos DB account, containers, and role assignments
- Azure AI Search index
- Container Registry
- Managed identities and RBAC
- Foundry Hosted Agent project (if Foundry supports AZD in M1)

See [docs/deployment.md](./deployment.md) for environment setup and `azd` commands.

---

## Next Steps

- **M1:** Wire the Copilot SDK session handler, implement the framework flow logic, add Cosmos DB CRUD operations, and wire AI Search queries.
- **M2:** Deploy to test environment with real Cosmos DB and Search; enable Entra sign-in in production.
- **M3:** Security hardening, cost optimization, runbook completion.
