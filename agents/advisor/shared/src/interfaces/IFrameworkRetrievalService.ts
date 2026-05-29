export interface FrameworkRetrievalQuery {
  query: string;
  phase?: string;
  topK?: number;
}

export interface FrameworkRetrievalResult {
  content: string;
  source: string;
}

export interface IFrameworkRetrievalService {
  retrieve(query: FrameworkRetrievalQuery): Promise<FrameworkRetrievalResult[]>;
}
