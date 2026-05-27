import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { streamResponses } from '../api/client';
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

interface ToolCallChip {
  toolName: string;
  args?: unknown;
  resultSummary?: string;
  done: boolean;
  collapsed: boolean;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  toolCalls?: ToolCallChip[];
  isError?: boolean;
  retryPayload?: RequestPayload;
}

interface RequestPayload {
  sessionId?: string;
  title: string;
  businessOutcome: string;
  targetUsers: string;
  desiredBehavior: string;
  dataSources: string[];
  actions: string[];
  urgency?: string;
  constraints: string[];
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

function ToolChip({ chip, onToggle }: { chip: ToolCallChip; onToggle: () => void }) {
  return (
    <div className={`tool-chip${chip.done ? ' tool-chip--done' : ''}`}>
      <button type="button" className="tool-chip__header" onClick={onToggle}>
        <span className="tool-chip__icon">🔧</span>
        <span className="tool-chip__name">
          {chip.done ? `${chip.toolName} ✓` : `calling ${chip.toolName}…`}
        </span>
        <span className="tool-chip__toggle">{chip.collapsed ? '▶' : '▼'}</span>
      </button>
      {!chip.collapsed && (
        <div className="tool-chip__body">
          {chip.args !== undefined && (
            <pre className="tool-chip__args">{JSON.stringify(chip.args, null, 2)}</pre>
          )}
          {chip.resultSummary && (
            <p className="tool-chip__result">{chip.resultSummary}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * SessionPage — intake form (left) + conversational chat (right).
 * M2: consumes SSE stream from /v1/responses via streamResponses().
 * Graceful fallback to batched JSON when backend hasn't enabled SSE yet.
 */
export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<IntakeForm>(initialForm);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingTools, setStreamingTools] = useState<ToolCallChip[]>([]);
  const [intakeCollapsed, setIntakeCollapsed] = useState(false);

  const [chatInput, setChatInput] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest content
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, submitting, streamingText]);

  // Abort stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const update =
    <K extends keyof IntakeForm>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value as IntakeForm[K] }));

