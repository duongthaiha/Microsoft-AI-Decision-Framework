# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-05-26 — M0 Framework Spine & Architectural Call-outs

**Framework spine locked:**  
`Intake → Phase 1 BXT → Step 1b Reuse Gate → Phase 2 Technology Groupings → Phase 3 Scenario Selection → Brief → Confirm → status: New`

Each step maps to a file in `agent/src/framework/` with typed input/output interfaces. The Reuse Gate (Step 1b) is the advisor's only addition to the public Microsoft AI Decision Framework — it sits between BXT and Phase 2, not at the end.

**Architectural call-outs for the team:**

1. **Identity model — no secrets in the container.** The Hosted Agent identity model means the agent container itself never holds secrets. Dallas must build the Cosmos client around `ManagedIdentityCredential` from day 1. `DefaultAzureCredential` is the local-dev fallback only. If a GitHub token is needed for the Copilot SDK model path, it goes to Key Vault — never env vars or config files.

2. **TypeScript, not Python.** The spec (§3 line 111) says TypeScript/Node.js with `@github/copilot-sdk`. The history.md project context mentions Python — that's outdated. The spec wins.

3. **Partition keys are structural isolation.** Sessions and Requests partition on `/ownerId`. Projects on `/projectId`. OrgContext on `/orgId`. Every query against `sessions` and `requests` MUST include the caller's `ownerId` as the partition key — this is not optional app-level filtering, it's the architectural isolation boundary.

4. **Types flow one way.** `agent/src/data/models.ts` is the single source of truth for document shapes. Frontend and tests import from there. Never duplicate types.

5. **Responses protocol first.** We start with the Responses protocol for the Hosted Agent adapter. If M1 discovery shows the Copilot SDK needs an Invocations bridge, that's a decision-inbox item, not a silent switch.

6. **OrgContext is read-only to the agent.** The agent identity has Cosmos Data Reader on `org-context`. Only the admin backend identity has Data Contributor on `org-context`. This is enforced at the RBAC layer, not just application code.

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.

---

## M0→M1 Region Redeploy & Entra Setup — 2026-05-26

### Overall state: 🟢 All-green on infrastructure, 🟢 Entra app registered, 🔴 SWA deploy blocked on ARM

**Parker-3 (region redeploy):** swedencentral now live. All services available. Container App URL: `https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io`. Bicep split SWA region to `westeurope` (correct — CDN-backed global resource). Commit fbf39dd.

**Parker-4 (Entra + web):** Phase 1 complete — app registration live, PKCE flow ready, redirect URIs registered. Phase 2 blocked on SWA CLI ARM binary incompatibility. Unblocking paths documented (GitHub Actions / Azure Cloud Shell).

### M1 gaps — ripley ownership

| Gap | Notes |
|---|---|
| **Foundry Hosted Agent Bicep stub** | Parker + Ripley to create `scripts/deploy-hosted-agent.sh` (AZD predeploy hook). Bridge Bicep placeholder to full agent orchestration. Reference: https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents |
| **AI Search index schema** | Dallas to define in M1. Search service now live in swedencentral. |
| **SWA deploy unblocking** | Ha to use GitHub Actions (Option A) or Azure Cloud Shell (Option B) — Parker documented both paths. M2 for full integration. |

### M1 follow-ups assigned to Ripley

1. **Orchestrate Foundry Hosted Agent deployment script** — Partner with Parker to author `scripts/deploy-hosted-agent.sh`. Ensure AZD predeploy hook calls it correctly.
2. **Monitor Foundry ARM provider GA status** — Once `Microsoft.FoundryService/agents` (or confirmed resource type) reaches GA in ARM provider, replace placeholder in `infra/modules/foundry.bicep` with real resource declaration.
3. **Coordinate M2 auth rollout** — Dallas (JWT validation) + Parker (AdvisorAdmin app role) + Ha (SWA deploy) on critical path for production sign-in.

**Decision records:** `.squad/decisions.md` entries #259 (parker-region-redeploy) and #260 (parker-entra-and-web-deploy)

---

## M1 Search Schema Design — 2026-05-26T22:52:00Z

### Search index design choices

- **Index name versioned from day 1** (`system-inventory-v1`). Future migrations use `system-inventory-v2` + alias swap — never in-place schema mutation on a live index.
- **`org_id` included despite MVP being single-tenant.** Product-spec §3 explicitly defers multi-tenancy. Including a nullable `org_id` now means the field is there when needed; a future v2 migration would only be needed if *new* fields are required, not for tenancy.
- **BM25 + vector + semantic re-rank (hybrid).** For a small catalogue index, pure vector search over-fits to embedding similarity. BM25 catches exact tag matches (e.g. `invoice-ocr`). Semantic re-rank ensures relevance ordering is human-concept-aligned, not just cosine-score-aligned. Always combine all three for reuse-gate queries.
- **`confidence_score` as a sortable break-tie, not a filter.** Do not use it as a hard vector filter — it would mis-rank fresh low-confidence systems over stale high-confidence ones. Apply the `>= 0.5` threshold post-retrieval in agent code after semantic ranking.
- **`capabilities` facetable.** Admin browse UI will want facets; adding facetable at schema creation is free. Removing it later requires index rebuild.
- **`data_sources` searchable.** Users describe problems in terms of their data ("we have Snowflake data, how do we..."), so `data_sources` appearing in BM25 index catches these descriptions.
- **English Microsoft analyzer on `name` and `description`.** `en.microsoft` handles stemming/lemmatization better than `standard.lucene` for technical English prose. Use consistent analyzer at ingest and query time.

### Vector profile patterns

