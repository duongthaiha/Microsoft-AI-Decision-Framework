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

The advisor is a **GitHub Copilot SDK-based agent** (public preview) hosted as a **Microsoft Foundry Agent Service Hosted Agent** (Preview). It follows the Microsoft AI Decision Framework, captures each answer against a durable **Request**, then adds an agent-specific **Step 1b: the Reuse Gate**. After the BXT impact assessment, it searches existing **Projects**, presents similar work to the user, and asks whether the idea should be linked to an existing project or continue as a new project candidate. If the advisor has no further questions, it asks the user to confirm submission. On confirmation, the Request is persisted, linked to the selected Project when applicable, and placed on an Azure Storage Queue with `New` status for downstream handling.

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
| Business user / idea submitter | Submit and sharpen an AI project idea without needing to know the Microsoft AI product landscape | Ideas start as business pain, opportunity, or "can AI help?" questions, but lack enough structure for delivery teams | User receives a plain-language readiness brief with recommended Microsoft platform, rationale, complexity estimate, and similar-project data when available, then can submit a `New` request |
| Dev team / intake reviewer | Receive a structured, framework-aligned request instead of a vague idea | Intake work is slow when business context, data boundaries, and expected outcomes are missing | Queue message and brief contain enough context to triage, size, and route the request |
| Tech lead / architect | Review whether the idea fits the Microsoft AI Decision Framework | Manual triage is inconsistent and easy to bias toward fashionable tools | Brief shows framework scoring, similar projects, risks, and recommended approach |
| Platform operator | Operate the hosted advisor and queue-backed intake workflow | Auth, secrets, telemetry, and deployment drift can become invisible | Hosted Agent is AZD-deployable, observable, and uses hosted agent identity / managed identity for service access |


## 3. Scope

### In scope

- Advisor intake form for business users submitting new AI project ideas.
- GitHub Copilot SDK (public preview) implementation for the advisor's conversational reasoning, tool calls, framework flow, and readiness brief generation.
- Microsoft Foundry Agent Service Hosted Agent (Preview) as the hosting runtime for the advisor container.
- Step 1b Reuse Gate after BXT Phase 1 to search existing Projects and present similar work.
- Existing-Project similarity search using Azure AI Search.
- Framework-guided clarification questions.
- Durable Request capture during the conversation, including framework answers and user decisions.
- Durable Project concept that can have one or more Requests linked to it.
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
- Azure Storage Queue message creation with `New` status.
- Hosted Agent container, protocol adapter, and deployment assets under `advisor-agent`.
- Bicep infrastructure and Azure Developer CLI deployment assets under `advisor-agent`.
- Microsoft Entra sign-in by default, with a demo-only flag to disable user sign-in.
- Hosted agent identity / managed identity for service-to-service communication.
- Public networking posture for demo and low-risk workloads.

### Out of scope

- Queue consumer implementation beyond accepting the `New` request.
- Multi-stage workflow statuses beyond initial `New` submission.
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
- The request queue is Azure Storage Queue and acts as the workflow handoff, not the Request system of record.
- The canonical agent code, deployment assets, Bicep templates, and feature docs live under `advisor-agent`.
- The existing public docs site can link to the advisor client/channel, but secure agent execution runs through the Foundry Hosted Agent endpoint.
- If submitted Request payloads become too large for queue messages, the queue should carry a pointer to the durable Request record instead of duplicating the full readiness brief.

## 4. User Journeys

### Advisor framework flow

The public Microsoft AI Decision Framework remains the spine: **Phase 1: Business Impact Assessment**, **Phase 2: Technology Groupings**, and **Phase 3: Scenario-Specific Selection**. The advisor adds one extra product-specific step:

