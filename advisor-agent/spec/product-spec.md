---
layout: default
title: AI Project Advisor Agent Product Spec
nav_exclude: true
description: "Product specification for the AI Project Advisor Agent"
---

# AI Project Advisor Agent Product Specification

## Metadata

| Field | Value |
|-------|-------|
| Product/feature name | AI Project Advisor Agent |
| Status | Draft |
| Owner | Dev team |
| Date | 2026-05-26 |
| Source repository | `duongthaiha/Microsoft-AI-Decision-Framework` |
| Target release or milestone | MVP / first dev handoff |

## 1. Executive Summary

### What we are building

The AI Project Advisor Agent is the **front desk for new AI project ideas**. A business user starts with a polished intake form, describes the idea in business language, and lets the agent do the first-pass architecture triage before anyone burns a sprint on the wrong thing.

The advisor is a **GitHub Copilot SDK-based agent** (public preview) hosted as a **Microsoft Foundry Agent Service Hosted Agent** (Preview). It follows the Microsoft AI Decision Framework, captures each answer against a durable **Request** inside a per-user **Conversation/Session**, then adds an agent-specific **Step 1b: the Reuse Gate**. After the BXT impact assessment, it searches existing **Projects**, presents similar work to the user, and asks whether the idea should be linked to an existing project or continue as a new project candidate. If the advisor has no further questions, it asks the user to confirm submission. On confirmation, the Request is persisted in **Azure Cosmos DB** with `status: New`, linked to the selected Project when applicable, and made available to downstream reviewers through Cosmos DB queries / Change Feed.

Conversations, Requests, and Projects are all stored in Cosmos DB. Each user can have **multiple sessions** in flight (one per project idea or draft), and a user can only see and resume their own sessions — never another user's. When Microsoft Entra sign-in is enabled, the Entra **object id (`oid`)** is the conversation partition / ownership key; in demo mode an opaque anonymous session id is used instead and is never mixed with Entra-authenticated traffic.

### Why it matters

This feature prevents duplicate projects, vague AI requests, and premature technology choices. It turns "I have an AI idea" into a structured decision with a clear output: recommended Microsoft platform, rationale, estimated complexity, and relevant existing-project context when a similar project already exists.

### What this is not

- It is not an automatic project approval system.
- It does not provision Azure resources for the submitted project.
- It does not replace architecture review, security review, or product ownership.
- It does not automatically merge ideas into existing projects without user confirmation.
- It does not create a new Project record until the downstream owner/reviewer promotes a Request into a Project.
- It does not create Azure DevOps work items, GitHub issues, or backlog tasks in the MVP.
- It is not an App Service-first web/API design; the agent runtime target is a Foundry Hosted Agent.
- It does not bypass Microsoft Entra sign-in except when an explicit demo flag is enabled outside production.

## 2. Users and Jobs

| User or operator | Job to be done | Current pain | Success signal |
|------------------|----------------|--------------|----------------|
| Business user / idea submitter | Submit and sharpen an AI project idea without needing to know the Microsoft AI product landscape, and resume drafts across multiple sessions | Ideas start as business pain, opportunity, or "can AI help?" questions, but lack enough structure for delivery teams; users also lose context between visits | User can start, resume, and switch between multiple personal sessions; receives a plain-language readiness brief with recommended Microsoft platform, rationale, complexity estimate, and similar-project data when available, then can submit a `New` request |
| Dev team / intake reviewer | Receive a structured, framework-aligned request instead of a vague idea | Intake work is slow when business context, data boundaries, and expected outcomes are missing | Submitted Request in Cosmos DB contains enough context to triage, size, and route the request |
| Tech lead / architect | Review whether the idea fits the Microsoft AI Decision Framework | Manual triage is inconsistent and easy to bias toward fashionable tools | Brief shows framework scoring, similar projects, risks, and recommended approach |
| **Organisation admin** | **Configure the organisation context the advisor should consider — installed Microsoft and non-Microsoft systems, license/entitlement boundaries, and custom decision instructions (e.g. "prefer Copilot Studio when low-code is viable; we have limited pro-code engineering capacity")** | **Advisor recommendations today ignore real organisational constraints, so users still receive options they cannot license, deploy, or staff** | **Admin can sign in with an Entra admin role, edit/version the organisation profile, and see those instructions reflected in Phase 2 & 3 reasoning and in the readiness brief rationale** |
| Platform operator | Operate the hosted advisor and Cosmos DB-backed intake workflow | Auth, secrets, telemetry, multi-tenant data isolation, and deployment drift can become invisible | Hosted Agent is AZD-deployable, observable, enforces per-user session isolation and admin-only access to the organisation profile, and uses hosted agent identity / managed identity for service access |


## 3. Scope

### In scope

- Advisor intake form for business users submitting new AI project ideas.
- GitHub Copilot SDK (public preview) implementation for the advisor's conversational reasoning, tool calls, framework flow, and readiness brief generation.
- Microsoft Foundry Agent Service Hosted Agent (Preview) as the hosting runtime for the advisor container.
- **Per-user conversation/session management in Azure Cosmos DB**, allowing each user to start, list, resume, rename, and delete multiple sessions, with strict isolation so a user can never see another user's sessions.
- Step 1b Reuse Gate after BXT Phase 1 to search existing Projects and present similar work.
- Per-user conversation/session management — see above.
- **Admin backend feature** that lets organisation admins (Entra app role / group) sign in and manage an **Organisation Context** document used by the advisor on every recommendation, including:
  - **System inventory** — Microsoft and non-Microsoft systems already in use (e.g. M365 E5, Dynamics 365 Sales, ServiceNow, Salesforce, SAP, Snowflake), with notes on which are authoritative for data.
  - **License / entitlement boundaries** — which Microsoft AI products and SKUs the organisation is licensed for and which are explicitly unavailable (e.g. "M365 Copilot licensed for sales org only", "Microsoft Foundry available in `prod-eus2`", "Azure AI Search not yet procured").
  - **Custom decision instructions** — free-text and structured preferences that bias platform selection (e.g. "prefer Copilot Studio whenever low-code is viable because engineering capacity is limited"; "do not propose net-new Azure subscriptions for MVPs"; "all production data must remain in EU regions").
  - **Versioning and audit** — every change is versioned, captured with who/when, and the version used for a Request is recorded on the Request.
  - **Admin browse screens** — read-only **Requests** and **Projects** list views (with detail drill-in) so admins can see what is flowing through the advisor, sort and filter by status / owner / date / linked Project / `orgContextVersion`, and open a single Request to inspect its readiness brief and per-instruction alignment notes. Read-only by design — admins do not edit Requests or Projects from these screens.
- Step 1b Reuse Gate after BXT Phase 1 to search existing Projects and present similar work.
- Existing-Project similarity search using Azure AI Search.
- Framework-guided clarification questions.
- Durable Request capture during the conversation, including framework answers and user decisions, stored in Cosmos DB and bound to the owning session.
- Durable Project concept that can have one or more Requests linked to it, stored in Cosmos DB.
- Project readiness brief with:
  - similar-project matches
  - current project data for the best similar match when available (for example: project name, owner, status, technologies, and summary)
  - whether the Request is linked to an existing Project or remains a new project candidate
  - missing clarification questions
  - decision-framework scoring
  - recommended Microsoft AI platform/approach
  - rationale for why the platform fits the ask
  - estimated implementation complexity (Low/Medium/High + short justification)
  - risks and guardrails
  - next engineering actions
- User confirmation before submission.
- On confirmation, the Request document in Cosmos DB transitions to `status: New` and becomes available to downstream reviewers (directly or via Cosmos DB Change Feed).
- Hosted Agent container, protocol adapter, and deployment assets under `advisor-agent`.
- Bicep infrastructure and Azure Developer CLI deployment assets under `advisor-agent`.
- Microsoft Entra sign-in by default, with a demo-only flag to disable user sign-in.
- Hosted agent identity / managed identity for service-to-service communication.
- Public networking posture for demo and low-risk workloads.

### Out of scope

- Downstream reviewer/consumer implementation beyond persisting the `New` Request in Cosmos DB.
- Multi-stage workflow statuses beyond initial `New` submission.
- Cross-user collaboration on the same session (sessions are single-owner in MVP).
- Multi-tenant / multi-organisation isolation (the advisor stores one organisation profile per deployment in the MVP; multi-tenant org profiles are a future enhancement).
- Automatic discovery or inference of license/entitlement state from Microsoft 365 admin or Entra tenant APIs (admins enter and maintain the organisation context manually in the MVP).
- Automatic project approval, rejection, funding, or scheduling.
- Automatic creation of Azure DevOps work items, GitHub issues, Teams posts, or SharePoint records.
- Private endpoint or VNet integration in the first version.
- Replacing the existing Jekyll/GitHub Pages documentation site.

### Assumptions

