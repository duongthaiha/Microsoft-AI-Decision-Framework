/**
 * Azure AI Search index definition for framework content chunks.
 *
 * Framework docs from .agents/skills/microsoft-ai-decision-framework/references/
 * are chunked by heading and indexed here, enabling the agent to retrieve
 * grounded framework guidance during conversations.
 *
 * See docs/search-index.md for the chunking strategy.
 */

import type { SearchIndex } from '@azure/search-documents';

export const FRAMEWORK_CONTENT_INDEX_DEFINITION: SearchIndex = {
  name: 'framework-content',
  fields: [
    { name: 'id', type: 'Edm.String', key: true },
    { name: 'source', type: 'Edm.String', filterable: true, facetable: true },
    { name: 'documentTitle', type: 'Edm.String', searchable: true, filterable: true },
    { name: 'chunkIndex', type: 'Edm.Int32', filterable: true, sortable: true },
    { name: 'phase', type: 'Edm.String', filterable: true, facetable: true },
    { name: 'sectionHeading', type: 'Edm.String', searchable: true },
    { name: 'content', type: 'Edm.String', searchable: true, analyzerName: 'en.microsoft' },
  ],

  semanticSearch: {
    defaultConfigurationName: 'framework-semantic',
    configurations: [
      {
        name: 'framework-semantic',
        prioritizedFields: {
          titleField: { name: 'sectionHeading' },
          contentFields: [{ name: 'content' }],
          keywordsFields: [{ name: 'phase' }],
        },
      },
    ],
  },
};