| Step | Advisor behavior | Request data captured |
|------|------------------|-----------------------|
| Intake Filter | Capture outcome, user experience, and whether an existing tool may solve the problem | problem statement, business outcome, target users, UX hypothesis, existing-tool hypothesis |
| Phase 1: BXT | Score viability, desirability, and feasibility | BXT answers, score rationale, blockers, confidence |
| **Step 1b: Reuse Gate** | Search similar Projects, present matches, and ask whether to link this Request to an existing Project or continue as a new project candidate | match list, selected Project ID when chosen, user decision, reuse/extension rationale |
| Phase 2: Technology Groupings | Ask the nine framework questions only as needed | framework answers by question, assumptions, skipped questions with reason |
| Phase 3: Scenario-Specific Selection | Produce the recommended approach and readiness brief | recommended Microsoft platform, rationale, estimated complexity, alternatives, risks, next actions |
| Submission | Ask for confirmation and enqueue the Request | final status, queue message ID, submitted timestamp |

Step 1b is not a replacement for the framework. It is the **reuse checkpoint** that prevents the advisor from recommending a new build when the organization already has a nearby Project on the shelf.

### Happy path

1. Business user opens the AI Project Advisor Agent through the selected client/channel backed by the Hosted Agent endpoint.
2. User signs in with Microsoft Entra unless demo mode is explicitly enabled.
3. User completes the business-friendly intake form with project name, business outcome, affected users, desired behavior, data sources, actions, urgency, and constraints.
4. Advisor creates or updates a draft Request and captures each framework answer as structured Request data.
5. Advisor applies Phase 1 BXT: viability, desirability, and feasibility.
6. Advisor runs Step 1b: searches the existing-Project index for similar work and presents matches.
7. User chooses to link the Request to an existing Project or continue as a new project candidate.
8. Advisor continues the Microsoft AI Decision Framework: outcomes before behaviors, behaviors before platforms.
9. If key context is missing, advisor asks concise clarification questions and stores each answer against the Request.
10. When enough context exists, advisor returns a project readiness brief with recommended Microsoft platform, rationale, estimated complexity, and similar-project current data when available.
11. Advisor asks the user to confirm submission.
12. On confirmation, the advisor agent persists the Request, preserves any Project link, and writes a message to Azure Storage Queue with `New` status.
13. User receives a submission confirmation with request ID and the readiness brief summary.

### Edge cases

| Scenario | Expected behavior | Owner |
|----------|-------------------|-------|
| Similar project found with high confidence | Show the match, present current project data (name, owner, status, technologies, summary), explain why it is similar, and recommend reuse, extension, or differentiation before submission | Advisor agent |
| User chooses an existing Project | Link the Request to that Project in the data store and include the Project ID in the submitted Request/queue payload | Advisor agent |
| User rejects all similar Projects | Keep the match list and rejection rationale on the Request, then continue as a new project candidate | Advisor agent |
| No similar project found | Say no close match was found and proceed with framework-guided evaluation | Advisor agent |
| Intake lacks outcome, user, or behavior | Ask clarification questions before recommending a technology | Advisor agent |
| User cancels confirmation | Do not enqueue a request; keep the readiness brief visible for editing | Advisor client/agent |
| Demo mode enabled | Skip user sign-in only; still use hosted agent identity / managed identity for Azure service access | Advisor client/agent / platform operator |
| Queue write fails | Surface a clear submission error and do not claim the request was submitted | Advisor agent |
| Azure AI Search unavailable | Degrade to framework-only triage, label similarity search as unavailable, and prevent any false "no match" claim | Advisor agent |
| Hosted Agent protocol mismatch | Fail deployment validation or startup health checks rather than silently exposing an unusable agent endpoint | Dev team / platform operator |

## 5. Functional Requirements

