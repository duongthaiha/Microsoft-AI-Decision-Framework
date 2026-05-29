import { useCallback, useEffect, useState } from 'react';
import type {
  ConversationReadinessState,
  ConversationTurn,
  IntakeAnswerMap,
  IntakeSubmission,
  RecommendationOutput,
  SimilarProjectSearchResult,
} from '@advisor/shared';
import { apiClient } from '../api/client';
import formDef from '../data/intake-form.json';

interface AdvisorSessionState {
  sessionId?: string;
  readinessState?: ConversationReadinessState;
  turns: ConversationTurn[];
  recommendation?: RecommendationOutput;
  similarProjects?: SimilarProjectSearchResult | undefined;
}

const emptyState: AdvisorSessionState = { turns: [] };
const storageKey = (sessionId: string) => `advisor-session:${sessionId}`;

function saveState(state: AdvisorSessionState) {
  if (state.sessionId) sessionStorage.setItem(storageKey(state.sessionId), JSON.stringify(state));
}

function loadState(sessionId?: string): AdvisorSessionState {
  if (!sessionId) return emptyState;
  const stored = sessionStorage.getItem(storageKey(sessionId));
  if (!stored) return { ...emptyState, sessionId };
  try {
    return JSON.parse(stored) as AdvisorSessionState;
  } catch {
    return { ...emptyState, sessionId };
  }
}

export function useSession(initialSessionId?: string) {
  const [state, setState] = useState<AdvisorSessionState>(() => loadState(initialSessionId));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => saveState(state), [state]);

  const createSession = useCallback(async (customerOrganizationId: string) => {
    setIsLoading(true); setError(null);
    const response = await apiClient.createSession(customerOrganizationId);
    setIsLoading(false);
    if (!response.ok) { setError(response.error.message); return null; }
    const next: AdvisorSessionState = { sessionId: response.data.sessionId, readinessState: 'awaitingIntake', turns: [] };
    setState(next);
    saveState(next);
    return response.data.sessionId;
  }, []);

  const submitIntake = useCallback(async (sessionId: string, answers: IntakeAnswerMap) => {
    setIsLoading(true); setError(null);
    const intake: IntakeSubmission = { answers, formTitle: formDef.formTitle, submittedAt: new Date().toISOString(), validationState: 'valid' };
    const response = await apiClient.submitIntake(sessionId, intake);
    setIsLoading(false);
    if (!response.ok) { setError(response.error.message); return false; }
    setState((current) => {
      const next: AdvisorSessionState = { ...current, sessionId, readinessState: 'phase1InProgress', turns: response.data.firstAgentTurn ? [...current.turns, response.data.firstAgentTurn] : current.turns };
      saveState(next);
      return next;
    });
    return true;
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!state.sessionId) return null;
    setIsLoading(true); setError(null);
    const userTurn: ConversationTurn = { turnId: `local-${Date.now()}`, role: 'user', messageType: 'answer', content, timestamp: new Date().toISOString() };
    setState((current) => ({ ...current, turns: [...current.turns, userTurn] }));
    const response = await apiClient.sendMessage(state.sessionId, content);
    setIsLoading(false);
    if (!response.ok) { setError(response.error.message); return null; }
    setState((current) => ({ ...current, readinessState: response.data.readinessState as ConversationReadinessState, turns: [...current.turns, response.data.agentTurn] }));
    return response.data.agentTurn;
  }, [state.sessionId]);

  const fetchRecommendation = useCallback(async (sessionId: string) => {
    setIsLoading(true); setError(null);
    const [recommendationResponse, similarResponse] = await Promise.all([apiClient.getRecommendation(sessionId), apiClient.getSimilarProjects(sessionId)]);
    setIsLoading(false);
    if (!recommendationResponse.ok) { setError(recommendationResponse.error.message); return null; }
    const similarProjects = similarResponse.ok ? similarResponse.data.searchResult : undefined;
    setState((current) => {
      const next: AdvisorSessionState = { ...current, sessionId, recommendation: recommendationResponse.data.recommendation };
      if (similarProjects) next.similarProjects = similarProjects;
      return next;
    });
    return recommendationResponse.data.recommendation;
  }, []);

  return { ...state, isLoading, error, createSession, submitIntake, sendMessage, fetchRecommendation };
}