  const runStream = useCallback(async (payload: RequestPayload) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSubmitting(true);
    setStreamingText('');
    setStreamingTools([]);

    let accText = '';
    let accTools: ToolCallChip[] = [];

    try {
      const gen = streamResponses('/v1/responses', { input: payload }, controller.signal);

      for await (const item of gen) {
        if (controller.signal.aborted) break;

        if (item.type === '__json_fallback__') {
          // Batched JSON fallback path (backend not yet streaming)
          const assistantText = extractAssistantText(item.data as AdvisorResponse);
          setTurns((prev) => [
            ...prev,
            { role: 'assistant', text: assistantText, timestamp: new Date().toISOString() },
          ]);
          setStreamingText('');
          setStreamingTools([]);
          setSubmitting(false);
          setIntakeCollapsed(true);
          return;
        }

        switch (item.type) {
          case 'turn.created':
            break;

          case 'tool.invoked': {
            const chip: ToolCallChip = {
              toolName: item.toolName,
              args: item.args,
              done: false,
              collapsed: false,
            };
            accTools = [...accTools, chip];
            setStreamingTools([...accTools]);
            break;
          }

          case 'tool.result': {
            accTools = accTools.map((c) =>
              c.toolName === item.toolName && !c.done
                ? { ...c, resultSummary: item.resultSummary, done: true, collapsed: true }
                : c,
            );
            setStreamingTools([...accTools]);
            break;
          }

          case 'text.delta':
            accText += item.text;
            setStreamingText(accText);
            break;

          case 'turn.completed':
            // finalText may differ if server post-processed; prefer it if present
            if (item.finalText) accText = item.finalText;
            break;

          case 'response.done': {
            const finalTurn: Turn = {
              role: 'assistant',
              text: accText || '_No response text received._',
              timestamp: new Date().toISOString(),
              toolCalls: accTools,
            };
            setTurns((prev) => [...prev, finalTurn]);
            setStreamingText('');
            setStreamingTools([]);
            setSubmitting(false);
            setIntakeCollapsed(true);
            break;
          }

          case 'error': {
            const errorTurn: Turn = {
              role: 'assistant',
              text: `**Error ${item.code}:** ${item.message}`,
              timestamp: new Date().toISOString(),
              isError: true,
              retryPayload: payload,
            };
            setTurns((prev) => [...prev, errorTurn]);
            setStreamingText('');
            setStreamingTools([]);
            setSubmitting(false);
            break;
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `_Backend not ready yet — ${msg}. Once Dallas's reasoning loop lands, the advisor's recommendation will appear here._`,
          timestamp: new Date().toISOString(),
          retryPayload: payload,
        },
      ]);
      setStreamingText('');
      setStreamingTools([]);
      setSubmitting(false);
    }
  }, []);

  // Freeform chat send — always available in the right panel
  function handleChatSend(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || submitting) return;

    setChatInput('');
    setTurns((prev) => [...prev, { role: 'user', text, timestamp: new Date().toISOString() }]);

    const payload: RequestPayload = {
      sessionId: id && id !== 'new' ? id : undefined,
      title: form.projectName || text.slice(0, 80),
      businessOutcome: text,
      targetUsers: form.affectedUsers,
      desiredBehavior: form.desiredBehavior,
      dataSources: splitList(form.dataSources),
      actions: splitList(form.actions),
      urgency: form.urgency || undefined,
      constraints: splitList(form.constraints),
    };

    runStream(payload);
  }

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend(e as unknown as React.FormEvent);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const userText = buildUserSummary(form);
    setTurns((prev) => [...prev, { role: 'user', text: userText, timestamp: new Date().toISOString() }]);

    const payload: RequestPayload = {
      sessionId: id && id !== 'new' ? id : undefined,
      title: form.projectName,
      businessOutcome: form.businessOutcome,
      targetUsers: form.affectedUsers,
      desiredBehavior: form.desiredBehavior,
      dataSources: splitList(form.dataSources),
      actions: splitList(form.actions),
      urgency: form.urgency || undefined,
      constraints: splitList(form.constraints),
    };

    await runStream(payload);
  }

  function toggleStreamingTool(index: number) {
    setStreamingTools((prev) =>
      prev.map((c, i) => (i === index ? { ...c, collapsed: !c.collapsed } : c)),
    );
  }

  const hasConversation = turns.length > 0;
  const isStreaming = submitting && (streamingText.length > 0 || streamingTools.length > 0);

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

      <main className="session-chat" aria-label="Advisor conversation">
        <div className="chat-messages-scroll" aria-live="polite">
          {!hasConversation && !submitting && (
            <p className="placeholder-note">
              Fill in the intake on the left and choose <strong>Start analysis</strong>,
              or type a message below to start chatting with the advisor.
            </p>
          )}

        {turns.map((turn, i) => (
          <div
            key={i}
            className={`chat-turn chat-turn--${turn.role}${turn.isError ? ' chat-turn--error' : ''}`}
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

            {turn.toolCalls && turn.toolCalls.length > 0 && (
              <div className="chat-tool-chips">
                {turn.toolCalls.map((chip, ci) => (
                  <ToolChip
                    key={ci}
                    chip={chip}
                    onToggle={() =>
                      setTurns((prev) =>
                        prev.map((t, ti) =>
                          ti !== i
                            ? t
                            : {
                                ...t,
                                toolCalls: t.toolCalls?.map((c, cj) =>
                                  cj === ci ? { ...c, collapsed: !c.collapsed } : c,
                                ),
                              },
                        ),
                      )
                    }
                  />
                ))}
              </div>
            )}

            <div className={`chat-bubble chat-bubble--${turn.role}`}>
              <div className="chat-markdown">
                <ReactMarkdown>{turn.text}</ReactMarkdown>
              </div>
              {turn.isError && turn.retryPayload && (
                <button
                  type="button"
                  className="chat-retry-btn"
                  disabled={submitting}
                  onClick={() => {
                    if (turn.retryPayload) runStream(turn.retryPayload);
                  }}
                >
                  ↩ Retry
                </button>
              )}
              {!turn.isError && turn.retryPayload && (
                <button
                  type="button"
                  className="chat-retry-btn"
                  disabled={submitting}
                  onClick={() => {
                    if (turn.retryPayload) runStream(turn.retryPayload);
                  }}
                >
                  ↩ Retry
                </button>
              )}
            </div>
          </div>
        ))}

        {/* In-progress streaming bubble */}
        {submitting && (
          <div className="chat-turn chat-turn--assistant" aria-label="Advisor thinking">
            <div className="chat-turn__meta">
              <span className="chat-turn__role">Advisor</span>
            </div>

            {streamingTools.length > 0 && (
              <div className="chat-tool-chips">
                {streamingTools.map((chip, i) => (
                  <ToolChip key={i} chip={chip} onToggle={() => toggleStreamingTool(i)} />
                ))}
              </div>
            )}

            <div className="chat-bubble chat-bubble--assistant">
              {isStreaming ? (
                <div className="chat-markdown">
                  <ReactMarkdown>{streamingText}</ReactMarkdown>
                  <span className="streaming-cursor" aria-hidden="true" />
                </div>
              ) : (
                <div className="chat-bubble--thinking">
                  <span className="thinking-dots" aria-label="Thinking">
                    <span /><span /><span />
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
        </div>{/* end .chat-messages-scroll */}

        {/* Chat composer — always visible so the user can always send a message */}
        <form className="chat-composer" onSubmit={handleChatSend} aria-label="Send a message">
          <textarea
            ref={chatInputRef}
            className="chat-composer__input"
            placeholder="Ask the advisor a question… (Enter to send, Shift+Enter for new line)"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            disabled={submitting}
            rows={2}
            aria-label="Message input"
          />
          <button
            type="submit"
            className="chat-composer__send"
            disabled={submitting || !chatInput.trim()}
            aria-label="Send message"
          >
            {submitting ? '…' : 'Send'}
          </button>
        </form>
      </main>
    </div>
  );
}