| ID | Requirement | Priority | Acceptance signal |
|----|-------------|----------|-------------------|
| FR-001 | Provide a polished intake form for business-user project idea submissions | Must | User can enter the minimum intake fields and start advisor analysis |
| FR-002 | Implement the advisor reasoning and tool orchestration with GitHub Copilot SDK (public preview) | Must | `advisor-agent` includes a Copilot SDK service using supported SDK session/tool patterns rather than a hand-rolled planner |
| FR-003 | Host the advisor runtime as a Microsoft Foundry Agent Service Hosted Agent (Preview) | Must | Deployment produces a hosted agent endpoint backed by the advisor container |
| FR-004 | Expose a Hosted Agent-compatible protocol endpoint | Must | The container passes Hosted Agent health/protocol validation for Responses or Invocations |
| FR-005 | Search existing Project briefs for similar work as Step 1b after Phase 1 BXT | Must | Readiness brief includes ranked similar-Project matches or an explicit unavailable/no-match state |
| FR-006 | Present similar Projects and let the user link the Request to an existing Project or continue as a new project candidate | Must | Request stores the user's reuse decision and selected Project ID when applicable |
| FR-007 | Persist a Request record throughout the conversation | Must | Request captures intake fields, framework answers, clarification responses, match decisions, status, and timestamps |
| FR-008 | Maintain a Project concept separate from Request | Must | A Project can have multiple linked Requests; a Request can be unlinked until promoted or attached |
| FR-009 | Apply the Microsoft AI Decision Framework before recommending technology | Must | Brief evaluates outcome, user, behavior, data, actions, governance, scale, skills, and deployment posture |
| FR-010 | Ask clarification questions when required fields or decision signals are missing | Must | Advisor asks questions before recommendation when outcome/user/behavior/data/risk are incomplete |
| FR-011 | Produce a project readiness brief | Must | Brief includes recommended Microsoft platform, rationale, estimated complexity, matches with current project data when available, Project link/new-candidate state, questions, scoring, risks, and next actions |
| FR-012 | Require user confirmation before request submission | Must | Queue message is not created until the user confirms |
| FR-013 | Submit confirmed request to Azure Storage Queue with `New` status | Must | Queue message contains request ID, timestamp, status, Project link when applicable, readiness brief reference or payload, and submitter identity when available |
| FR-014 | Use Microsoft Entra sign-in by default | Must | Non-demo environments require authenticated users |
| FR-015 | Provide a demo flag to disable user sign-in | Should | Demo environment can run without Entra user sign-in while production cannot silently disable auth |
| FR-016 | Use managed identity or hosted agent identity for Azure AI Search, Request/Project store, and Storage Queue access | Must | No service keys or connection strings are required for agent-to-Azure service calls |
| FR-017 | Place all advisor implementation and deployment assets under `advisor-agent` | Must | Code review shows agent code, Bicep, AZD files, container assets, and feature docs under `advisor-agent` |

## 6. Acceptance Criteria

- [ ] A business user can open the advisor, complete the intake form, and request analysis.
- [ ] The advisor agent is implemented with GitHub Copilot SDK (public preview).
- [ ] The advisor runtime deploys as a Microsoft Foundry Hosted Agent (Preview), not an App Service-hosted API.
- [ ] The hosted agent container exposes the required Responses or Invocations protocol endpoint and passes health validation.
- [ ] The advisor captures each intake/framework answer against a Request.
- [ ] The advisor runs Step 1b after Phase 1 BXT and returns similar existing Projects from Azure AI Search or clearly states that similarity search is unavailable/no close match was found.
- [ ] The user can link the Request to an existing Project or continue as a new project candidate.
- [ ] The advisor asks clarification questions before producing a recommendation when required context is missing.
- [ ] The readiness brief includes recommended Microsoft platform, rationale, estimated complexity, framework scoring, risks, and next engineering actions.
- [ ] When a similar project exists, the brief presents the current project data (at minimum: project name, owner, status, technologies, and summary).
- [ ] The advisor asks for explicit confirmation before enqueueing the request.
- [ ] A confirmed Request creates an Azure Storage Queue message with `New` status and includes the Project link when applicable.
- [ ] Microsoft Entra sign-in is enabled by default and can only be disabled through an explicit demo flag.
- [ ] Agent-to-search, agent-to-store, and agent-to-queue calls use managed identity or hosted agent identity with Azure RBAC.
- [ ] `advisor-agent` contains the agent code, protocol adapter, container assets, Bicep infrastructure, `azure.yaml`, setup docs, and operational notes.
- [ ] Public networking posture is documented, including what must change before production use with sensitive data.

