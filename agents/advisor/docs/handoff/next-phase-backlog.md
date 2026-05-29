# Next-Phase Backlog — Production Hardening

_Last updated: 2026-05-29_

The POC is **done**. This backlog is not a list of unfinished demo chores; it is the next team's production hardening runway. The POC proved the flight path. Production needs air traffic control.

## POC completion criteria — closed

| Criterion | Status |
|---|---|
| CLI exercises NFU Mutual sample through all three phases | Done |
| UI submits intake and continues conversation through API | Done |
| Recommendation reflects active org instructions | Done |
| Similar-project lookup returns matches or explicit no-match | Done |
| Conversation/guidance abstractions swap in-memory and Azure adapters | Done |
| Bicep + azd provision/deploy path exists | Done |
| Open production decisions documented | Done |

Everything below is **net-new production work**.

## 1. Real Copilot SDK wiring

| Item | Why | Acceptance hint |
|---|---|---|
| Replace deterministic mock path with real Copilot SDK execution | `MockCopilotSessionService` proves contracts but does not run a real model. `RealCopilotSessionService` is currently guarded behind `ADVISOR_AGENT_MODE=copilot` and token checks. | With `ADVISOR_AGENT_MODE=copilot`, a session creates/resumes through the real SDK, loads `.agents\skills\microsoft-ai-decision-framework`, invokes registered tools, and passes the NFU regression without using mock responses. |
| Store Copilot token only through Key Vault | Copilot mode needs `GITHUB_TOKEN` or `COPILOT_TOKEN`; security docs require Key Vault → ACA secret reference → env var. | Bicep adds Key Vault secret reference and `secretRef` env var; no token appears in source, azd env, logs, or parameters. |
| Validate SDK session resumability | AD-08 leaves open whether `copilotSdkSessionId` survives container restarts with Cosmos-backed state. | Kill/restart Container App revision; resume a Cosmos-backed session; advisor continues without losing phase context. |
| Make tools first-class SDK tools | Similar-project and framework retrieval tools exist, but production should verify schema and tool-calling behavior under the real SDK. | Real SDK can call similar-project and framework retrieval tools; tool outputs are cited in recommendation evidence. |

## 2. Multi-tenant session isolation

| Item | Why | Acceptance hint |
|---|---|---|
| Make store APIs org-aware | `CosmosConversationStore.loadSession(sessionId)` currently performs a cross-partition query because the interface only accepts session ID. | Store methods require `customerOrganizationId`; queries use partition key; cross-partition session lookup removed from production path. |
| Bind session org to auth context | POC accepts org ID from request body/path. Production must derive it from the validated token. | `POST /sessions` ignores user-supplied org unless it matches token claim; all subsequent session reads verify session org matches token org. |
| Define tenant data retention tiers | AD-02 leaves retention tiers open. | Document and implement TTL policy for short-lived sessions, retained project cases, and feedback records. |
| Add cross-org isolation tests | The highest-risk bug is org A seeing org B's guidance or sessions. | Automated tests prove org A token cannot read/update org B guidance, sessions, recommendations, or feedback. |

## 3. Auth: Entra External ID (AD-06)

| Item | Why | Acceptance hint |
|---|---|---|
| Implement Entra External ID JWT middleware | Security docs choose Entra External ID; code is unauthenticated today. | API validates issuer/audience/signature and rejects missing/invalid JWTs on all non-health routes. |
| Wire `organizationId` claim | Org scoping must come from auth, not from body/path. | Middleware injects trusted org context; route handlers use it for sessions and guidance. |
| Implement `OrgAdmin` authorization | Admin guidance endpoints need role + org match. | `/admin/guidance/:orgId` requires `roles` contains `OrgAdmin` and token org equals `:orgId`; mismatches return 403. |
| Add internal-demo API key gate if external auth is delayed | Ghost allowed `X-Api-Key` only as interim gate for internal demos. | Optional API-key middleware can be enabled for internal demos, documented as temporary, and disabled/removed before external customer use. |

## 4. Networking and security gaps from Ghost