- GitHub Copilot SDK (public preview) is the first-version agent implementation framework. The preferred stack is TypeScript/Node.js with `@github/copilot-sdk` unless the dev team explicitly chooses another supported SDK language.
- Microsoft Foundry Agent Service Hosted Agent (Preview) is the first-version hosting target for the advisor runtime.
- The advisor container exposes a Hosted Agent-compatible protocol endpoint. Start with Responses for normal conversational flow unless implementation discovery shows the Copilot SDK integration needs an Invocations bridge.
- The default model path is Azure BYOM/Foundry model configuration through the Copilot SDK provider using `ManagedIdentityCredential` in production and `DefaultAzureCredential` for local development. If the team instead chooses GitHub's default Copilot SDK model path, the required GitHub token is a documented secret exception stored in Key Vault.
- Azure AI Search stores searchable existing-project briefs for similarity matching.
- The Project data store is the system of record for Project metadata; Azure AI Search is the similarity/search index over that Project data.
- The Request data store is the system of record for the conversation, framework answers, submission status, and optional Project link.
- **Azure Cosmos DB (NoSQL API)** is the single durable data store for Conversations/Sessions, Requests, and Projects. Containers are partitioned per user (`oid` for Entra-authenticated traffic; opaque anonymous id for demo mode) so per-user isolation is structural, not just enforced by application code.
- Submitted Requests stay in Cosmos DB with `status: New`; downstream handlers read directly from Cosmos DB (or subscribe to the Change Feed). There is no Azure Storage Queue in the architecture.
- The canonical agent code, deployment assets, Bicep templates, and feature docs live under `advisor-agent`.
- The existing public docs site can link to the advisor client/channel, but secure agent execution runs through the Foundry Hosted Agent endpoint.

## 4. User Journeys

### Advisor framework flow

The public Microsoft AI Decision Framework remains the spine: **Phase 1: Business Impact Assessment**, **Phase 2: Technology Groupings**, and **Phase 3: Scenario-Specific Selection**. The advisor adds one extra product-specific step:

| Step | Advisor behavior | Request data captured |
|------|------------------|-----------------------|
| Session start | Create or resume a Conversation/Session scoped to the signed-in user (`oid`) or the demo anonymous id | `sessionId`, `ownerId`, `createdAt`, `lastActiveAt`, `title` |
| Intake Filter | Capture outcome, user experience, and whether an existing tool may solve the problem | problem statement, business outcome, target users, UX hypothesis, existing-tool hypothesis |
| Phase 1: BXT | Score viability, desirability, and feasibility | BXT answers, score rationale, blockers, confidence |
| **Step 1b: Reuse Gate** | Search similar Projects, present matches, and ask whether to link this Request to an existing Project or continue as a new project candidate | match list, selected Project ID when chosen, user decision, reuse/extension rationale |
| Phase 2: Technology Groupings | Ask the nine framework questions only as needed | framework answers by question, assumptions, skipped questions with reason |
| Phase 3: Scenario-Specific Selection | Produce the recommended approach and readiness brief | recommended Microsoft platform, rationale, estimated complexity, alternatives, risks, next actions |
| Submission | Ask for confirmation and update the Cosmos DB Request to `status: New` | final status, submission timestamp, owning `sessionId` |

Step 1b is not a replacement for the framework. It is the **reuse checkpoint** that prevents the advisor from recommending a new build when the organization already has a nearby Project on the shelf.

### Happy path

1. Business user opens the AI Project Advisor Agent through the selected client/channel backed by the Hosted Agent endpoint.
2. User signs in with Microsoft Entra unless demo mode is explicitly enabled.
3. Advisor loads the user's existing sessions from Cosmos DB (filtered to the signed-in `oid`, or to the demo anonymous id) and lets the user resume a draft or start a new session. A new session is created with a generated `sessionId`, stamped with the owning `userId`, and persisted before any conversation turns are written.
4. User completes the business-friendly intake form with project name, business outcome, affected users, desired behavior, data sources, actions, urgency, and constraints.
5. Advisor creates or updates a draft Request bound to the active session and captures each framework answer as structured Request data in Cosmos DB.
6. Advisor applies Phase 1 BXT: viability, desirability, and feasibility.
7. Advisor runs Step 1b: searches the existing-Project index for similar work and presents matches.
8. User chooses to link the Request to an existing Project or continue as a new project candidate.
9. Advisor continues the Microsoft AI Decision Framework, keeping the order outcomes before behaviors, behaviors before platforms, **and loads the active Organisation Context (system inventory, license/entitlement boundaries, and custom decision instructions) into the reasoning prompt**:
   1. **Phase 2 — Technology Groupings.** Walk the nine framework questions (interaction pattern, build style, data strategy, orchestration, governance, scale/cost, action safety, team skills, proactive vs. reactive) only as needed, skipping any whose answer is already implied by intake or BXT. Each answered question narrows the candidate groupings (M365 Copilot extensibility, Copilot Studio, Microsoft Foundry / Agent Service, M365 Agents SDK + Agent Framework, AI services, specialized copilots) rather than jumping to a single product. **Candidates that the organisation is explicitly not licensed for or has restricted are filtered out (or marked as gated) at this step; custom decision instructions are applied as soft preferences that re-rank surviving candidates.**
   2. **Phase 3 — Scenario-Specific Selection.** Take the shortlisted groupings and score them against the Request's scenario constraints (time-to-market, complexity, budget, skills, governance, deployment posture) **plus the organisation's installed systems and custom instructions** to pick the simplest platform that will work. Capture the chosen platform, runner-up alternatives, rationale, trade-offs, **and an explicit "alignment with organisation instructions" section** on the Request. **If the best-effort recommendation does not align with one or more custom instructions (e.g. Copilot Studio cannot meet a hard requirement so a pro-code Foundry path is recommended instead), the rationale must call out which instruction was not followed and why.**
10. If key context is missing, advisor asks concise clarification questions and stores each answer against the Request.
11. When enough context exists, advisor returns a project readiness brief with recommended Microsoft platform, rationale, estimated complexity, similar-project current data when available, **and the Organisation Context version applied plus a clear alignment-or-deviation note for each custom instruction**.
12. Advisor asks the user to confirm submission.
13. On confirmation, the advisor updates the Cosmos DB Request to `status: New`, preserves any Project link and the owning `sessionId`, and updates the session's `lastActiveAt` and `submittedRequestId`. No external queue is written.
14. User receives a submission confirmation with request ID and the readiness brief summary, and can return later to start a new session or resume any of their other sessions.

### Edge cases

| Scenario | Expected behavior | Owner |
|----------|-------------------|-------|
| Similar project found with high confidence | Show the match, present current project data (name, owner, status, technologies, summary), explain why it is similar, and recommend reuse, extension, or differentiation before submission | Advisor agent |
| User chooses an existing Project | Link the Request to that Project in Cosmos DB and include the Project ID on the submitted Request document | Advisor agent |
| User rejects all similar Projects | Keep the match list and rejection rationale on the Request, then continue as a new project candidate | Advisor agent |
| No similar project found | Say no close match was found and proceed with framework-guided evaluation | Advisor agent |
| Intake lacks outcome, user, or behavior | Ask clarification questions before recommending a technology | Advisor agent |
| User cancels confirmation | Do not change Request status to `New`; keep the readiness brief and session visible for editing | Advisor client/agent |
| Demo mode enabled | Skip user sign-in only; still use hosted agent identity / managed identity for Azure service access; sessions are partitioned under an opaque demo id and never mixed with Entra users | Advisor client/agent / platform operator |
| User tries to access another user's session | Reject the request with a not-found / forbidden response; never disclose whether the session exists for a different owner | Advisor agent |
| Anonymous demo user returns in a new browser | Treat as a fresh demo identity; do not surface prior demo sessions unless the same demo id token is presented | Advisor client/agent |
| Cosmos DB write fails on submission confirmation | Surface a clear submission error, keep the Request in its prior state, and do not claim the request was submitted | Advisor agent |
| Azure AI Search unavailable | Degrade to framework-only triage, label similarity search as unavailable, and prevent any false "no match" claim | Advisor agent |
| Hosted Agent protocol mismatch | Fail deployment validation or startup health checks rather than silently exposing an unusable agent endpoint | Dev team / platform operator |
| No Organisation Context configured yet | Advisor proceeds with the public Microsoft AI Decision Framework only, marks the brief as "no org context applied", and prompts the admin (where reachable) to populate the profile | Advisor agent |
| Recommendation conflicts with a custom decision instruction | Still return the best-effort recommendation, but the rationale must explicitly state which instruction was not followed and why (e.g. "Custom instruction preferred Copilot Studio, but the required autonomous tool-calling pattern is not supported there; Foundry Agent Service is recommended instead.") | Advisor agent |
| Recommended platform falls outside the licensed product list | Either propose a licensed alternative as the primary recommendation and list the unlicensed option as a "future option, requires procurement" alternative, or — when no licensed option fits — flag the gap explicitly with the procurement/entitlement action required | Advisor agent |
| Non-admin user attempts to view or edit the Organisation Context | Reject with forbidden, never reveal current content, and audit-log the attempt | Advisor agent |
| Organisation Context updated mid-session | The active session continues to display the version it started with; the *next* recommendation generation pulls the latest published version and records the version id on the Request | Advisor agent |

## 5. Functional Requirements