## 7. Data, Actions, and Integrations

### Data sources

| Source | Data used | Access pattern | Sensitivity | Notes |
|--------|-----------|----------------|-------------|-------|
| Advisor intake surface | Project name, outcome, users, behavior, data sources, actions, constraints, urgency | User-submitted through selected client/channel backed by the Hosted Agent endpoint | Potentially confidential project data | Validate required fields before analysis |
| GitHub Copilot SDK (public preview) | Conversation/session state, tool calls, model responses, generated readiness brief text | Agent runtime library inside hosted container | Depends on prompt and tool payloads | Use approved SDK patterns; avoid logging raw confidential prompts unless explicitly allowed |
| Microsoft Foundry Hosted Agent runtime (Preview) | Agent endpoint, container lifecycle, session state, hosted identity, telemetry | Hosting/runtime platform | Internal service metadata plus submitted idea content | Runtime target for the advisor container |
| Request store | Intake fields, conversation turns, framework answers, match decisions, readiness brief metadata, status, submitter identity | Create/update during conversation; read for submission and operations | Potentially confidential project data | System of record for user-submitted ideas |
| Project store | Existing Project summaries, owners, outcomes, technologies, statuses, lessons learned, linked Request IDs | Read for similarity indexing; update when linking a Request | Internal project metadata | System of record for durable initiatives |
| Azure AI Search Project index | Existing Project briefs, tags, outcomes, technologies, statuses, owners, lessons learned | Query during conversation | Internal project metadata | Search index derived from Project store; use Microsoft Entra/RBAC where configured |
| Microsoft AI Decision Framework docs | Capability model, decision framework, evaluation criteria, technology guidance | Read/reference in advisor logic | Public repo content | Keep recommendations aligned to project Constitution: outcomes -> behaviors -> platforms |
| Azure Storage Queue | Confirmed request message with `New` status | Write after user confirmation | Internal workflow data | Queue is the workflow handoff, not long-term analytics storage |

### Backend model

| Concept | Purpose | Minimum fields | Lifecycle notes |
|---------|---------|----------------|-----------------|
| Request | The conversational intake artifact for one business user's idea | `requestId`, `submitterId`, `title`, `businessOutcome`, `targetUsers`, `desiredBehavior`, `dataSources`, `actions`, `constraints`, `frameworkAnswers`, `similarProjectMatches`, `reuseDecision`, `linkedProjectId`, `readinessBriefRef`, `status`, timestamps | Starts as `Draft`, moves through advisor clarification, becomes `ReadyForConfirmation`, then `New` after confirmed submission. `linkedProjectId` can be empty for new project candidates. |
| Project | A durable existing or accepted AI initiative | `projectId`, `name`, `summary`, `owner`, `businessOutcomes`, `userGroups`, `technologies`, `dataDomains`, `status`, `lessonsLearned`, `linkedRequestIds`, timestamps | Used for Step 1b matching. A Project can accumulate many linked Requests when users decide their idea belongs with existing work. |

When a user says "add my ask to this current project," the advisor records that as a Request-to-Project relationship, not as a silent Project merge. The Request keeps its own answers and rationale, while the Project gains a linked Request reference for reviewers.

### Actions and side effects