| Item | Why | Acceptance hint |
|---|---|---|
| Restrict CORS wildcard | `containerapp.bicep` allows `allowedOrigins: ['*']`. | Bicep accepts allowed origins param; deployed API only allows known web origins. |
| Harden ACR public access | ACR public network access is an accepted POC exception. | Production ACR uses private endpoint/IP allowlist where supported by hosting profile; admin account remains disabled. |
| Add NSG to private endpoint subnet | No NSG on `pe-subnet`; lateral movement controls are deferred. | NSG allows required traffic from ACA subnet and denies unnecessary inbound. |
| Narrow Cosmos DB RBAC scope | Managed identity currently has Cosmos Built-in Data Contributor at account scope. | Role assignment scope narrowed to database/container level needed by API. |
| Increase retention | Key Vault soft-delete is 7 days; Log Analytics retention is 30 days. | Production Bicep sets 90-day retention for Key Vault recovery and audit logs. |
| Automate secrets rotation | Future Copilot token expiry can break production silently. | Key Vault expiry event triggers rotation workflow or at least alert + runbook before expiry. |
| Add developer cloud-data access option | Portal explorers cover validation; code-level debugging needs P2S VPN if required. | Optional VPN gateway path is implemented only when team needs local code against private services. |

## 5. Azure AI Search vector/hybrid ranking

| Item | Why | Acceptance hint |
|---|---|---|
| Decide vector field strategy | AD-03 leaves embed-at-ingest vs embed-at-query open. | Index schema includes vector fields or explicitly documents why BM25/semantic is sufficient for first production release. |
| Enable semantic re-ranking on production SKU | Current adapter supports optional semantic mode; Basic SKU is POC-sized. | Standard tier semantic config is provisioned; adapter flag enabled; quality eval compares BM25 vs semantic/hybrid. |
| Add sensitivity/org filters | Project knowledge may contain customer-sensitive examples. | Search queries filter by `sensitivityLevel`, allowed org/shared portfolio, and status before returning matches. |
| Build ingestion pipeline | Seed loader is manual and safe for POC, not a production ingestion process. | New/approved project cases are projected and indexed through a repeatable job with idempotent upserts and telemetry. |
| Tune no-match threshold | Real Azure adapter returns explicit no-match below threshold; threshold needs empirical tuning. | Evaluation set proves relevant matches surface and unrelated cases return `noMatchFound`. |

## 6. Evaluation harness expansion

| Item | Why | Acceptance hint |
|---|---|---|
| Expand beyond four eval cases | Current evals cover NFU, custom instruction, forced no-match, and a pro-code advisory case. | Add representative cases for M365 Copilot extension, Copilot Studio-only, Foundry/pro-code, autonomous background agents, and specialized agents. |
| Promote advisory gaps to tracked tests | Healthcare pro-code case documents Q8 gap but accepts current deterministic output. | Add a failing-or-quarantined test that expects pro-code recommendations once real SDK/Q8 reasoning is wired. |
| Add no-match real-adapter test | Forced `NoMatchProjectSearch` proves contract; real Azure adapter must prove threshold behavior. | Test with niche IoT query against seeded index returns `noMatchFound` through `AzureAiSearchProjectSearch`. |
| Score rationale traceability | POC checks themes; production needs evidence-level scoring. | Eval asserts every rationale maps to intake/conversation/instruction/framework/search evidence. |

## 7. Observability and APM

| Item | Why | Acceptance hint |
|---|---|---|
| Instrument request/dependency telemetry | Structured logs exist; App Insights resource exists; full APM is not wired. | API emits request, dependency, exception, and custom events with correlation IDs and session/org-safe dimensions. |
| Add redaction policy | Session content can include sensitive business data. | Logs never include raw sensitive answers by default; sampled debug logging requires explicit safe mode. |
| Dashboard phase funnel | Stakeholders need to see where sessions stall. | Dashboard shows counts by readiness state, phase duration, recommendation delivery, feedback rating, and error category. |
| Alert on data-service failures | Private endpoints/RBAC failures can look like app bugs. | Alerts trigger on Cosmos/Search dependency failures, 5xx rate, and auth failures. |

## 8. CI/CD

| Item | Why | Acceptance hint |
|---|---|---|
| Add build/test pipeline for workspaces | Local green state needs repeatable CI. | Pipeline runs `npm install`, `npm run build`, `npm test`, and `npm run regression` from `agents\advisor`. |
| Add Bicep validation | Infra is production-critical and should fail before deploy. | Pipeline runs `az bicep build --file infra\main.bicep` and what-if for target env where possible. |
| Add container image scan | ACR/container is deployment unit. | Build pipeline scans image dependencies and blocks critical vulnerabilities. |
| Add environment promotion | `azd up` is good for POC; production needs staged rollout. | Dev/test/prod environments use approvals, config separation, and revision rollback. |
| Add post-deploy smoke tests | Deployment validation checklist exists. | Pipeline hits `/health`, runs NFU smoke/regression against deployed endpoint, and records result. |
