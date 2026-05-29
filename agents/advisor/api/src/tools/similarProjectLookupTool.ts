import type { CopilotTool, IProjectSearchService } from '@advisor/shared';
import { isNoMatchFound } from '@advisor/shared';

export function createSimilarProjectLookupTool(searchService: IProjectSearchService): CopilotTool {
  return {
    name: 'lookup_similar_projects',
    description: 'Search the project knowledge base for similar prior Microsoft AI projects. Use this before finalizing any recommendation. Results inform but do not override the framework.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Description of the use case to find similar projects for' },
        topK: { type: 'number', description: 'Maximum results to return (default 3)' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const query = String(args['query'] ?? '');
      const topK = args['topK'] !== undefined ? Number(args['topK']) : 3;
      const result = await searchService.similarProjects({
        query,
        indexName: 'advisor-project-knowledge',
        topK,
      });
      if (isNoMatchFound(result)) {
        return { noMatchFound: true, reason: result.reason };
      }
      return { matches: result };
    },
  };
}