| ID | Requirement | Priority | Acceptance signal |
|----|-------------|----------|-------------------|
| FR-001 | Provide a polished intake form for business-user project idea submissions | Must | User can enter the minimum intake fields and start advisor analysis |
| FR-002 | Implement the advisor reasoning and tool orchestration with GitHub Copilot SDK (public preview) | Must | `advisor-agent` includes a Copilot SDK service using supported SDK session/tool patterns rather than a hand-rolled planner |
| FR-003 | Host the advisor runtime as a Microsoft Foundry Agent Service Hosted Agent (Preview) | Must | Deployment produces a hosted agent endpoint backed by the advisor container |
| FR-004 | Expose a Hosted Agent-compatible protocol endpoint | Must | The container passes Hosted Agent health/protocol validation for Responses or Invocations |
| FR-005 | Search existing Project briefs for similar work as Step 1b after Phase 1 BXT | Must | Readiness brief includes ranked similar-Project matches or an explicit unavailable/no-match state |
| FR-006 | Present similar Projects and let the user link the Request to an existing Project or continue as a new project candidate | Must | Request stores the user's reuse decision and selected Project ID when applicable |
| FR-007 | Persist a Request record throughout the conversation in Cosmos DB | Must | Request captures intake fields, framework answers, clarification responses, match decisions, status, timestamps, owning `sessionId`, and `ownerId` |
| FR-008 | Maintain a Project concept separate from Request in Cosmos DB | Must | A Project can have multiple linked Requests; a Request can be unlinked until promoted or attached |
| FR-009 | Apply the Microsoft AI Decision Framework before recommending technology | Must | Brief evaluates outcome, user, behavior, data, actions, governance, scale, skills, and deployment posture |
| FR-010 | Ask clarification questions when required fields or decision signals are missing | Must | Advisor asks questions before recommendation when outcome/user/behavior/data/risk are incomplete |
| FR-011 | Produce a project readiness brief | Must | Brief includes recommended Microsoft platform, rationale, estimated complexity, matches with current project data when available, Project link/new-candidate state, questions, scoring, risks, and next actions |
| FR-012 | Require user confirmation before request submission | Must | Request `status` is not changed to `New` until the user confirms |
| FR-013 | On confirmation, persist the submitted Request to Cosmos DB with `status: New` | Must | Cosmos DB Request document contains request ID, timestamp, status, owning `sessionId`, `ownerId`, Project link when applicable, readiness brief reference or payload, and submitter identity when available |
| FR-014 | Use Microsoft Entra sign-in by default | Must | Non-demo environments require authenticated users |
| FR-015 | Provide a demo flag to disable user sign-in | Should | Demo environment can run without Entra user sign-in while production cannot silently disable auth |
| FR-016 | Use managed identity or hosted agent identity for Azure AI Search and Cosmos DB access | Must | No service keys or connection strings are required for agent-to-Azure service calls |
| FR-017 | Place all advisor implementation and deployment assets under `advisor-agent` | Must | Code review shows agent code, Bicep, AZD files, container assets, and feature docs under `advisor-agent` |
| FR-018 | Provide per-user Conversation/Session management | Must | A user can list, create, resume, rename, and delete their own sessions; each session has a stable `sessionId`, owning `userId`, title, timestamps, and links to its Request(s) |
| FR-019 | Enforce session ownership and isolation | Must | All session/request/conversation reads and writes filter by the caller's `userId` (Entra `oid` or demo id); cross-user access returns not-found / forbidden and is audit-logged |
| FR-020 | Use Entra `oid` as the conversation/session ownership key when Entra sign-in is enabled | Must | Sessions created under Entra carry the Entra `oid` as `ownerId` and as the Cosmos DB partition key; demo-mode sessions use an opaque demo id in a separately scoped partition space |
| FR-021 | Provide an admin backend, gated by an Entra **`AdvisorAdmin`** app role (or equivalent security group), where admins can sign in and manage the Organisation Context | Must | Non-admin users cannot reach the admin endpoints/UI; admin sign-in requires the `AdvisorAdmin` role; all admin actions are audit-logged |
| FR-022 | Allow admins to define and update an **Organisation Context** document containing (a) system inventory of Microsoft and non-Microsoft platforms in use, (b) license/entitlement boundaries marking each Microsoft AI product as `available`, `available-with-restrictions`, or `unavailable` (with notes), and (c) free-text and structured **custom decision instructions** (e.g. preferred platform biases, region/regulatory constraints, skill/capacity constraints) | Must | Admin UI/API supports CRUD for all three sections; structured fields validate against a defined schema; free-text instructions have a max length and are versioned |
| FR-023 | Version the Organisation Context and record `orgContextVersion` and a snapshot of applied instructions on every Request | Must | Each save creates a new immutable version with `version`, `editorId`, `editedAt`, change summary; Requests record the version they were generated against |
| FR-024 | Load the active Organisation Context into the advisor's Phase 2 and Phase 3 reasoning on every recommendation | Must | Prompt/tool inputs include system inventory, entitlement boundaries, and custom instructions; the agent filters candidates against `unavailable` products in Phase 2 and applies custom instructions as soft preferences during Phase 3 |
| FR-025 | Surface the alignment between the recommendation and the custom decision instructions in the readiness brief rationale, including explicit reasons when the recommendation deviates from a custom instruction | Must | Brief contains a per-instruction "followed / partially followed / not followed" outcome with a reason for any non-followed instruction; deviation reasons are grounded in the framework (capability gap, governance, scale, etc.) |
| FR-026 | Best-effort, not blind, adherence to custom instructions | Must | The agent never recommends an `unavailable` product as the primary choice; it does not silently break a custom instruction — any deviation is explicit in the brief and the Request |
| FR-027 | Provide an admin **Requests list screen** in the admin backend | Must | Admins with `AdvisorAdmin` can view a paginated list of all Requests across users with columns for `requestId`, `ownerId` (display name when resolvable), `sessionId`, `status`, `createdAt`, `submittedAt`, linked `projectId`, and `orgContextVersion`; supports filter by status / owner / date range / linked Project / org-context version and sort by date and status; screen is read-only |
| FR-028 | Provide an admin **Request detail screen** | Must | Admins can open a Request to see the full readiness brief, framework answers, Step 1b match decision, Project link state, per-instruction alignment notes, and the `orgContextVersion` applied; no edit controls; opening a Request is audit-logged with the admin's identity, the `requestId`, and the `ownerId` whose data was viewed |
| FR-029 | Provide an admin **Projects list and detail screens** | Must | Admins can view a paginated list of Projects with `projectId`, name, owner, status, technologies, last-updated, and count of linked Requests; drill-in shows the Project summary, technology tags, and the list of linked Requests with their status; read-only — Project ingestion/update remains out of band for MVP |
| FR-030 | Enforce admin read scope at the data layer | Must | Admin list/detail endpoints query Cosmos DB without an `ownerId` partition-key filter only when the caller is in the `AdvisorAdmin` role; the query path is distinct from the per-user query path, is covered by automated tests, and every cross-partition read is audit-logged |

## 6. Acceptance Criteria

- [ ] A business user can open the advisor, complete the intake form, and request analysis.
- [ ] The advisor agent is implemented with GitHub Copilot SDK (public preview).
- [ ] The advisor runtime deploys as a Microsoft Foundry Hosted Agent (Preview), not an App Service-hosted API.
- [ ] The hosted agent container exposes the required Responses or Invocations protocol endpoint and passes health validation.
- [ ] The advisor captures each intake/framework answer against a Request stored in Cosmos DB.
- [ ] A signed-in user can create multiple sessions, see only their own session list, resume any of their own sessions, and never see another user's sessions.
- [ ] When Entra sign-in is enabled, sessions/requests are partitioned and owned by the Entra `oid`; in demo mode they are partitioned under an opaque demo id and never co-mingled with Entra-authenticated data.
- [ ] The advisor runs Step 1b after Phase 1 BXT and returns similar existing Projects from Azure AI Search or clearly states that similarity search is unavailable/no close match was found.
- [ ] The user can link the Request to an existing Project or continue as a new project candidate.
- [ ] The advisor asks clarification questions before producing a recommendation when required context is missing.
- [ ] The readiness brief includes recommended Microsoft platform, rationale, estimated complexity, framework scoring, risks, and next engineering actions.
- [ ] When a similar project exists, the brief presents the current project data (at minimum: project name, owner, status, technologies, and summary).
- [ ] The advisor asks for explicit confirmation before persisting the Request with `status: New`.
- [ ] A confirmed Request is written to Cosmos DB with `status: New` and includes the Project link when applicable; no Azure Storage Queue is written.
- [ ] Microsoft Entra sign-in is enabled by default and can only be disabled through an explicit demo flag.
- [ ] Agent-to-search and agent-to-Cosmos DB calls use managed identity or hosted agent identity with Azure RBAC.
- [ ] `advisor-agent` contains the agent code, protocol adapter, container assets, Bicep infrastructure, `azure.yaml`, setup docs, and operational notes.
- [ ] Public networking posture is documented, including what must change before production use with sensitive data.
- [ ] An admin with the `AdvisorAdmin` Entra app role can sign in and CRUD the Organisation Context (system inventory, license/entitlement boundaries, custom decision instructions). Non-admin users are denied with no information leakage.
- [ ] The advisor loads the active Organisation Context on every recommendation and records its version on the Request.
- [ ] Phase 2 candidate grouping filters out (or gates) products marked `unavailable` in the entitlement boundaries.
- [ ] Phase 3 scoring applies custom decision instructions as soft preferences; the readiness brief shows a per-instruction "followed / partially followed / not followed" outcome with explicit reasons for any deviation.
- [ ] When custom instructions cannot all be followed, the recommendation still ships as best-effort and the rationale explains the trade-off (capability gap, governance, scale, etc.).
- [ ] An admin can open a **Requests list** screen, filter and sort across all users' Requests, and drill into any Request to see its readiness brief, alignment notes, and applied `orgContextVersion`. The screen is read-only and every drill-in is audit-logged.
- [ ] An admin can open a **Projects list** screen and drill into a Project to see its summary and the Requests linked to it. The screen is read-only.
- [ ] Admin list/detail endpoints execute cross-partition Cosmos DB reads only when the caller has the `AdvisorAdmin` role; the same endpoints called by a non-admin (including a normal signed-in user) return forbidden and are audit-logged.

