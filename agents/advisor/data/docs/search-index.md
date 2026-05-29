# Azure AI Search — Index Design

**Package:** `@advisor/data`
_Last updated: 2026-05-29_

---

## Overview

Azure AI Search is the **project knowledge and framework content store**. It owns searchable project records and chunked framework documentation. It does **not** own session state, turn history, or custom instructions — those live in Cosmos DB.

---

## Indexes

### `project-knowledge`

Stores `ProjectKnowledgeDocument` records (from `@advisor/shared`) in a flat, searchable form. Used for similar-project lookup during advisor conversations.

#### Field Rationale

| Field | Type | Search | Filter | Notes |
|---|---|---|---|---|
| `id` | Edm.String | — | ✓ | Cosmos `projectId`; required Search key |
| `projectId` | Edm.String | — | ✓ | Explicit copy for clean retrieval |
| `customerOrganizationId` | Edm.String | — | ✓ | Enables org-scoped queries |
| `title` | Edm.String | ✓ | — | en.microsoft analyzer |
| `summary` | Edm.String | ✓ | — | en.microsoft analyzer |
| `businessOutcome` | Edm.String | ✓ | — | en.microsoft analyzer |
| `industry` | Edm.String | ✓ | ✓ facet | Enables industry-filtered queries |
| `businessDomain` | Edm.String | ✓ | ✓ facet | Sub-industry scoping |
| `sensitivityLevel` | Edm.String | — | ✓ facet | Prevents surfacing confidential projects |
| `status` | Edm.String | — | ✓ facet | Filter to active/completed projects only |
| `useCaseTags` | Collection(Edm.String) | ✓ | ✓ facet | Rich use-case matching |
| `frameworkTags` | Collection(Edm.String) | — | ✓ facet | Phase and grouping alignment |
| `technologyTags` | Collection(Edm.String) | ✓ | ✓ facet | Technology match signal |
| `dataSourceTags` | Collection(Edm.String) | — | ✓ | Data pattern filtering |
| `searchableText` | Edm.String | ✓ | — | Main BM25 / semantic field |
| `interactionPattern` | Edm.String | ✓ | ✓ | From similarProjectSignals |
| `proactivity` | Edm.String | ✓ | — | From similarProjectSignals |
| `dataPattern` | Edm.String | ✓ | ✓ | From similarProjectSignals |
| `actionSafety` | Edm.String | ✓ | ✓ | From similarProjectSignals |
| `governancePattern` | Edm.String | ✓ | ✓ | From similarProjectSignals |

#### Why flatten `similarProjectSignals`?

The TypeScript type uses a nested object. Flattening to top-level fields:
- Avoids complex-type query syntax in OData filters (`similarProjectSignals/interactionPattern eq '...'`)
- Makes signal fields individually searchable and filterable without nesting
- Simplifies the `SearchClient` generic type parameter

The `AzureAiSearchProjectSearch.toSearchDocument()` static method handles the transformation.

---

#### Ranking Approach

```
Query → BM25 keyword score (all searchable fields)
      → Semantic re-ranker (optional, Standard tier+)
      → Score normalisation: score / (score + 1) → [0, 1]
      → Filter: results below minimumScore (default 0.5) are discarded
      → Return: ranked SimilarProjectMatch[] or NoMatchFound
```

**BM25 fields** (in rough priority order by information density):
1. `searchableText` — purpose-built denormalized text; highest signal
2. `title` + `summary` — human-readable match confirmation
3. `technologyTags` + `useCaseTags` — structured tag matching
4. `interactionPattern` + `dataPattern` + `governancePattern` — similarity signal fields

**Semantic re-ranking** (when enabled):
- Uses the `project-semantic` configuration
- Title field: `title`
- Content fields: `searchableText`, `summary`
- Keywords: `useCaseTags`, `technologyTags`
- Requires Standard S1 or higher Azure AI Search tier

**Minimum score threshold:**
- Default: `0.5` (configurable via `AzureAiSearchProjectSearchOptions.minimumScore`)
- BM25 scores are unbounded; 0.5 is a conservative POC starting point
- Tune upward (e.g., 1.0–2.0) if noise results appear in production

**`NoMatchFound` behavior:**
The adapter returns `{ noMatchFound: true, reason: '...' }` when:
- No results exceed the score threshold
- The query is well-formed but the portfolio has no comparable case

This is the `isNoMatchFound()` guard from `@advisor/shared`. Silent empty arrays are not returned.

---

### `framework-content`

Stores chunked content from `.agents/skills/microsoft-ai-decision-framework/references/*.md`.

#### Fields

| Field | Type | Notes |
|---|---|---|
| `id` | Edm.String | sha256(source::chunkIndex) — stable across re-indexing |
| `source` | Edm.String | Relative path: `references/DECISION_FRAMEWORK.md` |
| `documentTitle` | Edm.String | H1 title or filename |
| `chunkIndex` | Edm.Int32 | Position within file for ordering |
| `phase` | Edm.String | `phase1`, `phase2`, `phase3`, or `all` |
| `sectionHeading` | Edm.String | H2 heading that opened the chunk |
| `content` | Edm.String | Chunk text (max 2000 chars) |

#### Chunking Strategy

```
File → Split at H2 headings (## ...)
     → Each section = 1 chunk (heading + body)
     → No H2 found → whole file = 1 chunk
     → Truncate at 2000 chars (word boundary)
     → Phase detection via filename/content heuristic
     → Stable chunk ID: sha256(source::chunkIndex)
```

Phase detection heuristic (conservative — false positives prefer `all`):
- `phase1`: file/content contains `phase1`, `business_impact`, or `bxt`
- `phase2`: file/content contains `phase2`, `nine_critical`, or `technology_grouping`
- `phase3`: file/content contains `phase3`, `scenario_specific`
- `all`: no phase indicator found

Re-indexing is safe — `uploadDocuments` uses the stable chunk ID so existing documents are replaced.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SEARCH_ENDPOINT` | — | Azure AI Search service endpoint URL (required for Azure mode) |
| `SEARCH_INDEX` | `project-knowledge` | Project knowledge index name |
| `FRAMEWORK_INDEX` | `framework-content` | Framework content index name |
| `SKILL_PATH` | — | Absolute path to framework skill directory (for framework indexer) |

---

## Auth

Both `AzureAiSearchProjectSearch` and `AzureAiSearchFrameworkRetrieval` use `DefaultAzureCredential`. The caller's identity (managed identity in production, `az login` in local dev) requires the **Search Index Data Contributor** role for writes and **Search Index Data Reader** for reads.

The `SearchIndexClient` (used for `createOrUpdateIndex`) additionally requires **Search Service Contributor** or **Contributor** on the service resource.
