import type { IFrameworkRetrievalService, FrameworkRetrievalQuery, FrameworkRetrievalResult } from '@advisor/shared';
export declare class InMemoryFrameworkRetrieval implements IFrameworkRetrievalService {
    private documents;
    constructor(skillPath: string);
    private loadDocuments;
    retrieve(query: FrameworkRetrievalQuery): Promise<FrameworkRetrievalResult[]>;
}
//# sourceMappingURL=InMemoryFrameworkRetrieval.d.ts.map