## 7. Data, Actions, and Integrations

### Data sources

| Source | Data used | Access pattern | Sensitivity | Notes |
|--------|-----------|----------------|-------------|-------|
| Advisor intake surface | Project name, outcome, users, behavior, data sources, actions, constraints, urgency | User-submitted through selected client/channel backed by the Hosted Agent endpoint | Potentially confidential project data | Validate required fields before analysis |
| GitHub Copilot SDK (public preview) | Conversation/session state, tool calls, model responses, generated readiness brief text | Agent runtime library inside hosted container | Depends on prompt and tool payloads | Use approved SDK patterns; avoid logging raw confidential prompts unless explicitly allowed |
| Microsoft Foundry Hosted Agent runtime (Preview) | Agent endpoint, container lifecycle, session state, hosted identity, telemetry | Hosting/runtime platform | Internal service metadata plus submitted idea content | Runtime target for the advisor container |
| Request store (Azure Cosmos DB) | Intake fields, conversation turns, framework answers, match decisions, readiness brief metadata, status, submitter identity, owning `sessionId` | Create/update during conversation; read for submission, listing, and operations | Potentially confidential project data | Stored in a Cosmos DB container partitioned by `ownerId` (`/ownerId`). System of record for user-submitted ideas |
| Project store (Azure Cosmos DB) | Existing Project summaries, owners, outcomes, technologies, statuses, lessons learned, linked Request IDs | Read for similarity indexing; update when linking a Request | Internal project metadata | Stored in a Cosmos DB container partitioned by `/projectId`. System of record for durable initiatives |
| Conversation/Session store (Azure Cosmos DB) | Session metadata, conversation turns, intermediate framework state, owning user, timestamps, submitted Request reference | Create on session start; update on every turn; read for list/resume | Potentially confidential project data | Stored in a Cosmos DB container partitioned by `/ownerId`; one logical partition per user holds all of that user's sessions |
| Azure AI Search Project index | Existing Project briefs, tags, outcomes, technologies, statuses, owners, lessons learned | Query during conversation | Internal project metadata | Search index derived from the Project container in Cosmos DB; use Microsoft Entra/RBAC where configured |
| Microsoft AI Decision Framework docs | Capability model, decision framework, evaluation criteria, technology guidance | Read/reference in advisor logic | Public repo content | Keep recommendations aligned to project Constitution: outcomes -> behaviors -> platforms |
| Organisation Context store (Azure Cosmos DB) | System inventory (Microsoft + non-Microsoft), license/entitlement boundaries per Microsoft AI product, custom decision instructions, version history | Admin write through admin backend; advisor read on every recommendation | Internal organisational metadata; may include licensing terms | Stored in a Cosmos DB container partitioned by `/orgId` (single `default` org in MVP); admin role required to write; agent identity reads only |

### Backend model

| Concept | Purpose | Minimum fields | Lifecycle notes |
|---------|---------|----------------|-----------------|
| Conversation/Session | A single ongoing or completed advisor conversation owned by exactly one user | `sessionId`, `ownerId` (Entra `oid` or demo id), `ownerType` (`entra` \| `demo`), `title`, `status` (`active` \| `submitted` \| `archived`), `createdAt`, `lastActiveAt`, `turnCount`, `currentRequestId`, `submittedRequestId` | Created at session start, updated on every turn, marked `submitted` when its Request reaches `status: New`. A user can have many sessions; sessions are never shared across users. |
| Request | The conversational intake artifact for one business user's idea | `requestId`, `sessionId`, `ownerId`, `submitterId`, `title`, `businessOutcome`, `targetUsers`, `desiredBehavior`, `dataSources`, `actions`, `constraints`, `frameworkAnswers`, `similarProjectMatches`, `reuseDecision`, `linkedProjectId`, `readinessBriefRef`, `status`, timestamps | Starts as `Draft`, moves through advisor clarification, becomes `ReadyForConfirmation`, then `New` after confirmed submission. `linkedProjectId` can be empty for new project candidates. Always carries the owning `sessionId` and `ownerId`. |
| Project | A durable existing or accepted AI initiative | `projectId`, `name`, `summary`, `owner`, `businessOutcomes`, `userGroups`, `technologies`, `dataDomains`, `status`, `lessonsLearned`, `linkedRequestIds`, timestamps | Used for Step 1b matching. A Project can accumulate many linked Requests when users decide their idea belongs with existing work. Projects are organization-wide artifacts, not partitioned by user. |
| Organisation Context | Admin-curated context the advisor must consider on every recommendation | `orgId`, `version`, `editorId`, `editedAt`, `changeSummary`, `systemInventory[]` (each: `name`, `vendor` `microsoft\|non-microsoft`, `category`, `notes`, `isAuthoritativeFor[]`), `entitlements[]` (each: `productId`, `status` `available\|available-with-restrictions\|unavailable`, `restrictionNotes`, `regions[]`), `customInstructions[]` (each: `id`, `text`, `kind` `preference\|hard-constraint\|context-note`, `appliesTo` `phase-2\|phase-3\|both`, optional structured tags), `published` (bool) | Versioned. Only one `published: true` version is the "active" context loaded by the agent. Every Request stamps the `orgContextVersion` used. |
| Recommendation Alignment Note | Embedded in each Request's readiness brief | `instructionId`, `outcome` `followed\|partially-followed\|not-followed`, `reason`, `frameworkAnchor` (e.g. `Q2 build style`, `Q6 scale and cost`) | Generated by the agent during Phase 3. Required for every custom instruction in the active Organisation Context version. |

When a user says "add my ask to this current project," the advisor records that as a Request-to-Project relationship, not as a silent Project merge. The Request keeps its own answers and rationale, while the Project gains a linked Request reference for reviewers.

### Actions and side effects

| Action | Trigger | Approval needed? | Rollback or compensation |
|--------|---------|------------------|--------------------------|
| Start or resume Conversation/Session | User opens advisor or selects an existing session from their list | No | Session can be abandoned; document remains in Cosmos DB until archived/deleted |
| List user's sessions | User opens advisor home/inbox | No | None |
| Rename or delete a session | User manages their own session | No (own-session only) | Soft-delete preferred so audit log can still reference `sessionId` |
| Start Copilot SDK turn | User sends a message in an active session | No | End turn and keep current Request draft |
| Create or update Request | User starts intake or answers a framework question | No | User can edit or withdraw before confirmation |
| Similar-Project search | Phase 1 BXT completes | No | Retry or mark similarity search unavailable |
| Link Request to Project | User chooses an existing Project in Step 1b | Yes, explicit reuse/link decision | User can change selection before final confirmation; retain prior match history |
| Continue as new project candidate | User rejects or skips similar Projects | Yes, explicit continue decision | User can return to Step 1b before final confirmation |
| Clarification question | Missing decision signal | No | User can answer, edit intake, or stop |
| Generate readiness brief | Sufficient context exists | No | User can revise intake and regenerate |
| Submit Request (`status: New` in Cosmos DB) | User confirms submission | Yes, explicit submit confirmation | If the Cosmos DB write fails, show error and do not claim submission; Request stays in `ReadyForConfirmation` |
| Admin sign-in to backend | Admin opens admin UI/API | Yes, requires `AdvisorAdmin` Entra app role | Non-admin sign-in is denied and audit-logged |
| Create/update Organisation Context version | Admin saves edits in the admin backend | Yes, explicit admin save (and optional "publish" step) | Previous versions remain immutable; admin can revert by republishing an older version |
| Publish Organisation Context version | Admin marks a draft version as active | Yes, explicit publish action | Republishing the prior version rolls back; in-flight recommendations record the version they used so history stays accurate |
| Load Organisation Context for a recommendation | Advisor reaches Phase 2 | No | If load fails, advisor continues without org context, flags it on the brief, and surfaces an operator alert |
| View Requests list (admin) | Admin opens the Requests screen in the admin backend | Yes, requires `AdvisorAdmin` role | Cross-partition read against `requests`; supports filter/sort; read-only; every page view records the admin id and filter parameters in audit log |
| View Request detail (admin) | Admin opens a single Request from the list | Yes, requires `AdvisorAdmin` role | Returns the full Request including readiness brief, alignment notes, and `orgContextVersion`; no edit controls; audit log records `adminId`, `requestId`, `ownerId` viewed |
| View Projects list and detail (admin) | Admin opens the Projects screen | Yes, requires `AdvisorAdmin` role | Cross-partition read against `projects`; drill-in lists linked Requests; read-only |

### Integrations

