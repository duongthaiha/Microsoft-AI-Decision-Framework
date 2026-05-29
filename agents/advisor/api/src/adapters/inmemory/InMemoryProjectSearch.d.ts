import type { IProjectSearchService } from '@advisor/shared';
import type { SimilarProjectResult, SimilarProjectSearchQuery } from '@advisor/shared';
export declare class InMemoryProjectSearch implements IProjectSearchService {
    similarProjects(query: SimilarProjectSearchQuery): Promise<SimilarProjectResult>;
    private scoreMatch;
}
//# sourceMappingURL=InMemoryProjectSearch.d.ts.map