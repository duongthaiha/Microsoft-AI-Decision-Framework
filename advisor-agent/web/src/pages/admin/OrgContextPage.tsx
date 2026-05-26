import React, { useState } from 'react';

type Tab = 'system-inventory' | 'entitlements' | 'custom-instructions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'system-inventory', label: 'System Inventory' },
  { id: 'entitlements', label: 'Entitlements' },
  { id: 'custom-instructions', label: 'Custom Instructions' },
];

export function OrgContextPage() {
  const [activeTab, setActiveTab] = useState<Tab>('system-inventory');

  return (
    <section aria-labelledby="org-context-heading">
      <h1 id="org-context-heading">Org Context</h1>
      <p>
        The organisation context shapes every recommendation. Keep it current
        and your advisor stays honest.
      </p>

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

      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
        >
          <table>
            <thead>
              <tr>
                {tab.id === 'system-inventory' && (
                  <>
                    <th scope="col">Name</th>
                    <th scope="col">Vendor</th>
                    <th scope="col">Category</th>
                    <th scope="col">Notes</th>
                  </>
                )}
                {tab.id === 'entitlements' && (
                  <>
                    <th scope="col">Product</th>
                    <th scope="col">Status</th>
                    <th scope="col">Restriction notes</th>
                    <th scope="col">Regions</th>
                  </>
                )}
                {tab.id === 'custom-instructions' && (
                  <>
                    <th scope="col">ID</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Applies to</th>
                    <th scope="col">Text</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="empty-state">
                  No data yet. {/* TODO M1: load from /api/admin/org-context */}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