| Action | Trigger | Approval needed? | Rollback or compensation |
|--------|---------|------------------|--------------------------|
| Start Copilot SDK session | User starts or resumes advisor conversation | No | End session and keep current Request draft |
| Create or update Request | User starts intake or answers a framework question | No | User can edit or withdraw before confirmation |
| Similar-Project search | Phase 1 BXT completes | No | Retry or mark similarity search unavailable |
| Link Request to Project | User chooses an existing Project in Step 1b | Yes, explicit reuse/link decision | User can change selection before final confirmation; retain prior match history |
| Continue as new project candidate | User rejects or skips similar Projects | Yes, explicit continue decision | User can return to Step 1b before final confirmation |
| Clarification question | Missing decision signal | No | User can answer, edit intake, or stop |
| Generate readiness brief | Sufficient context exists | No | User can revise intake and regenerate |
| Enqueue Request with `New` status | User confirms submission | Yes, explicit submit confirmation | If enqueue fails, show error and do not claim submission |

### Integrations

| System | Direction | Protocol/API | Auth model | Notes |
|--------|-----------|--------------|------------|-------|
| Microsoft Entra ID | User -> advisor client/channel | Client/channel authentication | Entra sign-in by default | Demo flag may disable user sign-in outside production |
| GitHub Copilot SDK (public preview) | Agent container -> model/provider | SDK session API | Azure BYOM bearer token through managed identity preferred; GitHub token only as documented exception | Implements agent reasoning, tools, and framework-guided conversation |
| Microsoft Foundry Agent Service Hosted Agent (Preview) | User/client -> agent runtime | Responses or Invocations protocol | Microsoft Entra / hosted agent identity | Hosts advisor container and exposes agent endpoint |
| Durable Request/Project store | Agent -> store | Azure SDK or REST, depending on selected store | Managed identity / hosted agent identity + Azure RBAC | System of record for Requests, Projects, and Request-to-Project links |
| Azure AI Search | Agent -> Search | Azure SDK or REST | Managed identity / hosted agent identity + Azure RBAC | Similarity index for existing Project briefs |
| Azure Storage Queue | Agent -> Storage | Azure SDK or REST | Managed identity / hosted agent identity + Azure RBAC | Confirmed Requests enter queue with `New` status |
| Application Insights / Azure Monitor | Agent -> telemetry | SDK / platform telemetry | Managed identity or platform configuration where supported | Logs, metrics, traces, dashboards, alerts |
| Existing docs site | User -> advisor | Link/navigation | Public docs link to the selected advisor client/channel | Docs site remains Jekyll/GitHub Pages |

## 8. Architecture Overview

The MVP is a hosted-agent intake system under `advisor-agent`:

- **GitHub Copilot SDK advisor service (public preview)**: Owns the agent system prompt, framework flow, tools, Step 1b Reuse Gate, readiness brief generation, and Request state transitions.
- **Hosted Agent protocol adapter**: Exposes Responses or Invocations for Microsoft Foundry Agent Service. Think of this as the translator between "Foundry knows how to host agents" and "Copilot SDK knows how to run this advisor's reasoning loop."
- **Microsoft Foundry Agent Service Hosted Agent (Preview)**: Hosts the advisor container, endpoint, sessions, lifecycle, scaling, and hosted agent identity.
- **Azure Container Registry**: Stores the advisor container image consumed by the Hosted Agent deployment.
- **Durable Request/Project store**: Holds Requests, Projects, framework answers, reuse decisions, and Request-to-Project relationships.
- **Azure AI Search**: Indexes Project briefs for similarity matching.
- **Azure Storage Queue**: Receives confirmed Requests with `New` status.
- **Hosted agent identity / managed identity**: Used by the agent when calling the Request/Project store, Azure AI Search, and Storage Queue.
- **Microsoft Entra sign-in**: Default user authentication model, with a tightly scoped demo flag to disable user sign-in in demo environments only.
- **Bicep + AZD**: Provision and deploy the full advisor agent from the `advisor-agent` folder.

