import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiPost } from '../api/client';

interface IntakeForm {
  projectName: string;
  businessOutcome: string;
  affectedUsers: string;
  desiredBehavior: string;
  dataSources: string;
  actions: string;
  urgency: '' | 'low' | 'medium' | 'high';
  constraints: string;
}

const initialForm: IntakeForm = {
  projectName: '',
  businessOutcome: '',
  affectedUsers: '',
  desiredBehavior: '',
  dataSources: '',
  actions: '',
  urgency: '',
  constraints: '',
};

type ChatState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'response'; payload: unknown }
  | { kind: 'error'; message: string };

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * SessionPage — intake form (left) + advisor chat (right).
 * Form fields per spec §4 and FR-001.
 */
export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<IntakeForm>(initialForm);
  const [chat, setChat] = useState<ChatState>({ kind: 'idle' });

  const update =
    <K extends keyof IntakeForm>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value as IntakeForm[K] }));

  const submitting = chat.kind === 'submitting';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChat({ kind: 'submitting' });

    const payload = {
      sessionId: id,
      title: form.projectName,
      businessOutcome: form.businessOutcome,
      targetUsers: form.affectedUsers,
      desiredBehavior: form.desiredBehavior,
      dataSources: splitList(form.dataSources),
      actions: splitList(form.actions),
      urgency: form.urgency || undefined,
      constraints: splitList(form.constraints),
    };

    try {
      const response = await apiPost<unknown>('/v1/responses', {
        input: payload,
      });
      setChat({ kind: 'response', payload: response });
    } catch (err) {
      setChat({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="session-layout">
      <aside className="session-intake" aria-label="Project intake form">
        <h1>New project idea</h1>
        <p className="session-id-note">Session: {id}</p>

        <form className="intake-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              type="text"
              placeholder="What are you calling this idea?"
              value={form.projectName}
              onChange={update('projectName')}
              disabled={submitting}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="business-outcome">Business outcome</label>
            <textarea
              id="business-outcome"
              placeholder="What does success look like for the business?"
              rows={3}
              value={form.businessOutcome}
              onChange={update('businessOutcome')}
              disabled={submitting}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="affected-users">Affected users</label>
            <input
              id="affected-users"
              type="text"
              placeholder="Who will use this? (e.g. sales team, customers, HR)"
              value={form.affectedUsers}
              onChange={update('affectedUsers')}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="desired-behavior">Desired behavior</label>
            <textarea
              id="desired-behavior"
              placeholder="What should the AI do? Describe the interaction."
              rows={3}
              value={form.desiredBehavior}
              onChange={update('desiredBehavior')}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="data-sources">Data sources</label>
            <input
              id="data-sources"
              type="text"
              placeholder="What data does the AI need access to? (comma-separated)"
              value={form.dataSources}
              onChange={update('dataSources')}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="actions">Actions</label>
            <input
              id="actions"
              type="text"
              placeholder="What should the AI be able to do? (read, write, trigger…)"
              value={form.actions}
              onChange={update('actions')}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="urgency">Urgency</label>
            <select
              id="urgency"
              value={form.urgency}
              onChange={update('urgency')}
              disabled={submitting}
            >
              <option value="">Select urgency</option>
              <option value="low">Low — exploring the idea</option>
              <option value="medium">Medium — planning to build soon</option>
              <option value="high">High — need this now</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="constraints">Constraints</label>
            <textarea
              id="constraints"
              placeholder="Budget, compliance, data sovereignty, team skills, existing tools…"
              rows={3}
              value={form.constraints}
              onChange={update('constraints')}
              disabled={submitting}
            />
          </div>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Start analysis'}
          </button>
        </form>
      </aside>

      <main className="session-chat" aria-label="Advisor conversation">
        {chat.kind === 'idle' && (
          <p className="placeholder-note">
            Fill in the intake on the left and choose <strong>Start analysis</strong>.
            The advisor's reasoning will stream here.
          </p>
        )}

        {chat.kind === 'submitting' && (
          <p className="placeholder-note">Sending your intake to the advisor…</p>
        )}

        {chat.kind === 'response' && (
          <section aria-label="Advisor response">
            <h2>Advisor response</h2>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(chat.payload, null, 2)}
            </pre>
          </section>
        )}

        {chat.kind === 'error' && (
          <section aria-label="Advisor error" role="alert">
            <h2>Advisor backend not ready</h2>
            <p className="placeholder-note">{chat.message}</p>
            <p className="placeholder-note">
              The intake reached the API but the response handler is still being wired
              (Hosted Agent Responses protocol — currently a 501 stub). Once Dallas's
              backend work lands, this panel will stream the advisor's recommendation.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
