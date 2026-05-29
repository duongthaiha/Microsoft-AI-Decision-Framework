import type { IProjectSearchService } from '@advisor/shared';
import type { SimilarProjectResult, SimilarProjectSearchQuery, SimilarProjectMatch } from '@advisor/shared';
import { isNoMatchFound } from '@advisor/shared';

const SEED_PROJECTS: SimilarProjectMatch[] = [
  {
    projectId: 'proj-insurance-guidance-assistant-014',
    title: 'Policy Guidance Assistant for Commercial Insurance',
    score: 0.86,
    matchRationale: 'Similar regulated insurance domain, grounded policy retrieval, source citation, and human approval boundary.',
    technologies: ['Microsoft Copilot Studio', 'Azure AI Search', 'Azure OpenAI'],
  },
  {
    projectId: 'proj-claims-triage-copilot-022',
    title: 'Claims Triage Copilot for Weather Events',
    score: 0.79,
    matchRationale: 'Similar storm-related claims triage and escalation workflow, but used a custom web UI rather than Teams.',
    technologies: ['Microsoft Foundry', 'Azure AI Search', 'Azure App Service'],
  },
  {
    projectId: 'proj-hr-policy-advisor-031',
    title: 'HR Policy Advisor Agent',
    score: 0.62,
    matchRationale: 'Similar assistive Q&A pattern grounded in internal policy documents, though not an insurance use case.',
    technologies: ['Copilot Studio', 'SharePoint Graph Connector', 'Azure OpenAI'],
  },
];

void isNoMatchFound; // imported for guard use in consuming code

export class InMemoryProjectSearch implements IProjectSearchService {
  async similarProjects(query: SimilarProjectSearchQuery): Promise<SimilarProjectResult> {
    const q = query.query.toLowerCase();
    const scored = SEED_PROJECTS.map((p) => ({
      ...p,
      score: this.scoreMatch(p, q),
    })).filter((p) => p.score > 0.5);

    if (scored.length === 0) {
      return {
        noMatchFound: true,
        reason: `No projects found matching query: "${query.query}"`,
      };
    }
    return scored.slice(0, query.topK).sort((a, b) => b.score - a.score);
  }

  private scoreMatch(project: SimilarProjectMatch, query: string): number {
    const text = `${project.title} ${project.matchRationale} ${project.technologies.join(' ')}`.toLowerCase();
    const queryWords = query.split(/\s+/).filter((w) => w.length > 3);
    const matches = queryWords.filter((w) => text.includes(w)).length;
    const baseScore = queryWords.length > 0 ? matches / queryWords.length : 0;
    return Math.max(project.score * (0.5 + baseScore * 0.5), project.score * 0.6);
  }
}
