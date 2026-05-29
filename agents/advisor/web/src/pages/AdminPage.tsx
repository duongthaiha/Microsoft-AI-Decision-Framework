import { useState } from 'react';
import type { CustomerGuidanceDocument } from '@advisor/shared';
import { apiClient } from '../api/client';
import { GuidanceEditor } from '../components/Admin/GuidanceEditor';

function cloneNewVersion(doc: CustomerGuidanceDocument): CustomerGuidanceDocument {
  return {
    ...structuredClone(doc),
    instructionSetId: `${doc.instructionSetId}-v${doc.version + 1}`,
    version: doc.version + 1,
    activeFlag: false,
    activeFrom: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
    lastEditedBy: 'web-admin',
  };
}

export function AdminPage() {
  const [orgId, setOrgId] = useState('org-nfum');
  const [docs, setDocs] = useState<CustomerGuidanceDocument[]>([]);
  const [editing, setEditing] = useState<CustomerGuidanceDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const response = await apiClient.listGuidance(orgId);
    if (!response.ok) { setError(response.error.message); return; }
    setDocs(response.data); setError(null); setMessage(`Loaded ${response.data.length} guidance document(s).`);
  };
  const save = async (doc: CustomerGuidanceDocument) => {
    const response = await apiClient.updateGuidance(orgId, doc.instructionSetId, doc);
    if (!response.ok) { setError(response.error.message); return; }
    setDocs((current) => current.some((item) => item.instructionSetId === response.data.instructionSetId) ? current.map((item) => item.instructionSetId === response.data.instructionSetId ? response.data : item) : [...current, response.data]);
    setEditing(null); setError(null); setMessage('Guidance saved.');
  };
  const activate = async (doc: CustomerGuidanceDocument) => {
    const response = await apiClient.activateGuidance(orgId, doc.instructionSetId);
    if (!response.ok) { setError(response.error.message); return; }
    setDocs((current) => current.map((item) => ({ ...item, activeFlag: item.instructionSetId === doc.instructionSetId })));
    setMessage('Guidance version activated.');
  };
  const active = docs.find((doc) => doc.activeFlag) ?? docs[0];

  return (
    <>
      <section className="hero"><h1>Admin guidance</h1><p>Edit the customer-specific instructions that shape the advisor. Think of this as the local flight manual: same aircraft, different airspace.</p></section>
      <section className="card">
        <div className="btn-row">
          <input className="input" style={{ maxWidth: 360 }} value={orgId} onChange={(event) => setOrgId(event.target.value)} aria-label="Organization ID" />
          <button className="btn" type="button" onClick={load}>Load Instructions</button>
          <button className="btn secondary" type="button" onClick={() => active ? setEditing(cloneNewVersion(active)) : undefined} disabled={!active}>New Version</button>
        </div>
      </section>
      {error ? <div className="error">{error}</div> : null}{message ? <div className="success">{message}</div> : null}
      <section className="card table-wrap">
        <h2>Versions</h2>
        <table><thead><tr><th>Version</th><th>Active</th><th>Edited by</th><th>Edited at</th><th>Scope</th><th>Actions</th></tr></thead><tbody>
          {docs.map((doc) => <tr key={doc.instructionSetId}><td>{doc.version}</td><td>{doc.activeFlag ? 'Yes' : 'No'}</td><td>{doc.lastEditedBy ?? '-'}</td><td>{doc.lastEditedAt ?? '-'}</td><td>{doc.scope}</td><td><div className="btn-row"><button className="btn secondary" onClick={() => setEditing(doc)}>Edit</button><button className="btn" onClick={() => void activate(doc)} disabled={doc.activeFlag}>Activate</button></div></td></tr>)}
          {docs.length === 0 ? <tr><td colSpan={6} className="muted">No guidance loaded yet.</td></tr> : null}
        </tbody></table>
      </section>
      {editing ? <GuidanceEditor doc={editing} orgId={orgId} onSave={(doc) => void save(doc)} onCancel={() => setEditing(null)} /> : null}
    </>
  );
}