| System | Direction | Protocol/API | Auth model | Notes |
|--------|-----------|--------------|------------|-------|
| Microsoft Entra ID | User -> advisor client/channel | Client/channel authentication | Entra sign-in by default; **`AdvisorAdmin` app role gates the admin backend** | Demo flag may disable user sign-in outside production. The Entra `oid` is the ownership key for the user's conversations/sessions, Requests, and Cosmos DB partitions. |
| GitHub Copilot SDK (public preview) | Agent container -> model/provider | SDK session API | Azure BYOM bearer token through managed identity preferred; GitHub token only as documented exception | Implements agent reasoning, tools, and framework-guided conversation |
| Microsoft Foundry Agent Service Hosted Agent (Preview) | User/client -> agent runtime | Responses or Invocations protocol | Microsoft Entra / hosted agent identity | Hosts advisor container and exposes agent endpoint |
| Azure Cosmos DB (NoSQL API) | Agent & admin backend -> Cosmos DB | Azure Cosmos DB SDK | Managed identity / hosted agent identity + Cosmos DB data-plane RBAC | Single durable store for Conversations/Sessions, Requests, Projects, and the Organisation Context. Per-user containers partitioned by `/ownerId`; Projects partitioned by `/projectId`; Organisation Context partitioned by `/orgId`. The agent identity has read-only access to the Organisation Context container; the admin backend identity has read/write on `org-context` and **read-only cross-partition access on `sessions` (metadata), `requests`, and `projects` to power the admin browse screens**. |
| Azure AI Search | Agent -> Search | Azure SDK or REST | Managed identity / hosted agent identity + Azure RBAC | Similarity index for existing Project briefs |
| Application Insights / Azure Monitor | Agent -> telemetry | SDK / platform telemetry | Managed identity or platform configuration where supported | Logs, metrics, traces, dashboards, alerts |
| Existing docs site | User -> advisor | Link/navigation | Public docs link to the selected advisor client/channel | Docs site remains Jekyll/GitHub Pages |

## 8. Architecture Overview

The MVP is a hosted-agent intake system under `advisor-agent`:

- **GitHub Copilot SDK advisor service (public preview)**: Owns the agent system prompt, framework flow, tools, Step 1b Reuse Gate, readiness brief generation, Conversation/Session lifecycle, and Request state transitions.
- **Hosted Agent protocol adapter**: Exposes Responses or Invocations for Microsoft Foundry Agent Service. Think of this as the translator between "Foundry knows how to host agents" and "Copilot SDK knows how to run this advisor's reasoning loop." The adapter is responsible for resolving the caller's identity (Entra `oid` or demo id) on every request and passing it to the session layer.
- **Microsoft Foundry Agent Service Hosted Agent (Preview)**: Hosts the advisor container, endpoint, runtime sessions, lifecycle, scaling, and hosted agent identity. Note: Foundry "runtime sessions" are infrastructure; the *user-facing* Conversation/Session is owned by the advisor and persisted in Cosmos DB.
- **Azure Container Registry**: Stores the advisor container image consumed by the Hosted Agent deployment.
- **Azure Cosmos DB (NoSQL API)**: Single durable store for Conversations/Sessions, Requests, Projects, and the Organisation Context. Containers:
  - `sessions` — partition key `/ownerId`, holds one logical partition per user (or per demo id) with all of that user's sessions and conversation turns.
  - `requests` — partition key `/ownerId`, one document per Request, carrying `sessionId`, Project link, and `orgContextVersion`.
  - `projects` — partition key `/projectId`, organization-wide Project records.
  - `org-context` — partition key `/orgId`, versioned Organisation Context documents (system inventory, entitlements, custom decision instructions). Read-only to the advisor agent identity; read/write to the admin backend identity.
  All advisor reads/writes against `sessions` and `requests` MUST filter by `ownerId` so a user can never see another user's data. Cosmos DB data-plane RBAC is the second line of defense.
- **Admin backend service**: A lightweight admin API plus a minimal admin UI that authenticates with Entra, requires the `AdvisorAdmin` app role, and exposes three surfaces: (1) **Organisation Context** management (CRUD + versioning + publish/revert) against the `org-context` container, (2) a **Requests browse screen** (list + detail) backed by a read-only cross-partition query against `requests`, and (3) a **Projects browse screen** (list + detail) backed by a read-only cross-partition query against `projects`. The browse screens are read-only — admins inspect, they do not edit Requests or Projects. The admin backend ships as part of the advisor container (or a sibling container under `advisor-agent`) but uses its own managed identity scoped for read/write on `org-context` and read-only on `sessions`/`requests`/`projects`.
- **Azure AI Search**: Indexes Project briefs for similarity matching, sourced from the `projects` container.
- **Hosted agent identity / managed identity**: Used by the agent when calling Cosmos DB and Azure AI Search. The agent identity has *read-only* RBAC on `org-context` and *read/write* on `sessions`/`requests`/`projects` scoped to the caller's `ownerId` partition. The admin backend identity has *read/write* on `org-context` and *read-only* cross-partition access on `sessions`/`requests`/`projects` for the browse screens.
- **Microsoft Entra sign-in**: Default user authentication model. The Entra `oid` claim is the canonical `ownerId` for sessions/requests. A tightly scoped demo flag may disable user sign-in in demo environments only; demo traffic is partitioned under an opaque demo id and never mixed with Entra-authenticated data.
- **Bicep + AZD**: Provision and deploy the full advisor agent from the `advisor-agent` folder.

Think of the advisor as **the intake desk plus the librarian, working under a house policy set by the admin**. The intake desk collects the project idea cleanly as a Request, keeping a private notebook per user (the Conversation/Session in Cosmos DB). The librarian checks the Project shelves for similar work. The **house policy** — installed systems, what is licensed, and how the organisation prefers to build — is the Organisation Context the admin maintains in the backend. The architect applies the framework *and* the house policy before the Request is stamped `New`. When the recommendation cannot fully honour the policy, the rationale says so out loud.

### Key design decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| Target business idea submitters first | The advisor exists to translate early business ideas into engineering-ready intake before build work starts | Dev-team-only intake tool |
| Build the advisor with GitHub Copilot SDK (public preview) | The advisor needs programmable agent behavior, tool calls, and framework-guided conversation rather than static prompt-only configuration | Hand-rolled orchestration, prompt-only agent |
| Host as a Microsoft Foundry Hosted Agent (Preview) | Hosted Agent keeps custom agent code while letting Foundry manage runtime, endpoint, scaling, sessions, and lifecycle | Azure App Service web/API, Azure Container Apps self-hosting |
| Separate Request from Project | Requests are conversational intake records; Projects are durable initiatives that may collect many related Requests | Single flat submission table |
| Add Step 1b Reuse Gate after BXT | The official framework moves from BXT to technology grouping; the advisor needs one extra reuse checkpoint before recommending another build | Search only at the end of the brief, no reuse decision |
| Use Azure AI Search for existing-project similarity | Similarity matching needs searchable project summaries with vector/text capabilities rather than a raw Cosmos DB query | Cosmos DB built-in queries only, SQL DB full-text only |
| Use Azure Cosmos DB (NoSQL API) for Conversations/Sessions, Requests, and Projects | Cosmos DB provides a single durable store with partition-key-based per-user isolation, low-latency reads/writes for chat-style workloads, Change Feed for downstream consumers, and managed-identity data-plane RBAC | Azure Table Storage (weaker query/feed story), SQL DB (heavier schema/operations), App-managed file store |
| Drop Azure Storage Queue from the architecture | Confirmed Requests already live in Cosmos DB; a separate queue duplicated state and added a failure mode. Downstream consumers can subscribe to the Cosmos DB Change Feed or poll by status | Keep Storage Queue as workflow handoff |
| Make Entra `oid` the conversation ownership / partition key | Structural per-user isolation is stronger than application-layer filtering; partition-keyed reads are also the fastest Cosmos DB access pattern | Use submitter email as key, mix all users in a single partition with app-level filtering |
| Add an admin backend with an Entra app role for Organisation Context management | Real recommendations depend on what the organisation already owns, is licensed for, and prefers; without a structured admin surface this context lives in tribal knowledge | Bake assumptions into prompts at deploy time, scrape M365/Entra APIs (out of scope for MVP) |
| Treat custom decision instructions as soft preferences but `unavailable` entitlements as hard filters | Licensing/contractual gaps are real blockers; stylistic preferences (e.g. "prefer Copilot Studio") are guidance the architect should follow when feasible but can be overridden with reason | Treat all custom instructions as hard constraints (would block valid recommendations), or treat all as soft (would let the agent recommend unlicensed products) |
| Always surface alignment/deviation per instruction in the brief rationale | Prevents the agent from silently ignoring admin guidance and gives admins evidence to refine future instructions | Hide deviations, mention only "policy considered" |
| Version the Organisation Context and stamp the used version on each Request | Recommendations are reproducible and auditable; admins can change policy without rewriting history | Single mutable document |
| Give admins read-only cross-partition browse screens for Requests and Projects rather than edit access | Admins need visibility into what the advisor is producing — to refine instructions, spot bad recommendations, and audit deviation — but should not silently rewrite user-owned Requests or Projects | Full edit access (risks tampering, blurs ownership), CLI/Cosmos Explorer only (poor usability, no audit trail), exposing the user-facing session UI to admins (would leak conversation turns and break the "you only see your own sessions" promise) |
| Public networking for MVP/demo | User selected public posture for demo/low-risk workloads | Private-by-default or hybrid enterprise posture |
| Put all feature assets under `advisor-agent` | Keeps agent code, Bicep, AZD, and docs isolated from the existing Jekyll docs site | Root-level Azure deployment files |

## 9. Azure Deployment Requirements

### Infrastructure as code: Bicep

- Bicep is the required IaC format.
- Expected structure:
  - `advisor-agent/infra/main.bicep`
  - `advisor-agent/infra/main.parameters.json` or environment-specific parameter files
  - reusable modules under `advisor-agent/infra/modules/` when the template grows
