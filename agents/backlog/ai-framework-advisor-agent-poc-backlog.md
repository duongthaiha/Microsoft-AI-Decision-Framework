# AI Framework Advisor Agent POC Backlog

## Assumptions

| Assumption | Why It Matters | Validation Needed |
|---|---|---|
| POC targets customers directly as the first user group | Keeps UX, auth, onboarding, and explanation quality focused on customer self-service | Validate with first demo audience |
| The agent must follow the repo's [Three-Phase Decision Methodology](https://microsoft.github.io/Microsoft-AI-Decision-Framework/docs/decision-framework.html) | The repo becomes the source of truth for how recommendations are formed | Validate against the evaluation cases |
| The agent uses `.agents\skills\microsoft-ai-decision-framework` as the Decision Framework skill | Keeps framework behavior packaged as reusable agent skill context instead of scattered prompt text | Confirm skill loading path in Copilot SDK session configuration |
| The agent must be built headless-first and tested from a CLI before UI work depends on it | Proves agent behavior, data contracts, and Copilot SDK integration without waiting for front-end screens | CLI harness must run the sample NFU Mutual intake through the agent |
| The intake form is the UX starting point only, not a separate agent interaction | Keeps the form simple while ensuring the submitted answers become the first structured context passed into the agent conversation | Validate with `agents\backlog\sample-intake-form-nfum.json` |
| Project case data combines intake, conversation capture, framework evidence, search signals, and recommendation output | Gives Cosmos DB and Azure AI Search clear, non-conflicting data responsibilities | Validate with `agents\backlog\sample-project-data-nfum.json` |
| Similar-project lookup uses an Azure AI Search index populated with POC project knowledge | Gives the advisor a searchable source for highlighting existing similar projects | Define project schema, index fields, and seed data |
| Cosmos DB stores conversation history and session state for the advisor experience | Gives the POC durable chat continuity and reviewable recommendation context | Define session, turn, and retention schema |
| Cosmos DB stores customer-organization custom instructions | Gives the agent a durable, scoped source of customer guidance to apply before asking questions or recommending | Define instruction container, versioning, active flag, and org partitioning |
| Customer-organization context is captured in the same Cosmos DB customer guidance document as custom instructions | Gives the agent enough organizational context to propose plausible answer options when it still needs user input | Define organization context fields next to the `instructions` array and governance for who can edit them |
| Public app/API ingress is allowed for the POC while Cosmos DB, Azure AI Search, and other data services stay private | Separates customer access from data-plane exposure | Validate customer-facing ingress and auth requirements |
| Admin custom instructions are scoped per customer organization | Prevents one customer's guidance from bleeding into another customer's advice | Confirm tenant/org identifier model |
| Agent recommendations and clarifying questions must consider active per-customer-organization custom instructions and organization context before asking the user or finalizing advice | Keeps recommendations aligned to customer-specific strategy, constraints, governance, preferred platforms, and operating context while avoiding repeated questions | Validate with evaluation cases that include custom instructions and organization context |
| POC success is measured primarily by recommendation quality and rationale | Keeps validation centered on whether the advice is useful and explainable | Define evaluation cases and pass criteria |

## Resolved Clarifications

1. First POC user: customers directly.
2. Existing/current projects: stored in Azure AI Search for searchable similar-project lookup.
3. Ingress: public app/API ingress is allowed; data services remain private.
4. Admin instructions: stored in Cosmos DB and scoped per customer organization.
5. Primary success measure: recommendation quality and rationale.

## POC Goal

