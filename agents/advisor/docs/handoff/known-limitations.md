# Known Limitations — AI Framework Advisor Agent POC

_Last updated: 2026-06-03_

No demo theater. This POC is useful because it is honest: it shows the path, marks the cliffs, and does not paint cardboard doors on the wall.

## Summary

| ID | Limitation | Impact | Production path |
|---|---|---|---|
| D1 | In-memory similar-project scoring cannot reliably produce true no-match | Local NFU mock path always tends to return seeded matches | Use real Azure AI Search threshold behavior; keep forced no-match eval |
| G1 | Deterministic agent does not branch recommendations on Q8 `team_skills` | Pro-code scenarios can receive the same Copilot Studio-led recommendation as low-code ones in **mock** mode | Run in `copilot` mode (the framework-driven `CopilotAdvisorAgent` reasons over all nine questions) |
| L1 | Deployed default (`mock`) has no real LLM | Demo output is deterministic, not model reasoning | Flip to `ADVISOR_AGENT_MODE=copilot` once the live smoke test passes (see below) |
| L2 | Auth is not wired | Anyone with API access can call session/admin endpoints | Entra External ID middleware and org claims |
| L3 | Local continuity is process-bound | In-memory sessions disappear when API restarts | Use Cosmos mode for durable sessions |
| L4 | Single-region infra | No regional failover or DR posture | Multi-region architecture and data replication decision |
| L5 | No streaming responses | UI uses request/response and local loading state | Add streaming only if UX/product requires it |
| L6 | `copilot` mode not yet exercised against a live model in this environment | The real agent path is unit-verified with a fake SDK client only | Run the documented live smoke test with a token + Copilot CLI |

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

## Agent architecture — deterministic vs framework-driven (Copilot SDK)

### Design

The recommendation and dialogue logic lives behind a narrow `IAdvisorAgent` seam
(`generateQuestion` + `generateRecommendation`). The `AgentOrchestrator` remains
the deterministic state machine (phase progression, readiness gates, persistence)
and owns the phase/messageType of every turn — the agent only supplies content.
Two implementations exist:

| Mode | Implementation | What happens |
|---|---|---|
| `ADVISOR_AGENT_MODE=mock` (default) | `DeterministicAdvisorAgent` | Scripted, deterministic; **no LLM**; fully offline if Cosmos/Search env vars are absent. Keeps tests/evals/regression green and is the deployed default. |
| `ADVISOR_AGENT_MODE=copilot` | `CopilotAdvisorAgent` over `RealCopilotSessionService` | Real GitHub Copilot SDK. Loads the `microsoft-ai-decision-framework` skill, registers the two grounding tools, and reasons over intake + conversation + custom-instruction context to generate **both** the phase questions and the final recommendation. No hardcoded NFU/claims strings. |

The previously-hardcoded recommendation/question text was relocated **verbatim**
into `DeterministicAdvisorAgent`; the production orchestrator path no longer
contains hardcoded claims-assistant content.

### Reliability boundary (copilot mode)

LLM output is treated as untrusted: recommendations are extracted (fence-stripped),
zod shape-validated, then **domain-validated** — `customInstructionInfluence` may
only cite instruction IDs actually loaded for the org, and `similarProjectHighlights`
may only cite project IDs returned by `lookup_similar_projects`. One repair retry,
then a **loud failure** (no silent fallback to scripted output). Cosmos is the single
source of truth: each call creates a fresh SDK session from reconstructed context, so
SDK session memory never diverges from the conversation store.

### Mock → Live flip (exact steps)

1. Provision a `GITHUB_TOKEN` (or `COPILOT_TOKEN` / `GH_TOKEN`) secret — prefer Key Vault — for the API container. Supported token types: `gho_`, `ghu_`, `github_pat_`.
2. Ensure the GitHub Copilot CLI is available to the container runtime (the SDK spawns it) and `@github/copilot-sdk` is installed (already a declared `api` dependency).
3. Package the skill into the image and point `ADVISOR_SKILL_PATH` at it (default in-repo path is `.agents/skills/microsoft-ai-decision-framework`). Startup fails loudly if `SKILL.md` is missing.
4. Optionally set `ADVISOR_COPILOT_MODEL` (default `gpt-5.5`) and `ADVISOR_COPILOT_TIMEOUT_MS` (default `120000`).
5. Set `ADVISOR_AGENT_MODE=copilot` and restart. Startup validation will reject the config early if the token or skill is missing.

### Live smoke test (required before trusting copilot mode)

The unit suite verifies the agent contracts against a **fake** SDK client; it does
**not** call a real model. Before relying on copilot mode, run a live smoke test in an
environment with a token + Copilot CLI:

- Drive one full Phase 1→2→3 flow against `ADVISOR_AGENT_MODE=copilot`.
- Confirm the model invokes `retrieve_framework_guidance` and `lookup_similar_projects` (tool execution requires `skipPermission` — already set on both grounding tools).
- Confirm a valid `RecommendationOutput` JSON passes shape + domain validation.
- Confirm pro-code vs low-code scenarios produce materially different recommendations (closes G1).

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
