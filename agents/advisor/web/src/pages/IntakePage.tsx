import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IntakeAnswerMap, IntakeForm as IntakeFormType } from '@advisor/shared';
import { IntakeForm } from '../components/IntakeForm/IntakeForm';
import { useSession } from '../hooks/useSession';
import formDef from '../data/intake-form.json';

export function IntakePage() {
  const [orgId, setOrgId] = useState('org-nfum');
  const navigate = useNavigate();
  const session = useSession();
  const submit = async (answers: IntakeAnswerMap) => {
    const sessionId = await session.createSession(orgId.trim() || 'org-nfum');
    if (!sessionId) return;
    const ok = await session.submitIntake(sessionId, answers);
    if (ok) navigate(`/session/${sessionId}`);
  };
  return (
    <>
      <section className="hero">
        <span className="badge">Outcome → Behavior → Platform</span>
        <h1>Let's find the right Microsoft AI technology for you</h1>
        <p>Tell us the business problem, the user moment, and the guardrails. The advisor turns that intake into a grounded conversation and recommendation.</p>
      </section>
      <section className="card">
        <div className="field">
          <label htmlFor="orgId">Organization ID</label>
          <input id="orgId" className="input" value={orgId} onChange={(event) => setOrgId(event.target.value)} placeholder="org-nfum" />
          <span className="help">Used to load custom instruction guidance. Try org-nfum for the sample.</span>
        </div>
      </section>
      {session.error ? <div className="error">{session.error}</div> : null}
      <IntakeForm form={formDef as IntakeFormType} onSubmit={submit} isLoading={session.isLoading} />
    </>
  );
}
