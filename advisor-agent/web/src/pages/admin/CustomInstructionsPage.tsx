import React, { useEffect, useState, useCallback } from 'react';
import { apiGet } from '../../api/client';
import type { OrgContext, CustomInstruction } from '../../types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; instructions: CustomInstruction[] }
  | { kind: 'error'; message: string };

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3500);
  }, []);
  return { message, show };
}

/**
 * CustomInstructionsPage — read-only list of custom instructions.
 *
 * Write actions (save new version) are coming in M2.1 once Dallas ships
 * the standalone /admin/custom-instructions routes.  A banner communicates
 * this clearly so admins know to use the Org Context editor in the meantime.
 */
export function CustomInstructionsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const { message: toastMessage } = useToast();

  useEffect(() => {
    let cancelled = false;
    apiGet<OrgContext>('/admin/org-context')
      .then((ctx) => {
        if (!cancelled) setState({ kind: 'ready', instructions: ctx.customInstructions });
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section aria-labelledby="custom-instructions-heading">
      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      <h1 id="custom-instructions-heading">Custom Instructions</h1>

      {/* M2.1 coming-soon banner */}
      <div className="coming-soon-banner" role="note">
        <strong>Read-only — editing coming in M2.1.</strong>{' '}
        A textarea editor that saves custom instructions as a new version is
        being wired up once Dallas ships the dedicated backend routes next sprint.
        For now, use the Org Context editor to update instructions.
      </div>

      {state.kind === 'loading' && (
        <p className="placeholder-note">Loading custom instructions…</p>
      )}
      {state.kind === 'error' && (
        <p className="placeholder-note">
          Could not load custom instructions ({state.message}).
        </p>
      )}

      {state.kind === 'ready' && (
        <table>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Kind</th>
              <th scope="col">Applies to</th>
              <th scope="col">Tags</th>
              <th scope="col">Text</th>
            </tr>
          </thead>
          <tbody>
            {state.instructions.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">No custom instructions configured.</td>
              </tr>
            ) : (
              state.instructions.map((ci) => (
                <tr key={ci.id}>
                  <td><code>{ci.id}</code></td>
                  <td>{ci.kind}</td>
                  <td>{ci.appliesTo}</td>
                  <td>{ci.tags?.join(', ') ?? '—'}</td>
                  <td className="ci-text">{ci.text}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
