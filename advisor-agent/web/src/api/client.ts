import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalInstance, loginRequest, isDemoMode } from '../auth/msal-config';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

// ─── SSE event types (mirrors Dallas's M2 SSE contract) ───────────────────────

export interface SSETurnCreated { type: 'turn.created'; id: string; turnIndex: number }
export interface SSEToolInvoked { type: 'tool.invoked'; toolName: string; args: unknown }
export interface SSEToolResult  { type: 'tool.result';  toolName: string; resultSummary: string }
export interface SSETextDelta   { type: 'text.delta';   text: string }
export interface SSETurnCompleted { type: 'turn.completed'; usage: unknown; finalText: string }
export interface SSEResponseDone  { type: 'response.done';  requestId: string; sessionId: string }
export interface SSEError         { type: 'error';           code: string; message: string }

export type SSEEvent =
  | SSETurnCreated
  | SSEToolInvoked
  | SSEToolResult
  | SSETextDelta
  | SSETurnCompleted
  | SSEResponseDone
  | SSEError;

// Sentinel emitted when the backend hasn't upgraded to SSE yet (returns JSON)
export interface SSEJsonFallback { type: '__json_fallback__'; data: unknown }

export type StreamItem = SSEEvent | SSEJsonFallback;

async function getAccessToken(): Promise<string> {
  if (isDemoMode) return '';

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return '';

  try {
    const result = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      try {
        const result = await msalInstance.acquireTokenPopup({
          ...loginRequest,
          account: accounts[0],
        });
        return result.accessToken;
      } catch {
        return '';
      }
    }
    return '';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API ${method} ${path} failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

/**
 * streamResponses — POST to `path` with SSE streaming.
 *
 * Sends `Accept: text/event-stream` so Dallas's M2 backend can upgrade.
 * If the backend still returns `application/json`, yields a single
 * `__json_fallback__` item so the caller can degrade gracefully.
 *
 * Heartbeat comments (`: keepalive`) are skipped in the parser.
 * Pass an AbortSignal to cancel the stream on unmount or re-submit.
 */
export async function* streamResponses(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<StreamItem> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`API POST ${path} failed: ${response.status} ${response.statusText}`);
  }

  // Graceful fallback: backend hasn't enabled SSE yet
  const ct = response.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream')) {
    const data = await response.json();
    yield { type: '__json_fallback__', data } satisfies SSEJsonFallback;
    return;
  }

  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line (\n\n)
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        if (!chunk.trim()) continue;

        let eventType = '';
        let dataStr = '';

        for (const line of chunk.split('\n')) {
          if (line.startsWith(': ')) continue; // SSE comment / keepalive
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice(6);
          }
        }

        if (!eventType || !dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr) as Record<string, unknown>;
          yield { type: eventType, ...parsed } as SSEEvent;
        } catch {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
