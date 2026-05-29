# Known Limitations — AI Framework Advisor Agent POC

_Last updated: 2026-05-29_

No demo theater. This POC is useful because it is honest: it shows the path, marks the cliffs, and does not paint cardboard doors on the wall.

## Summary

| ID | Limitation | Impact | Production path |
|---|---|---|---|
| D1 | In-memory similar-project scoring cannot reliably produce true no-match | Local NFU mock path always tends to return seeded matches | Use real Azure AI Search threshold behavior; keep forced no-match eval |
| G1 | Mock agent does not branch recommendations on Q8 `team_skills` | Pro-code scenarios can receive the same Copilot Studio-led recommendation as low-code ones | Real Copilot SDK + full nine-question evidence wiring |
| L1 | Mock mode has no real LLM | Demo output is deterministic, not model reasoning | Wire and validate `RealCopilotSessionService` |
| L2 | Auth is not wired | Anyone with API access can call session/admin endpoints | Entra External ID middleware and org claims |
| L3 | Local continuity is process-bound | In-memory sessions disappear when API restarts | Use Cosmos mode for durable sessions |
| L4 | Single-region infra | No regional failover or DR posture | Multi-region architecture and data replication decision |
| L5 | No streaming responses | UI uses request/response and local loading state | Add streaming only if UX/product requires it |

## D1 — In-memory search cannot prove the true no-match path

### POC reality

`InMemoryProjectSearch` seeds three project matches and scores each with:

```text
max(project.score * (0.5 + baseScore * 0.5), project.score * 0.6)
```

Because the top seed starts at `0.86`, its floor is about `0.516`. The adapter filters on `score > 0.5`, so at least that seed can survive even when the query is unrelated. That means the default in-memory adapter is not a faithful way to demonstrate a genuine no-match portfolio result.

### What does prove no-match today

- The real `AzureAiSearchProjectSearch` returns `{ noMatchFound: true, reason }` when no result exceeds its minimum score threshold.
- The eval harness includes a niche IoT no-match case using `NoMatchProjectSearch`, so the recommendation contract and UI-safe behavior are exercised.

### Production path

- Tune Azure AI Search thresholds against a representative portfolio.
- Keep explicit no-match tests so the app never silently returns an empty array or fake reference project.

## G1 — Mock agent ignores Q8 `team_skills` when choosing technologies

### POC reality

The orchestrator can ask about Q8 (`team_skills`) in a Phase 2 follow-up, and the evidence model includes a `team_skills` critical question. However, the deterministic recommendation builder currently returns the same primary technology stack for the main path:

- Microsoft Copilot Studio
- Azure AI Search
- Azure OpenAI / Microsoft Foundry

The healthcare pro-code eval documents this as an advisory gap: a pro-code Azure/FHIR team still receives the current deterministic Copilot Studio-led recommendation.

### Impact

The NFU Mutual demo remains valid because its POC path is Teams-first, human-in-the-loop, and low-code/managed orchestration is defensible. But for pro-code scenarios, the advisor should shift emphasis toward Microsoft Foundry, M365 Agents SDK / Agent Framework, or custom app patterns when Q8 supports it.

### Production path

- Wire real Copilot SDK reasoning over all nine critical questions.
- Persist Q8 as decision evidence.
- Add eval assertions that pro-code and maker-team scenarios produce different recommendations.

## Mock vs real Copilot SDK

### POC reality

| Mode | What happens |
|---|---|
| `ADVISOR_AGENT_MODE=mock` | Uses `MockCopilotSessionService`; deterministic; no LLM; fully offline if Cosmos/Search env vars are absent. |
| `ADVISOR_AGENT_MODE=copilot` | Selects `RealCopilotSessionService`; requires `GITHUB_TOKEN` or `COPILOT_TOKEN`; current implementation is a guarded adapter stub that must be validated with the real SDK package/runtime. |

The mock does not call a model, does not stream tokens, and does not discover novel reasoning. The orchestrator builds deterministic turns and recommendation JSON.