Think of the advisor as **the intake desk plus the librarian**. The intake desk collects the project idea cleanly as a Request. The librarian checks the Project shelves for similar work. If the user points to an existing shelf, the advisor pins the Request there; otherwise, the architect applies the framework before anything enters the delivery queue.

### Key design decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| Target business idea submitters first | The advisor exists to translate early business ideas into engineering-ready intake before build work starts | Dev-team-only intake tool |
| Build the advisor with GitHub Copilot SDK (public preview) | The advisor needs programmable agent behavior, tool calls, and framework-guided conversation rather than static prompt-only configuration | Hand-rolled orchestration, prompt-only agent |
| Host as a Microsoft Foundry Hosted Agent (Preview) | Hosted Agent keeps custom agent code while letting Foundry manage runtime, endpoint, scaling, sessions, and lifecycle | Azure App Service web/API, Azure Container Apps self-hosting |
| Separate Request from Project | Requests are conversational intake records; Projects are durable initiatives that may collect many related Requests | Single flat submission table |
| Add Step 1b Reuse Gate after BXT | The official framework moves from BXT to technology grouping; the advisor needs one extra reuse checkpoint before recommending another build | Search only at the end of the brief, no reuse decision |
| Use Azure AI Search for existing-project similarity | Similarity matching needs searchable project summaries rather than a simple queue lookup | Table-only store, SQL-only store |
| Use Azure Storage Queue for confirmed `New` submissions | Queue cleanly separates intake from downstream processing | Direct backlog creation, email notification |
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
  - Durable Request/Project data store, with exact Azure service selected before implementation
  - Azure AI Search service
  - Azure Storage account
  - Azure Storage Queue for project submissions
  - Azure Key Vault only if a GitHub token or other non-Azure secret is required by the selected Copilot SDK model path
  - Application Insights / Log Analytics
  - Role assignments for hosted agent identity / managed identity access to the Request/Project store, Search, Queue, Container Registry, and Key Vault when used
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

- Use the Hosted Agent identity or managed identity for service-to-service calls from the advisor agent to the Request/Project store, Azure AI Search, Azure Storage Queue, Azure Container Registry pull, and Key Vault when used.
- Prefer the platform-provided hosted agent identity for MVP unless the dev team needs identity reuse across multiple agent versions or services.
- For Azure BYOM/Foundry model access through Copilot SDK, use `ManagedIdentityCredential` in production to obtain a bearer token. Use `DefaultAzureCredential` only for local development.
- Avoid application secrets, Search admin keys, Storage connection strings, and model provider keys in local config, CI variables, or app settings.
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
| Egress | Advisor Hosted Agent can call the Request/Project store, Azure AI Search, Azure Storage Queue, Azure Container Registry, optional Key Vault, and telemetry endpoints | Use hosted agent identity / managed identity and Azure RBAC rather than service keys |
| Private endpoints | Not required for MVP | Add as production hardening if sensitive project data or enterprise policy requires private data plane; verify Hosted Agent private networking support before promising it |
| VNet integration | Not required for MVP | Leave Bicep/AZD structure extensible for later private networking where supported by Hosted Agent |
| DNS | Public DNS is acceptable for MVP | Private DNS zones are out of scope until private endpoints are introduced |
| Firewall or NSG rules | Use least-privilege Azure RBAC and disable shared-key style access where feasible | Any storage/search network restrictions must be tested from the Hosted Agent runtime before production |
| Local development | Developers authenticate with Azure developer credentials for service access; demo mode may bypass user sign-in locally | Local settings must not contain Search keys, Storage connection strings, or model provider keys |

### Networking open questions

- Should production later move from public to hybrid or private networking if project ideas include confidential customer, financial, or regulated data?

## 11. Security and Governance

