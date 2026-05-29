/**
 * Azure AI Search index definition for ProjectKnowledgeDocument.
 *
 * Similar-project signals are flattened to top-level fields for simpler
 * query construction; the index does not require complex-type syntax.
 *
 * Semantic ranking is configured so keyword + semantic is available when
 * the Azure AI Search tier supports it (Standard S1+). The search client
 * automatically falls back to BM25 keyword ranking on Free/Basic tiers.
 *
 * See docs/search-index.md for ranking approach and field rationale.
 */

import type { SearchIndex } from '@azure/search-documents';

export const PROJECT_KNOWLEDGE_INDEX_DEFINITION: SearchIndex = {
  name: 'project-knowledge',
  fields: [
    // -- Identity and routing
    { name: 'id', type: 'Edm.String', key: true, filterable: true },
    { name: 'projectId', type: 'Edm.String', filterable: true },
    { name: 'customerOrganizationId', type: 'Edm.String', filterable: true },

    // -- Human-readable labels (searchable)
    { name: 'title', type: 'Edm.String', searchable: true, analyzerName: 'en.microsoft' },
    { name: 'summary', type: 'Edm.String', searchable: true, analyzerName: 'en.microsoft' },
    { name: 'businessOutcome', type: 'Edm.String', searchable: true, analyzerName: 'en.microsoft' },

    // -- Classification (filterable + facetable)
    { name: 'industry', type: 'Edm.String', searchable: true, filterable: true, facetable: true },
    { name: 'businessDomain', type: 'Edm.String', searchable: true, filterable: true, facetable: true },
    { name: 'sensitivityLevel', type: 'Edm.String', filterable: true, facetable: true },
    { name: 'status', type: 'Edm.String', filterable: true, facetable: true },

    // -- Tag collections (searchable + filterable for faceted navigation)
    { name: 'useCaseTags', type: 'Collection(Edm.String)', searchable: true, filterable: true, facetable: true },
    { name: 'frameworkTags', type: 'Collection(Edm.String)', filterable: true, facetable: true },
    { name: 'technologyTags', type: 'Collection(Edm.String)', searchable: true, filterable: true, facetable: true },
    { name: 'dataSourceTags', type: 'Collection(Edm.String)', filterable: true },

    // -- Primary text field for keyword / semantic search
    { name: 'searchableText', type: 'Edm.String', searchable: true, analyzerName: 'en.microsoft' },

    // -- Flattened SimilarProjectSignals (searchable for rich matching)
    { name: 'interactionPattern', type: 'Edm.String', searchable: true, filterable: true },
    { name: 'proactivity', type: 'Edm.String', searchable: true },
    { name: 'dataPattern', type: 'Edm.String', searchable: true, filterable: true },
    { name: 'actionSafety', type: 'Edm.String', searchable: true, filterable: true },
    { name: 'governancePattern', type: 'Edm.String', searchable: true, filterable: true },
  ],

  // Semantic configuration — activates re-ranking on supported tiers.
  // Prioritizes searchableText, then title + summary for content fields.
  semanticSearch: {
    defaultConfigurationName: 'project-semantic',
    configurations: [
      {
        name: 'project-semantic',
        prioritizedFields: {
          titleField: { name: 'title' },
          contentFields: [{ name: 'searchableText' }, { name: 'summary' }],
          keywordsFields: [{ name: 'useCaseTags' }, { name: 'technologyTags' }],
        },
      },
    ],
  },
};