- **HNSW `m=4` for Basic tier.** Basic tier has a 50 MB vector index limit per partition. Lower `m` = fewer edges per node = smaller graph = lower memory. Raise to `m=8` if recall drops at scale.
- **`efConstruction=400`, `efSearch=500`** — Microsoft's recommended defaults for balanced recall vs. latency on small indexes (< 10K docs). Re-tune once the index has real data via `GET /stats`.
- **Integrated vectorization NOT yet enabled.** `aoai.bicep` only deploys `gpt-4.1-mini`. The `vectorizers` block is intentionally omitted from `system-inventory-v1-index.json` until Parker adds `text-embedding-3-small`. Until then, Dallas must call the Embeddings API explicitly at ingest time and pass the vector in the document body.
- **`cosine` metric.** Standard for OpenAI text-embedding models — vectors are not magnitude-normalized by default, so cosine outperforms dot-product for these embeddings.

### RBAC gap discovered

Agent identity has `Search Index Data Reader` (confirmed in `identity.bicep:95`). Admin upsert path (system inventory CRUD via admin backend) requires `Search Index Data Contributor` (`8ebe5a00-799e-43f5-93ac-243d3dce84a0`). Parker must add this assignment for the admin backend identity (P2 in the decision follow-up list).

### Deliverables

- Decision file: `.squad/decisions/inbox/ripley-search-index-schema-system-inventory.md`
- Index JSON: `advisor-agent/data/system-inventory-v1-index.json` (Parker provisioning artifact)
- M1 routing: Parker (P1–P3), Dallas (D1–D3)

---

## Framework Extraction & Schema-for-Prompt-Injection — 2026-05-26

### Task: `framework-anchors.json` + `org-context-default.json`

**What was done:** Extracted the Microsoft AI Decision Framework from GIT ROOT docs into `advisor-agent/data/framework-anchors.json` (the structured reference Dallas injects into the advisor's system prompt). Verified and preserved Dallas's existing `org-context-default.json` (it correctly matched the TypeScript `OrgContext` model and was richer than the spec's minimal template).

### Framework Extraction Patterns

1. **Source discipline.** Source docs (`docs/decision-framework.md`, `docs/capability-model.md`, `docs/evaluation-criteria.md`) are the authoritative truth. The JSON extracts from them — never invents. When two sources conflicted (e.g., task spec showed `version: 1` (integer) but TypeScript model shows `version: string`), the TypeScript model wins as the structural authority.

2. **Canonical anchor products live in `.github/copilot-instructions.md`.** This file has the definitive G1–G5 anchor product lists (Teaching Anchors per the Constitution). The source docs have more narrative detail; the copilot-instructions list is the compact, verified canonical form.

3. **What goes in JSON vs. what stays in docs.** The rule: structured criteria → JSON; narrative teaching devices → docs. Named mental models ("The Coin", "The Kitchen"), Mermaid diagrams, scenario examples, and implementation blueprints were deliberately excluded. They are too large for prompt tokens and survive better as docs the advisor cites by reference.

4. **`groupingsAffected` per question enables skip logic.** Encoding which of G1–G5 each question affects allows Dallas to skip questions whose answers are already implied by intake or BXT (per spec §3 line 152). Without this field, the agent would have to embed that logic as hardcoded strings in agent code.

5. **`answers` as arrays enable entitlement filtering.** Structured answer values (e.g., `"pro-code"`) let Dallas join Q2 answers against OrgContext entitlements at runtime — e.g., if Q2 answer is `"pro-code"` and `foundry: "available-with-restrictions"`, Dallas can surface the restriction note automatically without a string search.

### Schema-for-Prompt-Injection Design Patterns

1. **Load by phase, not whole file.** System prompt token budget is finite. The JSON is structured so Dallas loads only the relevant slice per framework phase: intake filter for Phase 0, BXT dimensions for Phase 1, nineQuestions + capabilityGroupings for Phase 2, decisionAnchors for Phase 3. Full injection is wasteful.

2. **Scoring guides as single strings.** Keeps them prompt-injectable without parse overhead. Format is `"low: <criteria>; medium: <criteria>; high: <criteria>"` — direct interpolation into system prompt prose.

3. **Decision anchors as string arrays.** Arrays of criteria strings are easy to filter (suppress items when relevant product is unavailable/restricted), easy to render as bullet lists in prompts, and easy to extend with future criteria without a schema change.

4. **Single-field checkpoint text.** `doYouNeedAnAgentCheckpoint` is a paragraph string, not a structured object. It is read aloud to the user at the checkpoint step — verbatim prose injection is correct here. Don't over-structure content that is meant to be read, not computed.

5. **Version the JSON independently from the source docs.** `framework-anchors.json` has its own `version` field. When source docs are updated in the GIT ROOT, Ripley bumps the JSON version and updates `lastUpdated`. Dallas's agent code can log the version used per session for traceability.

6. **Never duplicate TypeScript model shapes in JSON data files.** When an existing file already matches the TS model correctly (as Dallas's `org-context-default.json` did), preserve it. The TS model is the structural authority; the spec's JSON snippet is illustrative, not prescriptive.

### Deliverables

- `advisor-agent/data/framework-anchors.json` (authoritative version, supersedes Dallas's M1 fallback stub)
- `advisor-agent/data/org-context-default.json` (preserved from Dallas — correctly typed to TS model)
- Decision file: `.squad/decisions/inbox/ripley-framework-anchors-and-default-org-context.md`
- M1 routing: Dallas (D1: load framework-anchors.json into system prompt builder; D2: use org-context-default.json as first-boot seed)
