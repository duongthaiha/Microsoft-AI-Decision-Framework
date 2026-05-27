import React, { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import type { OrgContext, EntitlementEntry } from '../../types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; entitlements: EntitlementEntry[] }
  | { kind: 'error'; message: string };

/**
 * EntitlementsPage — read-only list of entitlements from the live org context.
 *
 * Write actions (add/remove entitlement) are coming in M2.1 once Dallas ships
 * the standalone /admin/entitlements routes.  A banner communicates this to
 * admins so they know the data is correct but editing is temporarily blocked.
 */
export function EntitlementsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiGet<OrgContext>('/admin/org-context')
      .then((ctx) => {
        if (!cancelled) setState({ kind: 'ready', entitlements: ctx.entitlements });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section aria-labelledby="entitlements-heading">
      <h1 id="entitlements-heading">Entitlements</h1>

      {/* M2.1 coming-soon banner */}
      <div className="coming-soon-banner" role="note">
        <strong>Read-only — editing coming in M2.1.</strong>{' '}
        The backend routes for adding and removing entitlements are being shipped
        by Dallas in the next sprint. For now you can view the current entitlements
        and make changes via the Org Context editor.
      </div>

      {state.kind === 'loading' && (
        <p className="placeholder-note">Loading entitlements…</p>
      )}
      {state.kind === 'error' && (
        <p className="placeholder-note">
          Could not load entitlements ({state.message}).
        </p>
      )}

      {state.kind === 'ready' && (
        <table>
          <thead>
            <tr>
              <th scope="col">Product ID</th>
              <th scope="col">Display name</th>
              <th scope="col">Status</th>
              <th scope="col">Restriction notes</th>
              <th scope="col">Regions</th>
            </tr>
          </thead>
          <tbody>
            {state.entitlements.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">No entitlements configured.</td>
              </tr>
            ) : (
              state.entitlements.map((e, i) => (
                <tr key={i}>
                  <td><code>{e.productId}</code></td>
                  <td>{e.displayName}</td>
                  <td>{e.status}</td>
                  <td>{e.restrictionNotes ?? '—'}</td>
                  <td>{e.regions.join(', ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
