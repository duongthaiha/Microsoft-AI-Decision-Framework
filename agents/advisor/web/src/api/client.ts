import type {
  ApiError,
  ApiResponse,
  CreateSessionResponse,
  CustomerGuidanceDocument,
  EndSessionResponse,
  IntakeSubmission,
  RetrieveRecommendationResponse,
  RetrieveSimilarProjectsResponse,
  SendMessageResponse,
  SubmitFeedbackResponse,
  SubmitIntakeResponse,
} from '@advisor/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

function failure(message: string, code: ApiError['code'] = 'INTERNAL_ERROR'): ApiResponse<never> {
  return { ok: false, error: { code, message } };
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (!payload) return failure('The server returned an empty response.');
    if (!response.ok && payload.ok) return failure(`Request failed with status ${response.status}.`);
    return payload;
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Network request failed.');
  }
}

const jsonBody = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const apiClient = {
  createSession(customerOrganizationId: string, userId?: string): Promise<ApiResponse<CreateSessionResponse>> {
    return request('/sessions', jsonBody({ customerOrganizationId, ...(userId ? { userId } : {}) }));
  },
  submitIntake(sessionId: string, intake: IntakeSubmission): Promise<ApiResponse<SubmitIntakeResponse>> {
    return request(`/sessions/${encodeURIComponent(sessionId)}/intake`, jsonBody({ intake }));
  },
  sendMessage(sessionId: string, content: string): Promise<ApiResponse<SendMessageResponse>> {
    return request(`/sessions/${encodeURIComponent(sessionId)}/messages`, jsonBody({ content }));
  },
  getRecommendation(sessionId: string): Promise<ApiResponse<RetrieveRecommendationResponse>> {
    return request(`/sessions/${encodeURIComponent(sessionId)}/recommendation`);
  },
  getSimilarProjects(sessionId: string): Promise<ApiResponse<RetrieveSimilarProjectsResponse>> {
    return request(`/sessions/${encodeURIComponent(sessionId)}/similar-projects`);
  },
  submitFeedback(sessionId: string, rating: number, comment?: string): Promise<ApiResponse<SubmitFeedbackResponse>> {
    return request(`/sessions/${encodeURIComponent(sessionId)}/feedback`, jsonBody({ rating, ...(comment ? { comment } : {}) }));
  },
  endSession(sessionId: string): Promise<ApiResponse<EndSessionResponse>> {
    return request(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  },
  listGuidance(orgId: string): Promise<ApiResponse<CustomerGuidanceDocument[]>> {
    return request(`/admin/guidance/${encodeURIComponent(orgId)}`);
  },
  saveGuidance(orgId: string, doc: CustomerGuidanceDocument): Promise<ApiResponse<CustomerGuidanceDocument>> {
    return request(`/admin/guidance/${encodeURIComponent(orgId)}`, jsonBody(doc));
  },
  updateGuidance(orgId: string, instructionSetId: string, doc: CustomerGuidanceDocument): Promise<ApiResponse<CustomerGuidanceDocument>> {
    return request(`/admin/guidance/${encodeURIComponent(orgId)}/${encodeURIComponent(instructionSetId)}`, { method: 'PUT', body: JSON.stringify(doc) });
  },
  activateGuidance(orgId: string, instructionSetId: string): Promise<ApiResponse<{ activated: boolean }>> {
    return request(`/admin/guidance/${encodeURIComponent(orgId)}/${encodeURIComponent(instructionSetId)}/activate`, jsonBody({}));
  },
};