| Concern | Requirement | Owner |
|---------|-------------|-------|
| Authentication | Microsoft Entra sign-in by default; explicit demo flag may disable user sign-in outside production | Dev team / platform operator |
| Authorization | Role-based access for submitters and operators; admin/operator functions separated from normal submission | Dev team |
| Secrets | Managed identity / hosted agent identity first; document any exception; GitHub token, if required by the chosen Copilot SDK model path, must live in Key Vault | Platform operator |
| Data retention | Define retention for intake payloads, readiness briefs, and queue messages before production | Product owner / platform operator |
| Audit logging | Log Request creation/update, Step 1b match decisions, Project links, confirmation events, queue submissions, errors, and admin/config changes | Dev team |
| Compliance constraints | Treat project ideas as internal confidential unless classified otherwise | Product owner |
| Demo mode | Must be visibly enabled, disabled in production, and unable to disable hosted agent identity / managed identity service access | Dev team |
| Responsible AI | Recommendations must be grounded in the framework and label uncertainty, assumptions, and missing information | Architect / dev team |
| Hosted Agent preview status | Hosted Agent-specific behavior must be validated against current Microsoft Learn docs before production commitment | Architect / dev team |

## 12. Observability and Operations

| Signal | Requirement | Alert or dashboard |
|--------|-------------|--------------------|
| Logs | Structured logs for Copilot SDK session start/end, Request created/updated, Step 1b search executed, Project link selected/rejected, clarification asked, brief generated, confirmation requested, queue submitted, and errors | Hosted Agent / agent log query dashboard |
| Metrics | Request count, Project link rate, brief generation latency, Copilot SDK/model latency, Search query latency, queue submission success/failure, clarification rate, no-match rate | Advisor health dashboard |
| Traces | End-to-end trace from intake request through Copilot SDK session, Request persistence, Search lookup, Project link decision, and Queue submission | Distributed tracing view |
| Availability | Hosted Agent health/protocol checks plus dependency checks for Request/Project store, Search, and Queue | Alert on failed health checks |
| Cost | Track Foundry Hosted Agent, model usage, Search, Storage, Container Registry, optional Key Vault, and telemetry cost | Monthly cost dashboard/budget alert |

### Runbook requirements

- How to deploy with `azd up`.
- How to build/publish the advisor container and deploy a Hosted Agent version.
- How to validate the Hosted Agent endpoint, protocol adapter, and health checks.
- How to rotate or remove any approved secret exception.
- How to validate managed identity role assignments.
- How to inspect Request records and Request-to-Project links without exposing confidential content.
- How to verify Search index availability and document count.
- How to inspect queue depth and failed submissions.
- How to disable demo mode before production.
- How to triage "similarity search unavailable" vs. "no similar project found."

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
- [ ] Data contract for Project briefs indexed in Azure AI Search.
- [ ] Queue message contract for submitted Requests.
- [ ] Demo mode safety note.

## 14. Testing Strategy

| Test type | Coverage needed | Owner |
|-----------|-----------------|-------|
| Unit | Copilot SDK tool handlers, intake validation, Request state transitions, Step 1b match decision rules, framework scoring, clarification trigger rules, queue payload creation | Dev team |
| Integration | Hosted Agent protocol endpoint, Copilot SDK session flow, Request/Project store create/update/link, Azure AI Search query, Storage Queue enqueue, managed identity auth in deployed environment | Dev team |
| End-to-end | User completes intake through the selected client/channel, sees similar Projects, links or rejects a Project, receives brief, confirms, and sees Request ID after queue submission | Dev team |
| Security | Entra auth default, demo flag restrictions, RBAC role boundaries, hosted agent identity access, no service keys in config | Dev team / security reviewer |
| Deployment smoke | `azd up` provisions resources, publishes the agent container, hosted agent endpoint passes health/protocol checks, Request/Project store is reachable, Search index is reachable, Queue write succeeds | Platform operator |
| Regression | Similar-Project unavailable state does not become a false "no match" recommendation; linking to a Project does not create a duplicate Project; protocol adapter changes do not break Copilot SDK session behavior | Dev team |