### Production path

- Install/wire the real SDK package and validate session create/resume/send/end behavior.
- Load `.agents\skills\microsoft-ai-decision-framework` in real sessions.
- Register retrieval tools and prove the model uses tool outputs in evidence.

## Auth and authorization are not implemented

### POC reality

- Express routes do not validate JWTs.
- Admin guidance routes are callable without `OrgAdmin` checks.
- `customerOrganizationId` is accepted from request body/path in the POC API.

### Production path

- Implement Entra External ID JWT validation.
- Require `organizationId` claim on all session routes.
- Require `OrgAdmin` role plus org-claim/path match on admin guidance routes.
- Consider a temporary `X-Api-Key` only for internal demos if needed; remove before external customer use.

## Data persistence and continuity limits

### POC reality

| Environment | Continuity |
|---|---|
| Local offline mock | In-memory session/guidance/search; API restart clears state. |
| Browser UI | Stores a local `sessionStorage` copy of turns/recommendation for rendering. |
| Azure mode | Cosmos adapters persist sessions and guidance when `COSMOS_ENDPOINT` and `SEARCH_ENDPOINT` are set. |

There is no full `GET /sessions/:id` endpoint today. The implemented read paths are latest message, recommendation, similar projects, feedback submission, and session end.

### Production path

- Add org-scoped session read/recovery if required.
- Make store methods org-aware to avoid cross-partition lookup.
- Define retention tiers for sessions, feedback, and long-lived project cases.

## Search and retrieval limits

### POC reality

- In-memory project search is keyword-ish over three seeded matches.
- Azure AI Search adapter uses BM25 and optional semantic re-ranking; vector strategy is not implemented.
- Seed loader can create the project index and upload seed project documents, but there is no production ingestion pipeline.
- Framework retrieval has an in-memory path and Azure framework index path, but production framework indexing needs operational ownership.

### Production path

- Decide vector/hybrid approach.
- Add sensitivity/org filters before surfacing cross-customer examples.
- Build ingestion pipeline for approved project cases.
- Tune no-match thresholds.

## UI limitations

### POC reality

- The React SPA is a POC shell with four screens: intake, conversation, recommendation, admin.
- The intake form is embedded JSON in the web app, not fetched dynamically from the API.
- The UI uses request/response calls; no real streaming.
- The conversation page relies on local state/sessionStorage and API responses, not a full server-side session reload.
- Admin UI edits guidance but has no auth, approval workflow, or production audit experience beyond document metadata.

### Production path

- Fetch form definitions/versioning from an API if business users will manage forms.
- Add authenticated route guards.
- Add server-side session recovery.
- Decide whether streaming materially improves the advisor experience.

## Infrastructure and security limitations

### POC reality

| Gap | Current state |
|---|---|
| CORS | Wildcard origins in Container App ingress. |
| ACR | Public access enabled; admin account disabled; managed identity uses AcrPull. |
| NSG | No NSG on private endpoint subnet. |
| Cosmos RBAC | Built-in Data Contributor scoped to Cosmos account. |
| Retention | Key Vault soft-delete 7 days; Log Analytics 30 days. |
| Region | Single Azure region; no failover. |
| App Insights | Public ingestion/query enabled. |
| API Management | Not present; intentionally deferred. |

### Production path

Harden these before external/customer production use. They do not block the POC because they are explicitly documented and accepted as POC gaps.

## Recommendation quality limits

### POC reality

- NFU Mutual recommendation is grounded in intake, conversation, custom instructions, framework docs retrieval, and project search.
- The recommendation builder is deterministic and optimized for the POC path.
- It does not yet persist full `DecisionFrameworkEvidence` as a separate durable record.
- It does not yet vary the architecture deeply across all possible Microsoft AI technology groupings.

### Production path

- Persist evidence as first-class data.
- Add broader eval coverage across M365 Copilot extension, Copilot Studio-only, Foundry/pro-code, autonomous agents, and specialized agents.
- Require every rationale item to cite a concrete evidence source.