- Every required Azure resource must be represented in Bicep or explicitly listed as an exception.
- Required resources for MVP:
  - Microsoft Foundry project / Agent Service configuration for Hosted Agent deployment
  - Azure Container Registry for advisor container images
  - **Azure Cosmos DB account (NoSQL API)** with database and four containers: `sessions` (partition key `/ownerId`), `requests` (partition key `/ownerId`), `projects` (partition key `/projectId`), `org-context` (partition key `/orgId`)
  - Azure AI Search service
  - Azure Key Vault only if a GitHub token or other non-Azure secret is required by the selected Copilot SDK model path
  - Application Insights / Log Analytics
  - Microsoft Entra **app registration** for the advisor with an **`AdvisorAdmin` app role** assignable to users/groups, plus the standard user role for submitters
  - Role assignments for the **agent identity** (Cosmos DB Built-in Data Reader on `org-context`, Data Contributor on `sessions`/`requests`/`projects`) and the **admin backend identity** (Cosmos DB Built-in Data Contributor on `org-context`, **Data Reader on `sessions`/`requests`/`projects` for the cross-partition admin browse screens**), Azure AI Search, Container Registry, and Key Vault when used
- Hosted Agent lifecycle resources and versions should be represented in Bicep where supported. If a Hosted Agent operation requires Azure CLI, Foundry CLI, REST, or SDK steps, document it as an explicit AZD hook/script rather than hiding it in manual portal work.
- Bicep should expose parameters for:
  - environment name
  - location
  - agent/container name prefix
  - auth mode / demo flag
  - Copilot SDK model path (`azure-byom` preferred, `github-default` only with Key Vault-backed token)
  - Hosted Agent protocol (`responses` or `invocations`)
  - public networking posture
  - SKU choices
  - tags

### AZD deployability

- The feature must be deployable with Azure Developer CLI from `advisor-agent`.
- Include or update:
  - `advisor-agent/azure.yaml`
  - `advisor-agent/infra/main.bicep`
  - container build/publish step for the advisor Hosted Agent image
  - Hosted Agent create/update/version deployment step
  - documented environment setup
  - documented `azd up`, `azd deploy`, and `azd provision` commands
  - any required pre-provisioning steps
- The existing repository does not currently define root-level `azure.yaml` or Bicep templates for this feature; this feature should create them under `advisor-agent`.

### Identity: managed identity first

- Use the Hosted Agent identity or managed identity for service-to-service calls from the advisor agent to Azure Cosmos DB, Azure AI Search, Azure Container Registry pull, and Key Vault when used.
- Prefer the platform-provided hosted agent identity for MVP unless the dev team needs identity reuse across multiple agent versions or services.
- For Azure BYOM/Foundry model access through Copilot SDK, use `ManagedIdentityCredential` in production to obtain a bearer token. Use `DefaultAzureCredential` only for local development.
- Avoid application secrets, Search admin keys, Cosmos DB account keys/connection strings, and model provider keys in local config, CI variables, or app settings.
- If the GitHub default Copilot SDK model path is selected and a GitHub token is required, store it in Key Vault, grant the hosted agent identity least-privilege secret read access, and document token ownership/rotation.
- If a secret becomes unavoidable, document:
  - why managed identity is not possible
  - where the secret is stored
  - who owns rotation
  - the rotation interval

### Environments

| Environment | Purpose | Deployment command | Approval gate |
|-------------|---------|--------------------|---------------|
| dev | Active development and demo mode validation | `cd advisor-agent && azd up` | Dev team review |
| test | Authenticated integration testing with representative project data | `cd advisor-agent && azd provision && azd deploy` | Tech lead approval |
| prod | Production advisor for business idea intake | `cd advisor-agent && azd up` through approved pipeline | Architecture/security approval; demo auth disabled |

## 10. Networking Configuration

### Selected posture

Selected posture: **Public**

Rationale: The user selected public networking as acceptable for demo and low-risk workloads. The MVP prioritizes a reachable advisor client/channel and Hosted Agent endpoint with strong authentication, hosted agent identity / managed identity, Azure RBAC, HTTPS, and telemetry. Private networking is a production hardening path, not an MVP requirement.

### Network requirements

| Area | Requirement | Notes |
|------|-------------|-------|
| Ingress | Public HTTPS ingress through the selected advisor client/channel to the Hosted Agent endpoint | Microsoft Entra sign-in is default; demo flag can disable user sign-in only outside production |
| Egress | Advisor Hosted Agent can call Azure Cosmos DB, Azure AI Search, Azure Container Registry, optional Key Vault, and telemetry endpoints | Use hosted agent identity / managed identity and Azure RBAC rather than service keys |
| Private endpoints | Not required for MVP | Add as production hardening if sensitive project data or enterprise policy requires private data plane (Cosmos DB private endpoint, Search private endpoint); verify Hosted Agent private networking support before promising it |
| VNet integration | Not required for MVP | Leave Bicep/AZD structure extensible for later private networking where supported by Hosted Agent |
| DNS | Public DNS is acceptable for MVP | Private DNS zones are out of scope until private endpoints are introduced |
| Firewall or NSG rules | Use least-privilege Azure RBAC and disable shared-key style access where feasible (disable Cosmos DB local auth / account keys once managed identity is wired up) | Any Cosmos DB / Search network restrictions must be tested from the Hosted Agent runtime before production |
| Local development | Developers authenticate with Azure developer credentials for service access; demo mode may bypass user sign-in locally | Local settings must not contain Search keys, Cosmos DB keys/connection strings, or model provider keys |

### Networking open questions

- Should production later move from public to hybrid or private networking if project ideas include confidential customer, financial, or regulated data?

## 11. Security and Governance

| Concern | Requirement | Owner |
|---------|-------------|-------|
| Authentication | Microsoft Entra sign-in by default; explicit demo flag may disable user sign-in outside production; admin backend requires the `AdvisorAdmin` Entra app role with no demo bypass | Dev team / platform operator |
| Authorization | Role-based access for submitters and admins; admin/operator functions separated from normal submission; advisor enforces per-user session/request ownership by Entra `oid` (or demo id); Cosmos DB data-plane RBAC restricts the agent identity to read-only on `org-context` and read/write on session/request/project containers; admin backend identity has read/write on `org-context` only | Dev team |
| Session isolation | A user can only see, resume, and submit their own sessions/requests. All Cosmos DB queries against `sessions` and `requests` must specify the caller's `ownerId` partition key. Cross-user reads must be rejected and audit-logged. | Dev team |
| Admin scope | Admin backend is reachable only by users in the `AdvisorAdmin` role; demo mode cannot grant admin; non-admin attempts to read/write Organisation Context **or to call the admin Requests/Projects browse endpoints** are denied with no content leakage and are audit-logged. The admin browse screens are read-only — admins cannot edit Requests or Projects from these screens. | Dev team / security reviewer |
| Admin data exposure | Admin Requests/Projects browse screens deliberately allow cross-partition reads across all users. Treat this as an elevated privilege: limit `AdvisorAdmin` membership, audit-log every list query (with filter parameters) and every Request drill-in (with `adminId`, `requestId`, `ownerId`), and never expose raw conversation turns from `sessions` on admin screens — only the Request and brief that the user explicitly confirmed | Security reviewer / dev team |
| Secrets | Managed identity / hosted agent identity first; document any exception; GitHub token, if required by the chosen Copilot SDK model path, must live in Key Vault | Platform operator |
| Data retention | Define retention for intake payloads, conversation turns, readiness briefs, submitted Requests, and Organisation Context version history in Cosmos DB before production; document how a user can request deletion of their own sessions | Product owner / platform operator |
| Audit logging | Log Conversation/Session create/resume/rename/delete, Request creation/update, Step 1b match decisions, Project links, confirmation events, Cosmos DB submission writes, cross-user access attempts, **admin sign-in, Organisation Context create/update/publish/revert, non-admin attempts to access admin endpoints, admin Requests/Projects list queries (with filter parameters), admin Request drill-in views (with `adminId`, `requestId`, `ownerId`)**, errors, and admin/config changes | Dev team |
| Compliance constraints | Treat project ideas as internal confidential unless classified otherwise | Product owner |
| Demo mode | Must be visibly enabled, disabled in production, and unable to disable hosted agent identity / managed identity service access | Dev team |
| Responsible AI | Recommendations must be grounded in the framework and label uncertainty, assumptions, and missing information | Architect / dev team |
| Hosted Agent preview status | Hosted Agent-specific behavior must be validated against current Microsoft Learn docs before production commitment | Architect / dev team |

## 12. Observability and Operations

| Signal | Requirement | Alert or dashboard |
|--------|-------------|--------------------|
| Logs | Structured logs for Copilot SDK session start/end, Conversation/Session created/resumed/renamed/deleted, Request created/updated, Step 1b search executed, Project link selected/rejected, clarification asked, brief generated, confirmation requested, Cosmos DB submission written, cross-user access attempts, **admin sign-in, Organisation Context create/update/publish/revert, agent load of active Organisation Context version, admin Requests/Projects list queries, admin Request drill-in views**, and errors | Hosted Agent / agent log query dashboard |
| Metrics | Active sessions per user (P95), session count, Request count, Project link rate, brief generation latency, Copilot SDK/model latency, Search query latency, Cosmos DB read/write RU and latency, submission success/failure, clarification rate, no-match rate, **rate of recommendations deviating from custom instructions (per instruction, per Phase)** | Advisor health dashboard |
| Traces | End-to-end trace from intake request through Copilot SDK session, Cosmos DB session/Request persistence, Search lookup, Project link decision, and final `status: New` write | Distributed tracing view |
| Availability | Hosted Agent health/protocol checks plus dependency checks for Cosmos DB and Search | Alert on failed health checks |
| Cost | Track Foundry Hosted Agent, model usage, Search, Cosmos DB (RU/storage), Container Registry, optional Key Vault, and telemetry cost | Monthly cost dashboard/budget alert |