## 15. Rollout and Migration

| Phase | Entry criteria | Exit criteria | Rollback |
|-------|----------------|---------------|----------|
| Prototype | `advisor-agent` scaffold exists; Copilot SDK session works locally; protocol adapter can return a readiness brief with stubbed data | Dev team can run local demo and review brief shape | Remove prototype agent route/container without touching docs site |
| Pilot | Azure resources deploy through AZD; hosted agent endpoint is reachable; Request/Project store has sample Projects; Search index has sample Projects; Queue receives `New` Requests | Pilot business users submit real low-risk project ideas, link to existing Projects when relevant, and operators can monitor Hosted Agent/store/queue | Disable client/channel access or hosted agent endpoint; preserve Request records and queue messages for audit |
| Production | Auth enabled, demo flag disabled, RBAC reviewed, Hosted Agent docs/status validated, runbook complete, cost alerts enabled, Project ingestion/update process defined | Business users use advisor as the intake front door for AI project Requests | Pause intake, disable hosted agent endpoint/version, drain or archive queue according to runbook |

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
| Queue payload diverges from Request store | Downstream reviewers may see stale or incomplete context | Treat durable Request as source of truth and put Request ID plus key routing fields in the queue message | Dev team |
| Recommendation overclaims Microsoft product capability | Bad architecture decisions | Follow repository Constitution: verify technical claims against Microsoft docs; label assumptions and preview status | Dev team |
| Managed identity role assignments incomplete | Store, Search, or Queue operations fail | Include deployment smoke tests and runbook steps for RBAC validation | Platform operator |

## 17. Open Questions

| Question | Why it matters | Owner | Needed by |
|----------|----------------|-------|-----------|
| Which Hosted Agent protocol should the advisor expose: Responses or Invocations? | Responses fits normal conversation; Invocations may be needed if the Copilot SDK service needs a protocol bridge or custom payload control | Dev team / architect | Before implementation |
| Which Copilot SDK language and model path should be used? | TypeScript/Node.js with Azure BYOM is the recommended assumption, but the team must confirm SDK language and whether any GitHub token exception is needed | Dev team / architect | Before implementation |
| What business-user client/channel will front the Hosted Agent endpoint? | Hosted Agent is the runtime; users still need a usable intake surface such as a web shell, Teams/M365 channel, or embedded docs-site entry point | Product owner / dev team | Before prototype |
| Which Azure data service should implement the Request/Project store? | The Request/Project model is required, but service choice affects schema, query patterns, Bicep, cost, and RBAC | Product owner / architect / dev team | Before implementation |
| What schema should Project briefs use in Azure AI Search? | Similarity quality depends on consistent fields, tags, and summaries | Dev team / architect | Before implementation |
| What are the exact submitter/operator RBAC roles? | Authorization needs named groups or application roles | Platform operator | Before test deployment |
| What data retention policy applies to project ideas and readiness briefs? | Project ideas may contain confidential information | Product owner / security | Before production |
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
| 2026-05-26 | Use Azure AI Search for existing-project similarity | User accepted Search-backed similarity with queue submission | User selection |
| 2026-05-26 | Confirmed requests go to Azure Storage Queue with `New` status | User specified confirmation and queue submission behavior | User input |
| 2026-05-26 | Entra sign-in by default with demo flag | Balances enterprise auth with demo friction | User input |
| 2026-05-26 | Hosted agent identity / managed identity for service-to-service access | Avoids service secrets and aligns with Azure identity guidance; GitHub token, if required, is a Key Vault-backed exception | User input; [Passwordless connections for Azure services](https://learn.microsoft.com/azure/developer/intro/passwordless-overview), [Queue Microsoft Entra authorization](https://learn.microsoft.com/en-us/azure/storage/queues/authorize-access-azure-active-directory), [Azure AI Search RBAC](https://learn.microsoft.com/en-us/azure/search/search-security-rbac) |
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
