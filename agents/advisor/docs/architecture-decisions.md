# Architecture Decisions

**AI Framework Advisor Agent POC**
_Recorded by: Trinity (Lead/Architect)_
_Date: 2026-05-29_

All decisions use format: **What / Why / Open questions**.

---

## AD-01: App Hosting — Azure Container Apps

**What:** The API tier (`@advisor/api`) is hosted on **Azure Container Apps**.

**Why:** Container Apps is a good fit for a headless API POC: it supports scale-to-zero (keeping POC costs low), integrates cleanly with managed identity for outbound data-service access, and supports private networking via VNet integration without the full orchestration overhead of AKS. It aligns with the Azure Guardrails (Bicep + azd).

**Open questions:**
- Confirm whether the Copilot SDK requires any persistent process state that would require always-on minimum replicas.
- Validate that Container Apps VNet integration supports the private-endpoint connectivity model for Cosmos DB and AI Search.

---

## AD-02: Cosmos DB Data Model

**What:** **Cosmos DB for NoSQL** is the conversation and guidance store. Three logical containers:

1. `sessions` — `AdvisorSession` documents; partition key: `customerOrganizationId/sessionId`. TTL configurable per document.
2. `guidance` — `CustomerGuidanceDocument` per organization; partition key: `customerOrganizationId`. Only one document per org has `activeFlag = true`.
3. (Optional) `feedback` — can be embedded in `sessions` or broken out.

**Why:** Cosmos DB gives durable conversation history, per-org instruction scoping, and flexible JSON schema for the evolving project case shape. Partition by `customerOrganizationId` prevents cross-org data leakage by design and aligns with the backlog guardrail.

**Open questions:**
- TTL policy: conversation-only sessions vs long-lived project case records — decide retention tiers.
- Whether `guidance` and `sessions` should be separate containers or combined under one container with a `recordType` discriminator.
- Index policy for querying active instructions by `customerOrganizationId + activeFlag`.

---

## AD-03: Azure AI Search — Project Knowledge Index

**What:** **Azure AI Search** stores `ProjectKnowledgeDocument` projections for similar-project lookup. Index name: `advisor-project-knowledge`.

**Why:** Azure AI Search's hybrid (keyword + vector) search is the right tool for "find me projects similar to this use case description." It keeps project search separate from conversation state (Cosmos DB) and allows semantic ranking over structured tags (industry, framework tags, technology tags) plus free-text (searchableText field).

**Open questions:**
- Decide vector field strategy: embed `searchableText` during ingestion vs embed at query time.
- Determine semantic configuration (semantic ranking vs pure vector vs hybrid).
- Define ingestion trigger: post-recommendation, nightly job, or manual seed for POC.
- Confirm private endpoint connectivity from Container Apps to AI Search.

---

## AD-04: Intake Form Contract

**What:** `agents\backlog\sample-intake-form-nfum.json` is the canonical sample form definition. The TypeScript contract is `IntakeForm` (template) and `IntakeSubmission` (submitted payload) in `@advisor/shared`.

**Why:** The form is a UX boarding pass, not an agent interaction. Submitting the form starts the agent conversation. The submitted `IntakeSubmission` (flat `answers` map keyed by question ID) becomes the first structured context passed into the Copilot SDK session — it is not stored as raw JSON but as a typed `IntakeSubmission` in the `AdvisorSession` document in Cosmos DB.

**Open questions:**
- Whether the front end should send the raw flat-map shape or a richer structured payload with section metadata.
- Validation strategy for required vs optional questions at submission time.

---

## AD-05: Project Case Contract

**What:** `agents\backlog\sample-project-data-nfum.json` is the canonical sample project case shape. The TypeScript contract is `ProjectCase` in `@advisor/shared`.

**Why:** The project case spans the full advisor engagement lifecycle: intake snapshot, conversation capture, decision framework evidence (all three phases), similar-project search result, recommendation output, and the Azure AI Search projection. This single canonical shape is the handoff between Cosmos DB (conversation/session store) and Azure AI Search (project search store).

**Open questions:**
- Whether `ProjectCase` should be one Cosmos DB document or split across containers by lifecycle stage.
- How to version the schema as the POC evolves (`schemaVersion` field is included for this reason).

---

## AD-06: Auth Model — Entra External ID

**What:** **Entra External ID** is the chosen provider for customer-facing users. Admin endpoints require an elevated organization-admin role claim.

**Why:** Entra External ID is Microsoft's recommended identity platform for external customer-facing applications. It supports CIAM patterns (self-service sign-up, branded login) and integrates with Entra ID for internal-admin scenarios.

**Status:** Decision made; implementation deferred to post-Wave 1. Auth middleware is an interface-shaped placeholder in the API.

**Open questions:**
- Whether the POC needs real auth at all before the first demo (consider a static API key for POC gate-keeping).
- Org-scoping model: how the `customerOrganizationId` claim is bound to a user identity.

---

## AD-07: Public Ingress — App/API Tier Only

**What:** The app (`@advisor/web`) and API (`@advisor/api`) tiers use **public ingress**. Cosmos DB, Azure AI Search, and any other data-bearing services use **private endpoints** and have public network access disabled.

**Why:** Matches the backlog guardrail and the resolved clarification ("public app/API ingress is allowed; data services remain private"). Separates customer-reachable surfaces from the data plane.

**Open questions:**
- Whether to add an API Management layer in front of the API for rate limiting and auth before the first external demo.

---

## AD-08: Copilot SDK Deployment Model

**What:** The backend service (`@advisor/api`) uses the **GitHub Copilot SDK** as the runtime integration layer. Each advisor session maps to a Copilot SDK session, identified by `copilotSdkSessionId` stored in `AdvisorSession`. The SDK is abstracted behind an `ICopilotSessionService` interface so the POC compiles and tests locally without a live Copilot SDK connection.

**Why:** Interface-first design means Tank can wire the real SDK adapter without changing the API layer. It also keeps the CLI test harness headless: the CLI calls the API, which calls the interface, which in development returns mock responses.

**Open questions:**
- CLI-per-user vs shared CLI/session isolation before multi-tenant use.
- Whether Copilot SDK session resumability (via `copilotSdkSessionId`) works across container restarts with Cosmos DB–backed session state.

---

## AD-09: CLI Validation Path

**What:** The CLI harness (`@advisor/cli`) calls the **headless API** (`@advisor/api`) over HTTP. The CLI does not import the agent logic directly; it exercises the same API path a front end or integration test would use.

**Why:** Proves end-to-end behavior (intake → conversation → recommendation) without a browser. Apoc's regression scenarios use the same CLI so that behavior changes are caught before UI development depends on stable contracts.

**Open questions:**
- Whether the CLI needs a built-in mock server mode (for offline dev) or always requires the API running locally.

---

## AD-10: Agent Skill Loading

**What:** The Copilot SDK session loads `.agents\skills\microsoft-ai-decision-framework` as the **Decision Framework behavior skill**. This skill is the source of truth for the Three-Phase Decision Methodology.

**Why:** Packaging the framework as a reusable skill (not scattered prompt text) means updates to the framework docs propagate to the advisor without prompt surgery. It keeps organization instructions (`CustomerGuidanceDocument`) separate from the source framework.

**Open questions:**
- Confirm the skill loading path in the Copilot SDK session configuration.
- Whether skill content is loaded at session creation or lazily on first tool call.