### Runbook requirements

- How to deploy with `azd up`.
- How to build/publish the advisor container and deploy a Hosted Agent version.
- How to validate the Hosted Agent endpoint, protocol adapter, and health checks.
- How to rotate or remove any approved secret exception.
- How to validate managed identity role assignments (including Cosmos DB data-plane RBAC).
- How to inspect Conversation/Session and Request records in Cosmos DB without exposing confidential content, and how to delete a user's sessions on request.
- How to verify Search index availability and document count.
- How to query Cosmos DB for `requests` in `status: New` and inspect submission failures.
- How to disable demo mode before production.
- How to triage "similarity search unavailable" vs. "no similar project found."
- How to investigate a suspected cross-user access attempt.
- How to assign or revoke the `AdvisorAdmin` Entra app role.
- How to publish, revert, or compare Organisation Context versions.
- How to use the admin **Requests browse screen** to triage submissions across all users (filter by status, owner, date, linked Project, `orgContextVersion`) and how to use the admin **Projects browse screen** to inspect Projects and their linked Requests.
- How to investigate a recommendation that deviated from a custom decision instruction (find the Request, the `orgContextVersion` it used, and the per-instruction alignment notes).

## 13. Documentation Requirements

The dev team must produce or update:

- [ ] `advisor-agent/README.md` with feature overview and local setup.
- [ ] `advisor-agent/docs/architecture.md` or equivalent architecture note.
- [ ] `advisor-agent/docs/deployment.md` with AZD commands.
- [ ] Copilot SDK implementation notes, including selected SDK language, session pattern, tools, and model configuration.
- [ ] Hosted Agent protocol and deployment notes, including Responses vs. Invocations decision.
- [ ] Container build/publish instructions.
- [ ] Bicep infrastructure notes.
- [ ] Managed identity and RBAC setup notes.
- [ ] Networking configuration notes.
- [ ] Operational runbook.
- [ ] Troubleshooting guide.
- [ ] Request and Project data model contract.
- [ ] Conversation/Session data model contract and per-user isolation rules.
- [ ] Organisation Context data model contract, admin RBAC model, and version/publish semantics.
- [ ] Data contract for Project briefs indexed in Azure AI Search.
- [ ] Cosmos DB submission contract (document shape for `status: New` Requests) and downstream Change Feed consumer guidance.
- [ ] Demo mode safety note.
- [ ] Admin backend user guide (assigning `AdvisorAdmin` role, writing effective custom instructions, reviewing deviation reports, **using the Requests and Projects browse screens to triage submissions across users**).

## 14. Testing Strategy

