import React, { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import type { OrgContext } from '../../types';

type Tab = 'system-inventory' | 'entitlements' | 'custom-instructions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'system-inventory', label: 'System Inventory' },
  { id: 'entitlements', label: 'Entitlements' },
  { id: 'custom-instructions', label: 'Custom Instructions' },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: OrgContext }
  | { kind: 'error'; message: string };

export function OrgContextPage() {
  const [activeTab, setActiveTab] = useState<Tab>('system-inventory');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiGet<OrgContext>('/admin/org-context')
      .then((data) => { if (!cancelled) setState({ kind: 'ready', data }); })
      .catch((err) => {
        if (!cancelled)
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section aria-labelledby="org-context-heading">
      <h1 id="org-context-heading">Org Context</h1>
      <p>
        The organisation context shapes every recommendation. Keep it current
        and your advisor stays honest.
      </p>

      {state.kind === 'loading' && <p className="placeholder-note">Loading org context…</p>}
      {state.kind === 'error' && (
        <p className="placeholder-note">
          Could not load org context ({state.message}).
        </p>
      )}

      {state.kind === 'ready' && (
        <>
          <div className="tab-bar" role="tablist" aria-label="Org context sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? 'tab active' : 'tab'}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id="tabpanel-system-inventory"
            aria-labelledby="tab-system-inventory"
            hidden={activeTab !== 'system-inventory'}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Category</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {state.data.systemInventory.length === 0 ? (
                  <tr><td colSpan={4} className="empty-state">No entries.</td></tr>
                ) : (
                  state.data.systemInventory.map((entry, i) => (
                    <tr key={i}>
                      <td>{entry.name}</td>
                      <td>{entry.vendor}</td>
                      <td>{entry.category}</td>
                      <td>{entry.notes ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            role="tabpanel"
            id="tabpanel-entitlements"
            aria-labelledby="tab-entitlements"
            hidden={activeTab !== 'entitlements'}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Display name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Restriction notes</th>
                  <th scope="col">Regions</th>
                </tr>
              </thead>
              <tbody>
                {state.data.entitlements.length === 0 ? (
                  <tr><td colSpan={5} className="empty-state">No entries.</td></tr>
                ) : (
                  state.data.entitlements.map((e, i) => (
                    <tr key={i}>
                      <td>{e.productId}</td>
                      <td>{e.displayName}</td>
                      <td>{e.status}</td>
                      <td>{e.restrictionNotes ?? '—'}</td>
                      <td>{e.regions.join(', ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            role="tabpanel"
            id="tabpanel-custom-instructions"
            aria-labelledby="tab-custom-instructions"
            hidden={activeTab !== 'custom-instructions'}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Applies to</th>
                  <th scope="col">Text</th>
                </tr>
              </thead>
              <tbody>
                {state.data.customInstructions.length === 0 ? (
                  <tr><td colSpan={4} className="empty-state">No entries.</td></tr>
                ) : (
                  state.data.customInstructions.map((ci) => (
                    <tr key={ci.id}>
                      <td><code>{ci.id}</code></td>
                      <td>{ci.kind}</td>
                      <td>{ci.appliesTo}</td>
                      <td>{ci.text}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
