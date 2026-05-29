import type { CopilotTool, IFrameworkRetrievalService } from '@advisor/shared';

export function createFrameworkRetrievalTool(frameworkService: IFrameworkRetrievalService): CopilotTool {
  return {
    name: 'retrieve_framework_guidance',
    description: 'Retrieve relevant Microsoft AI Decision Framework guidance for a given query or phase. Use this to ground recommendations in the framework methodology.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query about the decision framework' },
        phase: { type: 'string', description: 'Optional: phase1.businessImpactAssessment | phase2.technologyGroupings | phase3.scenarioSpecificSelection' },
        topK: { type: 'number', description: 'Number of results to return (default 3)' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const query = String(args['query'] ?? '');
      const phase = args['phase'] !== undefined ? String(args['phase']) : undefined;
      const topK = args['topK'] !== undefined ? Number(args['topK']) : 3;
      const queryObj: import('@advisor/shared').FrameworkRetrievalQuery = { query, topK };
      if (phase !== undefined) {
        queryObj.phase = phase;
      }
      const results = await frameworkService.retrieve(queryObj);
      return { results: results.map((r) => ({ source: r.source, excerpt: r.content.slice(0, 800) })) };
    },
  };
}
