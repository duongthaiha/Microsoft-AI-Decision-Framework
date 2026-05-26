import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { apiPost } from '../api/client';
import type { AdvisorResponse } from '../types';

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

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildUserSummary(form: IntakeForm): string {
  const lines: string[] = [`**New project: ${form.projectName}**`];
  if (form.businessOutcome) lines.push(`\n${form.businessOutcome}`);
  if (form.affectedUsers) lines.push(`\n**Users:** ${form.affectedUsers}`);
  if (form.desiredBehavior) lines.push(`**Desired behavior:** ${form.desiredBehavior}`);
  if (form.dataSources) lines.push(`**Data sources:** ${form.dataSources}`);
  if (form.actions) lines.push(`**Actions:** ${form.actions}`);
  if (form.urgency) lines.push(`**Urgency:** ${form.urgency}`);
  if (form.constraints) lines.push(`**Constraints:** ${form.constraints}`);
  return lines.join('\n');
}

function extractAssistantText(response: AdvisorResponse): string {
  try {
    const item = response?.output?.[0];
    const text = item?.content?.[0]?.text;
    if (typeof text === 'string' && text.length > 0) return text;
  } catch {
    // fall through
  }
  return '_The advisor returned a response but the text could not be extracted._';
}

/**
 * SessionPage — intake form (left) + conversational chat (right).
 * Form fields per spec §4 and FR-001.
 * Renders Hosted Agent Responses protocol shape (M1).
 */
export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<IntakeForm>(initialForm);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [intakeCollapsed, setIntakeCollapsed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest turn
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, submitting]);

  const update =
    <K extends keyof IntakeForm>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value as IntakeForm[K] }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const userText = buildUserSummary(form);
    const now = new Date().toISOString();
    setTurns((prev) => [...prev, { role: 'user', text: userText, timestamp: now }]);

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
      const response = await apiPost<AdvisorResponse>('/v1/responses', { input: payload });
      const assistantText = extractAssistantText(response);
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', text: assistantText, timestamp: new Date().toISOString() },
      ]);
      setIntakeCollapsed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      // Keep the user turn visible so context isn't lost on error
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `_Backend not ready yet — ${msg}. Once Dallas's reasoning loop lands, the advisor's recommendation will appear here._`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  const hasConversation = turns.length > 0;

  return (
    <div className="session-layout">
      <aside
        className={`session-intake${intakeCollapsed ? ' session-intake--collapsed' : ''}`}
        aria-label="Project intake form"
      >
        <div className="intake-header">
          <h1>{form.projectName || 'New project idea'}</h1>
          <p className="session-id-note">Session: {id}</p>
          {hasConversation && (
            <button
              type="button"
              className="intake-toggle"
              onClick={() => setIntakeCollapsed((c) => !c)}
              aria-expanded={!intakeCollapsed}
            >
              {intakeCollapsed ? 'Edit intake' : 'Collapse'}
            </button>
          )}
        </div>

        {!intakeCollapsed && (
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
              {submitting ? 'Sending…' : hasConversation ? 'Re-analyse' : 'Start analysis'}
            </button>
          </form>
        )}
      </aside>

      <main className="session-chat" aria-label="Advisor conversation" aria-live="polite">
        {!hasConversation && !submitting && (
          <p className="placeholder-note">
            Fill in the intake on the left and choose <strong>Start analysis</strong>.
            The advisor's recommendation will appear here.
          </p>
        )}

        {turns.map((turn, i) => (
          <div
            key={i}
            className={`chat-turn chat-turn--${turn.role}`}
            aria-label={turn.role === 'user' ? 'Your message' : 'Advisor message'}
          >
            <div className="chat-turn__meta">
              <span className="chat-turn__role">
                {turn.role === 'user' ? 'You' : 'Advisor'}
              </span>
              <span className="chat-turn__timestamp">
                {new Date(turn.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="chat-bubble chat-bubble--${turn.role}">
              {turn.role === 'assistant' ? (
                <div className="chat-markdown">
                  <ReactMarkdown>{turn.text}</ReactMarkdown>
                </div>
              ) : (
                <div className="chat-markdown">
                  <ReactMarkdown>{turn.text}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {submitting && (
          <div className="chat-turn chat-turn--assistant" aria-label="Advisor thinking">
            <div className="chat-turn__meta">
              <span className="chat-turn__role">Advisor</span>
            </div>
            <div className="chat-bubble chat-bubble--assistant chat-bubble--thinking">
              <span className="thinking-dots" aria-label="Thinking">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="chat-error" role="alert">
            {errorMsg}
          </p>
        )}

        <div ref={chatEndRef} />
      </main>
    </div>
  );
}
