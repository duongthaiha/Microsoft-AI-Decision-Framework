import React, { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import type { Request } from '../../types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; requests: Request[] }
  | { kind: 'error'; message: string };

/**
 * RequestsPage — paginated read-only list of all Requests across users.
 * Columns per FR-027: requestId, ownerId, sessionId, status, createdAt,
 * submittedAt, linkedProjectId, orgContextVersion.
 */
export function RequestsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiGet<Request[]>('/admin/requests')
      .then((requests) => { if (!cancelled) setState({ kind: 'ready', requests }); })
      .catch((err) => {
        if (!cancelled)
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section aria-labelledby="requests-heading">
      <h1 id="requests-heading">Requests</h1>
      <p>Every project idea that has come through the advisor, across all users.</p>

      {state.kind === 'loading' && <p className="placeholder-note">Loading requests…</p>}
      {state.kind === 'error' && (
        <p className="placeholder-note">
          Could not load requests ({state.message}).
        </p>
      )}

      {state.kind !== 'loading' && (
        <table>
          <thead>
            <tr>
              <th scope="col">Request ID</th>
              <th scope="col">Owner</th>
              <th scope="col">Session ID</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">Submitted</th>
              <th scope="col">Linked project</th>
              <th scope="col">Org context</th>
            </tr>
          </thead>
          <tbody>
            {state.kind === 'ready' && state.requests.length === 0 && (
              <tr><td colSpan={8} className="empty-state">No requests yet.</td></tr>
            )}
            {state.kind === 'ready' && state.requests.map((r) => (
              <tr key={r.id}>
                <td><code>{r.requestId ?? r.id}</code></td>
                <td>{r.ownerId}</td>
                <td><code>{r.sessionId}</code></td>
                <td>{r.status}</td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}</td>
                <td>{r.linkedProjectId ?? '—'}</td>
                <td>{r.orgContextVersion ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