| Test type | Coverage needed | Owner |
|-----------|-----------------|-------|
| Unit | Copilot SDK tool handlers, intake validation, Conversation/Session lifecycle (create/list/resume/rename/delete), ownership-filter enforcement, Request state transitions, Step 1b match decision rules, framework scoring, clarification trigger rules, Cosmos DB document shape construction, **Organisation Context schema validation, entitlement filtering logic, custom-instruction alignment evaluation** | Dev team |
| Integration | Hosted Agent protocol endpoint, Copilot SDK session flow, Cosmos DB session/Request/Project/Org-Context create/read/update with managed identity, Cosmos DB partition-key filtering, Azure AI Search query, managed identity auth in deployed environment, **admin backend CRUD against `org-context` with `AdvisorAdmin` role enforcement**, **advisor reads the latest published Organisation Context and stamps its version on the Request** | Dev team |
| End-to-end | User completes intake through the selected client/channel, starts multiple sessions, resumes a prior session, sees similar Projects, links or rejects a Project, receives brief, confirms, and sees the Request appear in Cosmos DB with `status: New`; **separately, an admin signs in, edits the Organisation Context, publishes a new version, and a subsequent user recommendation reflects the new instructions in Phase 2/3 reasoning and rationale; additionally, the admin opens the Requests browse screen, filters by status and `orgContextVersion`, drills into a specific Request to inspect its readiness brief and alignment notes, and opens the Projects browse screen to inspect a Project and its linked Requests — all in read-only mode and all drill-ins audit-logged** | Dev team |
| Security | Entra auth default, demo flag restrictions, RBAC role boundaries, hosted agent identity access, no service keys in config, cross-user access attempts (user A tries to read user B's session/request) are rejected and logged, demo and Entra session spaces do not intersect, **non-admin users cannot reach admin endpoints or read `org-context`, non-admin users cannot reach the admin Requests/Projects browse endpoints, the admin browse endpoints are read-only (no edit/delete verbs return success), demo mode cannot grant admin, agent identity cannot write `org-context`** | Dev team / security reviewer |
| Deployment smoke | `azd up` provisions resources, publishes the agent container, hosted agent endpoint passes health/protocol checks, Cosmos DB containers exist with the expected partition keys (including `org-context`), Search index is reachable, a confirmed Request writes `status: New` to Cosmos DB, **`AdvisorAdmin` app role is created and assignable** | Platform operator |
| Regression | Similar-Project unavailable state does not become a false "no match" recommendation; linking to a Project does not create a duplicate Project; protocol adapter changes do not break Copilot SDK session behavior; session isolation cannot regress to a global query without a partition-key filter; **changes to the agent prompt or tools cannot regress entitlement filtering (no `unavailable` product is ever the primary recommendation) or the per-instruction alignment section of the brief** | Dev team |

## 15. Rollout and Migration

| Phase | Entry criteria | Exit criteria | Rollback |
|-------|----------------|---------------|----------|
| Prototype | `advisor-agent` scaffold exists; Copilot SDK session works locally; protocol adapter can return a readiness brief with stubbed data | Dev team can run local demo and review brief shape | Remove prototype agent route/container without touching docs site |
| Pilot | Azure resources deploy through AZD; hosted agent endpoint is reachable; Cosmos DB contains seeded sample Projects and is reachable for sessions/requests; Search index has sample Projects | Pilot business users start/resume multiple personal sessions, submit real low-risk project ideas, link to existing Projects when relevant, and operators can monitor Hosted Agent / Cosmos DB / Search | Disable client/channel access or hosted agent endpoint; preserve Cosmos DB records for audit |
| Production | Auth enabled, demo flag disabled, RBAC reviewed (including Cosmos DB data-plane RBAC), Hosted Agent docs/status validated, runbook complete, cost alerts enabled, Project ingestion/update process defined, session isolation tests pass | Business users use advisor as the intake front door for AI project Requests | Pause intake, disable hosted agent endpoint/version, archive submitted Requests according to runbook |

## 16. Risks

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| Public networking used for sensitive project data | Confidential ideas could be exposed through misconfiguration | Keep Entra auth default, use HTTPS, RBAC, telemetry, and plan hybrid/private posture before sensitive production rollout | Platform operator |
| Demo flag accidentally enabled in production | Unauthenticated access to advisor | Environment gate: production deployment fails or alerts if demo flag is enabled | Dev team |
| Hosted Agent preview capability changes | Deployment, protocol behavior, networking, or pricing could shift before production | Validate against current Microsoft Learn docs, pin implementation assumptions, and keep rollback to prior hosted agent version | Architect / platform operator |
| Copilot SDK model/auth path is chosen casually | The team could introduce unnecessary tokens or provider mismatch | Default to Azure BYOM with managed identity bearer token; treat GitHub-token path as a Key Vault-backed exception | Dev team |
| Protocol adapter hides SDK/runtime errors | Business users may see generic failures or incomplete brief generation | Health checks must validate Copilot SDK session startup, protocol contract, and dependency access | Dev team |
| Similarity search misses relevant work | Duplicate projects may proceed | Show confidence/uncertainty, allow manual review, improve index schema and ingestion quality | Architect |
| Request-to-Project link is wrong or too casually accepted | A real new idea could be buried under an unrelated Project | Require explicit user confirmation, store rationale, and allow reviewer correction | Product owner |
| Submitted Request diverges from session state | Reviewers may see stale or incomplete context | Treat the Cosmos DB Request as source of truth and reference (not duplicate) conversation turns from the owning session | Dev team |
| Recommendation overclaims Microsoft product capability | Bad architecture decisions | Follow repository Constitution: verify technical claims against Microsoft docs; label assumptions and preview status | Dev team |
| Managed identity role assignments incomplete | Cosmos DB or Search operations fail | Include deployment smoke tests and runbook steps for RBAC validation (data-plane RBAC for Cosmos DB) | Platform operator |
| Session isolation bug exposes one user's data to another | High-severity confidentiality incident | Enforce partition-key filtering at the data layer, require `ownerId` on every session/request query, add automated cross-user access tests, audit-log any access denial | Dev team / security reviewer |
| Cosmos DB submission write fails or partially succeeds | User believes their idea was submitted when it was not, or vice versa | Treat the submission write as the source of truth, use a single atomic upsert that sets `status: New` with a precondition (etag) on `ReadyForConfirmation`, surface explicit success/failure to the user | Dev team |
| Admin custom instructions are vague or contradictory | Agent applies them inconsistently, deviation notes become noisy | Provide admin UI guidance and examples; validate structured fields; surface a deviation-rate metric so admins can refine instructions | Product owner / dev team |
| Agent silently ignores or over-honours custom instructions | Either advice diverges from organisation reality, or the agent recommends an unlicensed/unviable product to satisfy a preference | Treat `unavailable` entitlements as hard filters, custom instructions as soft preferences; require an explicit per-instruction alignment note on every brief; add regression tests | Dev team |
| Stale Organisation Context applied to a long-running session | Recommendation rationale references outdated policy | Stamp `orgContextVersion` on every Request; allow sessions to refresh the loaded version on the next recommendation; runbook step to compare versions | Dev team |
| Admin role over-assignment | Too many users can change organisation policy **or read every user's Requests through the admin browse screens** | Limit `AdvisorAdmin` to a small Entra group; require approval to add; log every role assignment change; review admin drill-in audit logs for unusual access patterns | Platform operator / security |
| Admin browse screens leak confidential Request content | Admins can view Requests across all users by design; an over-broad role or a missing audit log would amplify the blast radius of a compromise | Treat `AdvisorAdmin` as a privileged role, keep browse endpoints read-only, never expose raw conversation turns (only the confirmed Request/brief), audit-log every list query and drill-in with admin id and viewed `ownerId`, and review audit logs periodically | Security reviewer / dev team |

## 17. Open Questions

| Question | Why it matters | Owner | Needed by |
|----------|----------------|-------|-----------|
| Which Hosted Agent protocol should the advisor expose: Responses or Invocations? | Responses fits normal conversation; Invocations may be needed if the Copilot SDK service needs a protocol bridge or custom payload control | Dev team / architect | Before implementation |
| Which Copilot SDK language and model path should be used? | TypeScript/Node.js with Azure BYOM is the recommended assumption, but the team must confirm SDK language and whether any GitHub token exception is needed | Dev team / architect | Before implementation |
| What business-user client/channel will front the Hosted Agent endpoint? | Hosted Agent is the runtime; users still need a usable intake surface such as a web shell, Teams/M365 channel, or embedded docs-site entry point | Product owner / dev team | Before prototype |
| What schema should Project briefs use in Azure AI Search? | Similarity quality depends on consistent fields, tags, and summaries | Dev team / architect | Before implementation |
| What are the exact submitter/operator RBAC roles? | Authorization needs named groups or application roles | Platform operator | Before test deployment |
| What data retention and user-driven deletion policy applies to Conversations/Sessions, project ideas, and readiness briefs in Cosmos DB? | Sessions can contain confidential information and users may request deletion of their own data | Product owner / security | Before production |
| How will downstream reviewers consume `status: New` Requests from Cosmos DB — direct query, Change Feed processor, or a thin API? | Affects downstream service design and Cosmos DB throughput planning | Dev team / architect | Before production |
| What admin UI surface ships in MVP — embedded admin page in the advisor client, a separate minimal admin app, or API-only with a documented Postman/CLI flow? **The admin Requests/Projects browse screens will live in whichever surface is chosen.** | Affects effort and admin usability | Product owner / dev team | Before implementation |
| Should the admin Requests browse screen ever surface conversation turns from `sessions`, or only the confirmed Request/brief? | Conversation turns may contain confidential exploratory content the user did not intend to share organisation-wide; restricting to the confirmed Request preserves user trust | Product owner / security | Before implementation |
| Should the Organisation Context support multiple named profiles (e.g. per business unit) or only one published profile in MVP? | Multi-profile adds tagging on Requests and admin selection UI; single profile is simpler | Product owner / architect | Before implementation |
| What is the canonical list of Microsoft AI products the entitlement matrix should enumerate? | Drives the structured schema for `entitlements[]` and the matching used during Phase 2 filtering | Architect / dev team | Before implementation |
| Should production remain public or move to hybrid/private networking? | Sensitive workloads may require private data plane or private ingress | Platform operator / security | Before production |

## 18. Decision Log

| Date | Decision | Rationale | Source |
|------|----------|-----------|--------|
| 2026-05-26 | Primary user is the business idea submitter | User clarified the submitter should be a business user, with the dev team receiving structured intake | User input |
| 2026-05-26 | Build the advisor with GitHub Copilot SDK (public preview) | User specified Copilot SDK as the agent implementation approach | User input; [GitHub Copilot SDK](https://github.com/github/copilot-sdk) |
| 2026-05-26 | Host the advisor as a Microsoft Foundry Hosted Agent (Preview) | User specified Hosted Agent as the hosting target; Hosted Agent supports custom containerized agent code with managed runtime/lifecycle | User input; [Hosted agents overview](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents) |
| 2026-05-26 | Advisor adds Step 1b Reuse Gate after BXT Phase 1 | User wanted the agent to check similar projects and present them before continuing technology selection | User input |
| 2026-05-26 | Backend separates Request and Project concepts | User wanted conversation responses captured to a Request and similar/existing initiatives represented as Projects | User input |
| 2026-05-26 | Output is a project readiness brief | The brief gives engineers matches, questions, scoring, recommendation, risks, and next actions | User selection |
| 2026-05-26 | Use Azure AI Search for existing-project similarity | User accepted Search-backed similarity for Step 1b Reuse Gate | User selection |
| 2026-05-26 | Use Azure Cosmos DB (NoSQL API) as the single durable store for Conversations/Sessions, Requests, and Projects | User specified Cosmos DB for conversation storage; consolidating Requests and Projects into the same Cosmos DB account avoids a second durable store and simplifies RBAC | User input; [Cosmos DB NoSQL overview](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/) |
| 2026-05-26 | Drop Azure Storage Queue from the architecture | User stated the queue is no longer needed; confirmed Requests already live in Cosmos DB and downstream consumers can use direct queries or the Cosmos DB Change Feed | User input |
| 2026-05-26 | Confirmed Requests transition to `status: New` in Cosmos DB instead of being enqueued | Eliminates dual writes between Cosmos DB and a queue while preserving the workflow handoff semantics | User input |
| 2026-05-26 | Add per-user Conversation/Session management with strict isolation | User asked for multi-session support per user with no cross-user visibility | User input |
| 2026-05-26 | Use Entra `oid` as the `ownerId` and Cosmos DB partition key for sessions/requests when Entra is enabled | User specified Entra object/user id as the conversation key; partition-keyed reads also give the fastest per-user access pattern and structural isolation | User input; [Microsoft Entra ID token claims (oid)](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference) |
| 2026-05-26 | Add an admin backend gated by an `AdvisorAdmin` Entra app role for managing Organisation Context (system inventory, license/entitlement boundaries, custom decision instructions) | User asked for an admin-only surface to inject organisation-specific context that recommendations must consider | User input; [Entra app roles](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps) |
| 2026-05-26 | Add read-only admin browse screens for Requests and Projects to the admin backend, with cross-partition Cosmos DB reads gated by the `AdvisorAdmin` role and every list query / drill-in audit-logged | User asked for an admin surface to view the list of Requests and Projects; read-only design protects user-owned data and the "you only see your own sessions" promise while giving admins the visibility they need to refine custom instructions and audit recommendations | User input |
| 2026-05-26 | Treat `unavailable` entitlements as hard filters in Phase 2 and custom decision instructions as soft preferences in Phase 3, with explicit per-instruction alignment notes in the brief | Licensing/contractual gaps are real blockers; stylistic preferences are guidance the agent should honour when feasible but can be overridden with a reason. Transparency is preferred to silent compliance or silent deviation. | User input |
| 2026-05-26 | Version the Organisation Context and stamp `orgContextVersion` on every Request | Makes recommendations reproducible and auditable as policy evolves | User input |
| 2026-05-26 | Entra sign-in by default with demo flag | Balances enterprise auth with demo friction | User input |
| 2026-05-26 | Hosted agent identity / managed identity for service-to-service access | Avoids service secrets and aligns with Azure identity guidance; GitHub token, if required, is a Key Vault-backed exception. For Cosmos DB this means data-plane RBAC and disabling local auth where feasible. | User input; [Passwordless connections for Azure services](https://learn.microsoft.com/azure/developer/intro/passwordless-overview), [Cosmos DB RBAC](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/security/how-to-grant-data-plane-role-based-access), [Azure AI Search RBAC](https://learn.microsoft.com/en-us/azure/search/search-security-rbac) |
| 2026-05-26 | Public networking for MVP/demo | User selected public posture for low-risk/demo workloads | User selection |
| 2026-05-26 | All agent/code/Bicep/AZD assets live under `advisor-agent` | Keeps the feature isolated from the current docs site | User input |
| 2026-05-26 | Bicep and AZD are required | Skill delivery default and Azure deployment posture | [Bicep overview](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview), [Azure Developer CLI overview](https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/overview) |

## 19. Dev Handoff Checklist

- [ ] User outcome is clear.
- [ ] Scope and non-goals are explicit.
- [ ] Acceptance criteria are testable.
- [ ] Data sources, actions, and integrations are documented.
- [ ] Copilot SDK implementation approach is documented.
- [ ] Hosted Agent runtime/protocol decision is documented.
- [ ] Bicep requirements are documented.
- [ ] AZD deployability is documented.
- [ ] Managed identity is the default or exceptions are justified.
- [ ] Networking posture is selected and documented.
- [ ] Documentation deliverables are listed.
- [ ] Open questions have owners.
