import type { SimilarProjectResult, SimilarProjectSearchQuery } from '../types/similar-projects.js';

export interface IProjectSearchService {
  similarProjects(query: SimilarProjectSearchQuery): Promise<SimilarProjectResult>;
}
