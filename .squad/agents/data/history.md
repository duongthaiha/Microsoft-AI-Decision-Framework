# Switch — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework — AI Framework Advisor Agent POC.
- **Stores:** Cosmos DB = conversation history, session state, customer-org guidance (instructions + organizationContext). Azure AI Search = project knowledge / similar-project lookup. These do NOT overlap.
- **Samples:** `agents/backlog/sample-intake-form-nfum.json`, `agents/backlog/sample-project-data-nfum.json`.
- **Output root:** contracts/schemas under `agents/advisor/`.
- **User:** Ha Duong.

## Learnings

### Session: `@advisor/data` workspace build — 2026-05-29

#### Azure AI Search SDK v12 (`@azure/search-documents ^12.1.0`)

- **`SimpleField` has NO `retrievable` property.** Field visibility is controlled by `hidden?: boolean` (inverted: `hidden: true` hides the field). Fields are returned by default; no explicit `retrievable: true` needed.
- **`SemanticField` shape is `{ name: string }`** — not `{ fieldName: string }`.
- **Semantic query discriminated union**: `SearchRequestOptions = BaseSearchRequestOptions & SearchRequestQueryTypeOptions` where `SearchRequestQueryTypeOptions` is `{ queryType: "semantic"; semanticSearchOptions: SemanticSearchOptions } | { queryType?: "simple" | "full" }`. `BaseSearchRequestOptions` also has `queryType?: QueryType`. TypeScript cannot satisfy the intersection from an object literal. Use `as NonNullable<Parameters<typeof searchClient.search>[1]>` to escape the type check cleanly.
- **`SelectArray<TFields>`** resolves to `readonly TFields[]` for specific string unions. Use `ReadonlyArray<string>` inside the cast.

#### Azure Cosmos DB SDK v4 (`@azure/cosmos ^4.1.1`)

- Cast for extra Cosmos system properties: `(doc as unknown as Record<string, unknown>)['ttl'] = ...` (double cast required — `as Record<string, unknown>` alone fails strict overlap check).

#### Interface tracking

- `IConversationStore` grew `submitFeedback` and `loadFeedback` methods after initial scaffolding (added by Tester in the same sprint for feedback capture tests). Always re-read interfaces before implementing.
- `feedback` is stored as an optional property on the `SessionDocument` Cosmos type — not a separate container. This is sufficient for POC; revisit if feedback analytics become a requirement.

#### Literal types

- `CapabilityGrouping` uses dot-notation camelCase: `'grouping3.buildAiAppsAndAgents'`, NOT PascalCase. `frameworkTags` on `ProjectKnowledgeDocument` accepts `(PhaseTag | CapabilityGrouping)[]` — both in the same array is valid.

---

## Learnings — Session: seed `advisor-project-knowledge` index — 2026-06-03

### Index name mismatch bug (CRITICAL)
`AzureAiSearchProjectSearch.ensureIndex()` used the hardcoded `name: 'project-knowledge'` from the static `PROJECT_KNOWLEDGE_INDEX_DEFINITION`. The production container is configured with `SEARCH_INDEX=advisor-project-knowledge` (set in `main.bicep` default + `main.parameters.json`). This meant `ensureIndex()` created `project-knowledge` while the search client queried `advisor-project-knowledge`, producing a persistent Search 404. Fix: override the name in `ensureIndex()` with `this.options.indexName`.

### In-network seeding path chosen: Option (a) — guarded admin endpoint inside the container

Azure AI Search has `publicNetworkAccess: Disabled` + `disableLocalAuth: true` (confirmed via `az rest` against the 2023-11-01 API). The `az search service show` CLI command returned null for both fields — use `az rest` to get accurate values.

The container app is VNet-integrated (outbound traffic stays private). Added `POST /admin/seed/project-knowledge` endpoint to `@advisor/api`, guarded by `ENABLE_ADMIN_SEED=true`. Workflow:
1. `az containerapp update … --set-env-vars ENABLE_ADMIN_SEED=true`
2. `POST /admin/seed/project-knowledge` — creates index (ensureIndex) + uploads 6 seed docs (uploadDocuments)
3. `az containerapp update … --remove-env-vars ENABLE_ADMIN_SEED`

**Why not Option (b) Container Apps Job**: container already running; admin endpoint is simpler and shares the same managed identity.  
**Why not Option (c) public access**: Azure Policy disables it; out of scope.

### Repeatable seed command
```powershell
cd agents/advisor/data/scripts
./seed-via-admin-endpoint.ps1
```
(Requires `ENABLE_ADMIN_SEED=true` set on the container first.)

### Index schema that works (`advisor-project-knowledge`)
- Flat document shape — `similarProjectSignals` flattened to top-level string fields.
- `searchableText` = manually crafted BM25 keyword field.
- Semantic config `project-semantic` on title + searchableText + summary.
- Azure AI Search Basic tier (private endpoint only) → semantic ranking not active, BM25 only. Results still return meaningful ranked scores (>0.94) for related queries.
- `ensureIndex()` must pass `{ ...DEFINITION, name: this.options.indexName }` to `createOrUpdateIndex`.

### Cosmos guidance seeding path
`POST /admin/guidance/org-nfum` with the `CustomerGuidanceDocument` JSON body. The admin guidance router in `app.ts` calls `guidanceStore.saveGuidance()`. No extra endpoint needed — existing route handles it.

### Validation confirmed (2026-06-03)
- `GET /sessions/:id/similar-projects` returns 3 ranked matches with scores > 0.94 for an NFU Mutual insurance intake.
- Top match: `proj-nfum-rural-claims-advisor-001` (score 0.97).
- Guidance seeded for `org-nfum` (instructionSetId `instr-nfum-claims-001`) confirmed via session creation returning `activeInstructionSetId`.


## Cross-Agent Note — Dozer Deployment Validation (2026-05-29T17:44:22Z)

**From:** Scribe (orchestration summary)  
**Status:** Infrastructure live in swedencentral  
**Cosmos DB:** Private endpoint verified, session write/read roundtrip successful  
**AI Search:** Private endpoint verified, service running, indexes NOT YET SEEDED  

**Action Required (Wave 3):** Run seed job to populate `advisor-project-knowledge` and `framework-content` indexes. Live endpoint ready at https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io for testing once indexes are populated.
