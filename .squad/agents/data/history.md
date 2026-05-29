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

## Cross-Agent Note — Dozer Deployment Validation (2026-05-29T17:44:22Z)

**From:** Scribe (orchestration summary)  
**Status:** Infrastructure live in swedencentral  
**Cosmos DB:** Private endpoint verified, session write/read roundtrip successful  
**AI Search:** Private endpoint verified, service running, indexes NOT YET SEEDED  

**Action Required (Wave 3):** Run seed job to populate `advisor-project-knowledge` and `framework-content` indexes. Live endpoint ready at https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io for testing once indexes are populated.