Build a thin, production-shaped customer-facing advisor agent by implementing the headless agent/API path first, then validating it from a CLI harness before the UI depends on it. The agent starts with a structured UX intake form, receives the submitted form payload as the opening conversation context, holds a guided conversation with conversation history stored in Cosmos DB, checks an Azure AI Search-backed POC project portfolio for similar work, loads active per-customer-organization instructions from Cosmos DB, and returns Microsoft AI framework recommendations with rationale grounded in the [Three-Phase Decision Methodology](https://microsoft.github.io/Microsoft-AI-Decision-Framework/docs/decision-framework.html). The agent should use the GitHub Copilot SDK as the runtime integration layer, load `.agents\skills\microsoft-ai-decision-framework` as its framework skill, and later add a front-end experience plus an admin UI for managing per-customer-organization instructions in Cosmos DB.

## Backlog

### Epic 1: Product Discovery and Scope

**Goal:** Define the boarding pass: what the POC proves, what it does not prove, and what "good recommendation" means.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Define POC success criteria and non-goals | Product | Success criteria include customer-facing demo scenario, recommendation quality bar, rationale quality bar, and excluded production features | Prevents "build an AI platform" scope creep |
| Define the advisor intake form model | Product | Intake captures outcome, users, workflow, data sensitivity, preferred UX, required actions, constraints, and existing Microsoft stack using `agents\backlog\sample-intake-form-nfum.json` as the sample form structure | The form is a UX artifact and should align to repo's Decision Framework |
| Define project case data structure | Product/Data | Project case structure includes intake submission, conversation capture, custom-instruction usage, Decision Framework evidence, similar-project search, recommendation output, and Azure AI Search projection using `agents\backlog\sample-project-data-nfum.json` as the sample | This is the canonical shape for what the POC stores and indexes |
| Define recommendation output contract | Product | Output includes recommended framework(s), rationale, trade-offs, confidence, assumptions, similar-project highlights, and follow-up questions | Must support combinations of frameworks |
| Define similar-project match behavior | Product/Data | Criteria describe what counts as "similar": industry, use case, data pattern, agent type, integration, governance, or technology | Avoids vague semantic search |

### Epic 2: Headless Agent, API, and CLI Validation

**Goal:** Build the agent runtime first and prove it works from the command line before front-end development depends on it.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Create headless advisor API | Engineering | API supports create session, submit intake as structured conversation context, send message, get response, retrieve recommendation, retrieve similar projects, and end session | UI must consume only API |
| Integrate GitHub Copilot SDK | Engineering | Backend creates/resumes Copilot SDK sessions, loads `.agents\skills\microsoft-ai-decision-framework`, and sends user prompts with framework context | Use explicit session IDs for resumability |
| Pass submitted intake into the agent conversation | Engineering | API creates or resumes a session, stores the intake snapshot in Cosmos DB, and submits the form payload to the Copilot SDK session before the agent asks follow-up questions | The form itself is not the agent; it seeds the agent interaction |
| Add CLI test harness for the headless agent | Engineering | CLI command can submit `agents\backlog\sample-intake-form-nfum.json`, apply sample or configured custom instructions, continue a text conversation, and print the recommendation JSON/rationale | This is the first end-to-end test path before UI |
| Add CLI regression scenario for NFU Mutual sample | Product/Engineering | CLI run exercises Phase 1, Phase 2, Phase 3, custom-instruction pre-answering, similar-project lookup, and recommendation output using the sample project data shape | Use to validate behavior after prompt or skill changes |
| Add custom tools for framework retrieval and similar-project lookup | Engineering/Data | Agent can call tools to retrieve relevant framework content and search project history | Tool results must be cited/summarized in answer |
| Add API-safe error behavior | Engineering | API returns clear error states for model failure, missing context, search failure, and invalid session | No silent fallback recommendations |

### Epic 3: Agent Behavior and Decision Framework Alignment

**Goal:** Make the advisor behave like the Decision Framework, not like a generic recommendation chatbot. The agent should move the customer through the three phases before producing advice.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Assemble framework-grounded agent instructions | Engineering/Product | Agent prompt includes the Three-Phase Decision Methodology, current intake state, per-customer-organization instructions, the Microsoft AI Decision Framework skill, and boundaries on unsupported claims | Keep organization instructions separate from source framework |
| Apply custom instruction pre-recommendation and pre-question gate | Engineering/Product | Before asking Phase 2/3 clarifying questions or producing a final recommendation, the agent retrieves active customer-organization instructions, uses them to answer any already-covered questions, asks only for missing evidence, and states how instructions influenced or constrained the recommendation | Custom instructions shape advice but must not override verified framework facts |
| Propose answer options when asking clarifying questions | Product/Engineering | When the agent asks a Phase 1, Phase 2, or Phase 3 clarifying question, it provides likely answer options generated from custom instructions, organization context, intake data, conversation history, and best-guess context; each option is clearly presented as a suggestion the user can confirm, edit, or reject | Do not turn guesses into facts; suggested answers should reduce effort, not bias the user |
| Implement Phase 1: Business Impact Assessment behavior | Product/Engineering | Agent evaluates Business viability, Experience desirability, and Technology feasibility before moving to technology grouping; missing BXT inputs become clarifying questions | Do not recommend technology if the business problem is still vague |
| Implement Phase 2: Technology Groupings behavior | Product/Engineering | Agent walks through the pre-question "do you need an agent?", approach selection, and the nine critical questions to form technology groupings; if active custom instructions already answer a question, the agent records that evidence instead of asking the user again | Groupings are evidence, not the final answer |
| Implement Phase 3: Scenario-Specific Selection behavior | Product/Engineering | Agent converts Phase 2 groupings and active custom instructions into selected framework(s), rationale, architecture pattern, trade-offs accepted, and next steps; if scenario-selection inputs are already specified in custom instructions, the agent uses them before asking follow-up questions | Must support a combination of Microsoft AI frameworks |
| Add recommendation readiness gates | Engineering/Product | Agent asks clarifying questions until minimum evidence exists for Phase 1, Phase 2, Phase 3, and active customer-organization instruction/context consideration; readiness state identifies whether each answer came from user intake, conversation, custom instructions, organization context, framework docs, or project search | "Enough info" must be deterministic enough to test |
| Add similar-project awareness behavior | Product/Data/Engineering | Agent checks Azure AI Search-backed similar projects before final recommendation and highlights relevant matches or states that no useful match was found | Similar projects inform but do not override the framework |
| Add recommendation output quality rules | Product/Engineering | Final answer separates recommendation, rationale, assumptions, decision evidence, custom-instruction influence, similar-project highlights, trade-offs, and follow-up questions | Primary POC success measure |

### Epic 4: Data and Integration

**Goal:** Connect to enough real knowledge to prove grounded recommendations and project similarity.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Index Microsoft AI Decision Framework repo content | Data/Engineering | Relevant docs are chunked, indexed, versioned, and retrievable by agent tools | Source of truth is this repo |
| Define intake submission contract | Data/Product/Engineering | Submitted form payload preserves form metadata, respondent context, section/question IDs, answers, timestamps, and validation state; sample shape is documented in `agents\backlog\sample-intake-form-nfum.json` | Input from the form becomes structured conversation context |
| Define Cosmos DB conversation history contract | Data/Engineering | Conversation record includes customer organization, user/session identifier, intake snapshot, agent turns, captured facts, custom-instruction evidence, recommendation state, timestamps, and retention metadata | Cosmos DB is the conversation/session store |
| Define project case data contract | Data/Product | Project record includes intake submission, conversation capture, Decision Framework phase evidence, similar-project search, recommendation output, feedback, and projection metadata; sample shape is documented in `agents\backlog\sample-project-data-nfum.json` | Project case record is the handoff between conversation storage and project knowledge indexing |
| Define Azure AI Search project knowledge index | Data/Product | Similar project index includes customer organization, title, summary, business outcome, industry/domain, use case tags, framework tags, technology tags, data source tags, sensitivity, status, searchable text, vector/search fields, and similar-project signals | Azure AI Search is the POC project search store |
| Implement Azure AI Search-backed similar-project search | Data/Engineering | Given a new project description, API returns ranked similar projects with match rationale from the Azure AI Search project index | Should support "no match found" honestly |
| Add per-customer-organization admin instruction and context storage | Data/Engineering | Custom instructions and organization context are persisted in the same Cosmos DB customer guidance document with customer organization scope, version, active flag, editor, timestamp, and audit metadata; `organizationContext` sits at the same level as the `instructions` array | Prevents cross-customer instruction leakage and gives the agent context for suggested answers |
| Add seed/test data | Data | POC has representative project examples and framework docs for repeatable demos | Avoid customer-sensitive data unless approved |

### Epic 5: Azure Infrastructure and Deployment

**Goal:** Make the POC repeatable, not hand-built.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Create Bicep infrastructure structure | DevOps | Repo has `infra/` folder with parameterized Bicep modules and outputs needed by app config | Bicep is source of truth |
| Add Azure Developer CLI support | DevOps | `azure.yaml` maps deployable services; `azd provision`, `azd deploy`, and `azd up` are supported | Do not store secrets in env files |
| Provision app hosting architecture | Architecture/DevOps | Hosting choice is documented and provisioned through Bicep once selected | Decision item: Container Apps/App Service/etc. |
| Provision Cosmos DB and Azure AI Search dependencies | Architecture/DevOps | Cosmos DB for conversation history, session state, and customer-organization custom instructions plus Azure AI Search for project lookup are provisioned through Bicep with private access design | Cosmos DB is not the project search store |
| Document deployment runbook | DevOps | README/runbook explains prerequisites, env values, provision, deploy, and teardown | Include POC limitations |

### Epic 6: Private Networking and Security

**Goal:** Keep enterprise security bones in the POC from day one.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Define identity and authorization model | Security/Architecture | Customer user, customer organization admin, and service identities are defined; admin endpoints require elevated role and organization scoping | Auth provider is open decision |
| Add managed identity and RBAC | DevOps/Security | App services use managed identity where supported; RBAC assignments are explicit in Bicep | Secrets only where identity is not possible |
| Add private connectivity for data-bearing services | DevOps/Architecture | Cosmos DB, Azure AI Search, and any storage services use private endpoint and private DNS where supported | App/API ingress may be public; data plane must stay private |
| Disable public data access where supported | Security/DevOps | Public network access is disabled for Cosmos DB, Azure AI Search, and selected data services unless exception is documented | No public data service as long-term POC shortcut |
| Decide developer access path | Architecture/Security | Decision recorded for local access: VPN, jumpbox, dev tunnel, cloud-only, or temporary exception | Needed for private endpoint debugging |
| Add secrets handling | Security/DevOps | Secrets live in Key Vault or managed hosting config; no secrets in source, Bicep params, or `azd` env files | Include rotation note |

### Epic 7: Observability and Validation

**Goal:** Prove the advisor works, fails visibly, and can be evaluated.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Add structured app logging | Engineering | Logs include correlation ID, session ID, request type, tool call status, and error category | Avoid logging sensitive prompts verbatim |
| Add recommendation evaluation cases | Product/Data | Test set includes representative customer use cases, custom instruction scenarios, expected Phase 1 assessment, Phase 2 groupings, Phase 3 framework combinations, and expected rationale | Primary POC success measure |
| Add deployment validation | DevOps | Post-deploy checks verify public app/API health, UI load, Cosmos DB conversation-history reachability, and Azure AI Search project-index reachability over private connectivity | Should run after `azd up` |
| Add feedback capture | Product/Engineering | User can mark recommendation useful/not useful and optionally explain why | Helps tune prompts/instructions |
| Capture known limitations | Product/Architecture | POC limitations and production gaps are documented | Avoid demo theater |

### Epic 8: Demo and Handoff

**Goal:** Make the POC reviewable by stakeholders and buildable by the next team.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Prepare demo script | Product | Demo covers customer intake, Phase 1/2/3 advisor behavior, Azure AI Search-backed similar-project lookup, Cosmos DB conversation continuity, recommendation, admin instruction change, and redeploy/config behavior | Use realistic AI use case |
| Prepare architecture handoff | Architecture | Handoff includes API boundaries, data flow, infra diagram, identity model, and open decisions | Must separate POC vs production |
| Prepare engineering backlog for next phase | Product/Engineering | Production hardening items are separated from POC completion criteria | Keep POC honest |

### Epic 9: User Experience and Workflow

**Goal:** Put a customer-friendly UX on top of the already-working headless agent.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Build intake-first front-end flow | Engineering | User can complete a structured intake form before chat starts; submitted intake is displayed for review and then sent to the headless API as the opening context for the agent conversation | Form should not feel like a tax form |
| Build advisor conversation UI | Engineering | User can ask follow-up questions, clarify answers, and receive streamed or incremental responses from the headless API | API should remain UI-agnostic |
| Design recommendation result view | Product/Engineering | UI clearly separates recommendation, rationale, assumptions, similar projects, and next steps using the same output contract proven by the CLI | Avoid wall-of-chat output |
| Build admin instruction UI | Engineering | Admin can view, edit, save, and activate per-customer-organization custom instructions persisted in Cosmos DB | Needs audit metadata even in POC |

### Epic 10: System Documentation and Architecture Diagrams

**Goal:** Write the map, not just the territory. Anyone joining the POC should be able to read how the system is shaped, follow a request from intake to recommendation, and see the moving parts without spelunking through code. Documentation is a deliverable, not an afterthought.

| Story | Owner Type | Acceptance Criteria | Notes |
|---|---|---|---|
| Document the system architecture overview | Architecture | A `docs/` page describes the end-to-end architecture: front-end intake/chat/admin UI, headless advisor API, GitHub Copilot SDK runtime, `.agents\skills\microsoft-ai-decision-framework` skill loading, Cosmos DB (conversation history, session state, customer-organization guidance), and Azure AI Search project index. Includes a component/architecture diagram (Mermaid) showing trust boundaries and public-vs-private network zones | Reuse the repo's Mermaid dark-theme convention; align with the Architecture Decisions table |
| Document how the system works (request lifecycle) | Architecture/Engineering | A narrative explains, step by step, what happens from intake submission → session create/resume → custom-instruction + organization-context load → Phase 1/2/3 reasoning → similar-project lookup → recommendation output → conversation persistence. Calls out where data is read vs written and where the Copilot SDK is invoked | Should match the behavior proven by the CLI harness in Epic 2 |
| Add intake-to-recommendation sequence diagram | Architecture/Engineering | A Mermaid `sequenceDiagram` shows the actors/participants (User/UI, Advisor API, Copilot SDK, Framework skill/tools, Cosmos DB, Azure AI Search) and the ordered messages for a full advisor turn, including custom-instruction pre-answer gate and similar-project search | Diagram must reflect the actual API contract, not an idealized flow |
| Add admin custom-instruction sequence diagram | Architecture/Engineering | A Mermaid `sequenceDiagram` shows the admin flow: view, edit, save, and activate per-customer-organization instructions in Cosmos DB, including audit metadata and org scoping | Keep tenant/org isolation visible in the diagram |
| Document the data model and contracts | Architecture/Data | Documentation describes Cosmos DB containers (partition keys, TTL, org scoping), the Azure AI Search project index schema, and references the sample intake/project-data JSON contracts as the canonical shapes | Link to `sample-intake-form-nfum.json` and `sample-project-data-nfum.json` |
| Keep documentation current as the POC evolves | Architecture/Engineering | Architecture, lifecycle, and sequence diagrams are reviewed/updated when the API contract, data model, or networking design changes; a doc-review check is part of the demo/handoff checklist | Prevents diagrams from drifting from reality; ties into Epic 8 |

## Architecture Decisions

| Decision | Recommended Default | Owner Type |
|---|---|---|
| App hosting | Azure Container Apps or App Service, selected based on runtime and networking needs | Architecture |
| Cosmos DB data model | Use Cosmos DB for conversation history, session state, and customer-organization guidance documents that contain both `organizationContext` and `instructions`; decide containers, partition keys, TTL, and tenant/org scoping | Architecture/Data |
| Azure AI Search project index | Use Azure AI Search for project knowledge lookup; decide index schema, ranking approach, vector/hybrid search, filters, and ingestion process | Architecture/Data |
| Intake form contract | Treat `agents\backlog\sample-intake-form-nfum.json` as the sample UX form definition; submitting the form starts the agent conversation but is not itself an agent turn | Product/Engineering |
| Project case contract | Treat `agents\backlog\sample-project-data-nfum.json` as the sample project data shape spanning intake, conversation capture, recommendation output, and Azure AI Search projection | Product/Data/Engineering |
| Auth model | Entra ID or Entra External ID for customer-facing users/admins, selected based on external customer access requirements | Security |
| Public ingress | Public app/API ingress is allowed for the POC; data services remain private | Security |
| Copilot SDK deployment model | Backend service uses Copilot SDK; decide CLI-per-user vs shared CLI/session isolation before multi-tenant use | Architecture |
| CLI validation path | Build a CLI harness against the same headless API/agent service before building UI workflows | Engineering/Product |
| Agent skill loading | Copilot SDK sessions load `.agents\skills\microsoft-ai-decision-framework` as the reusable Decision Framework behavior skill | Architecture/Engineering |

## Sample Data Contracts

| Artifact | Purpose | Key Fields | Store/Use |
|---|---|---|---|
| `agents\backlog\sample-intake-form-nfum.json` | Sample UX intake form shown before chat starts | Form title, audience, example respondent, sections, questions, answer types, options, helper text | Front end renders it; API receives the submitted answers and passes them into the agent as the opening structured conversation context |
| `agents\backlog\sample-project-data-nfum.json` | Sample end-to-end project case record | Customer organization, respondent, active custom instructions loaded from Cosmos DB with `organizationContext` at the same level as `instructions`, intake submission, conversation capture, Decision Framework evidence, similar-project search, recommendation output, project knowledge document, feedback | Cosmos DB stores the conversation/project case record and customer-organization guidance document; Azure AI Search indexes the `projectKnowledgeDocument` projection for later similar-project search |

The intake form is deliberately not the agent interaction. It is the boarding pass: a structured UX step that captures enough initial context to make the first agent turn useful. Before the front end is built, the CLI harness should submit this same payload to the headless API so the team can test the agent loop, custom-instruction pre-answering, suggested answer options, and recommendation output from the command line. After submission, the API should persist the intake snapshot, start or resume the Copilot SDK session, load the active customer-organization guidance document from Cosmos DB, use its `organizationContext` and `instructions`, load `.agents\skills\microsoft-ai-decision-framework`, and pass the submitted form payload into the conversation before the agent asks any Phase 1, Phase 2, or Phase 3 follow-up questions.

## Azure Guardrails

- Infrastructure must be authored in **Bicep** under `infra/`.
- Deployment must support **Azure Developer CLI** with `azure.yaml`, `azd provision`, `azd deploy`, and `azd up`.
- Prefer **managed identity** for Azure service access.
- Store secrets only in **Key Vault** or managed platform configuration.
- Cosmos DB, Azure AI Search, and other data-bearing services need **private endpoint**, **private DNS**, app-to-data private connectivity, and public network access disabled where supported.
- Public ingress is allowed only for the app/API tier; data-plane services stay private.
- Add validation proving the deployed app reaches private services from the deployed host, not only from a developer machine.
- Keep unresolved hosting, retrieval, auth, Copilot SDK isolation, and developer access choices as explicit architecture decisions.

## Definition of Done

The POC is complete when the headless agent/API can first be exercised from a CLI using `agents\backlog\sample-intake-form-nfum.json`, then a customer can submit an intake form through the UI, continue the conversation through the same headless API with history stored in Cosmos DB, move through the Decision Framework's three phases using `.agents\skills\microsoft-ai-decision-framework`, receive a grounded Microsoft AI framework recommendation with high-quality rationale that reflects active customer-organization instructions loaded from Cosmos DB, and see similar existing projects from the Azure AI Search-backed project index when available. During Phase 2 and Phase 3, the agent must use active custom instructions to answer already-covered framework questions before asking the user for more input. Customer organization admins can update scoped instructions stored in Cosmos DB, infrastructure can be provisioned and deployed with Bicep plus `azd`, public ingress is limited to the app/API tier, Cosmos DB, Azure AI Search, and other data services follow private-networking guardrails, and open production decisions are documented rather than hidden inside the demo. The POC also ships system documentation describing the architecture, how the system works end-to-end, and sequence diagrams (intake-to-recommendation and admin custom-instruction flows) that match the actual API contract and data model.
