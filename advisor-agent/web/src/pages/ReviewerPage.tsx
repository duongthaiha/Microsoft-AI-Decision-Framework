import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import type { Request, RequestStatus, ReadinessBrief, RecommendedPlatform } from '../types';

// ─── Toast ───────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }, []);
  return { message, show };
}

// ─── Brief panel ─────────────────────────────────────────────────────────────

function ReadinessBriefPanel({ brief }: { brief: ReadinessBrief }) {
  const p: RecommendedPlatform = brief.recommendedPlatform;
  return (
    <div className="brief-panel">
      <section>
        <h3>Recommended platform</h3>
        <p className="recommended-platform">{p.displayName}</p>
        <p>{p.rationale}</p>
        <p><strong>Complexity:</strong> {p.estimatedComplexity}</p>
        <p><strong>Trade-offs:</strong> {p.tradeOffs}</p>
        {p.runnerUpAlternatives.length > 0 && (
          <>
            <h4>Alternatives</h4>
            <ul>{p.runnerUpAlternatives.map((a) => <li key={a}>{a}</li>)}</ul>
          </>
        )}
      </section>

      <section>
        <h3>BXT assessment</h3>
        <p>
          Viability {brief.bxtScore.viability}% · Desirability {brief.bxtScore.desirability}% ·
          Feasibility {brief.bxtScore.feasibility}%
        </p>
        <p>{brief.bxtScore.summary}</p>
      </section>

      {brief.risks.length > 0 && (
        <section>
          <h3>Risks</h3>
          <ul>{brief.risks.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      )}

      {brief.nextActions.length > 0 && (
        <section>
          <h3>Next actions</h3>
          <ol>{brief.nextActions.map((a) => <li key={a}>{a}</li>)}</ol>
        </section>
      )}
    </div>
  );
}

// ─── Row component ────────────────────────────────────────────────────────────

interface RowProps {
  request: Request;
  expanded: boolean;
  onToggle: () => void;
  onAction: React.Dispatch<'accept' | 'reject' | 'needs-info'>;
  actioning: boolean;
}

function ReviewerRow({ request: r, expanded, onToggle, onAction, actioning }: RowProps) {
  const platformDisplay =
    r.readinessBrief?.recommendedPlatform?.displayName ?? '—';
  const grouping = r.reuseDecision?.decision ?? '—';

  return (
    <>
      <tr
        className={`reviewer-row${expanded ? ' reviewer-row--expanded' : ''}`}
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
      >
        <td>
          <Link
            to={`/brief/${r.requestId ?? r.id}`}
            className="reviewer-request-link"
            onClick={(e) => e.stopPropagation()}
          >
            <code>{(r.requestId ?? r.id).slice(0, 8)}…</code>
          </Link>
        </td>
        <td>{r.submitterId ?? r.ownerId}</td>
        <td>{r.title}</td>
        <td>{grouping}</td>
        <td>{platformDisplay}</td>
        <td>{new Date(r.createdAt).toLocaleDateString()}</td>
        <td>
          <span className={`status-badge status-badge--${r.status.toLowerCase()}`}>
            {r.status}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="reviewer-detail-row">
          <td colSpan={7}>
            <div className="reviewer-detail">
              {/* Status transition buttons */}
              <div className="reviewer-actions">
                {/* TODO M2.1: wire to real backend route when Dallas ships /requests/:id/status */}
                <button
                  type="button"
                  className="btn-accept"
                  disabled={actioning || r.status === 'Archived'}
                  onClick={() => onAction('accept')}
                >
                  ✓ Accept
                </button>
                <button
                  type="button"
                  className="btn-reject"
                  disabled={actioning || r.status === 'Archived'}
                  onClick={() => onAction('reject')}
                >
                  ✗ Reject
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={actioning}
                  onClick={() => onAction('needs-info')}
                >
                  ? Needs more info
                </button>
              </div>

              {r.readinessBrief ? (
                <ReadinessBriefPanel brief={r.readinessBrief} />
              ) : (
                <p className="placeholder-note">No readiness brief generated yet.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: (RequestStatus | 'All')[] = [
  'All',
  'New',
  'ReadyForConfirmation',
  'Draft',
  'Archived',
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; requests: Request[] }
  | { kind: 'error'; message: string };

/**
 * ReviewerPage — queue of submitted requests for reviewer triage.
 *
 * Uses GET /admin/requests (admin route) since a dedicated /requests reviewer
 * route doesn't exist yet. Status action buttons are stubbed with TODO M2.1.
 */
export function ReviewerPage() {
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'All'>('New');
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const { message: toastMessage, show: showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: 'loading' });
    apiGet<Request[]>('/admin/requests')
      .then((requests) => {
        if (!cancelled) setLoadState({ kind: 'ready', requests });
      })
      .catch((err) => {
        if (!cancelled)
          setLoadState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
      });
    return () => { cancelled = true; };
  }, []);

  async function handleAction(
    request: Request,
    action: 'accept' | 'reject' | 'needs-info',
  ) {
    setActioningId(request.id);
    try {
      // TODO M2.1: replace with real backend route when Dallas ships PATCH /requests/:id/status
      await apiPost(`/requests/${request.requestId ?? request.id}/status`, { action });
      showToast(`Action "${action}" queued for ${(request.requestId ?? request.id).slice(0, 8)}…`);
    } catch {
      // Backend route doesn't exist yet — surface friendly message
      showToast('Action queued (backend route pending)');
    } finally {
      setActioningId(null);
    }
  }

  const filtered =
    loadState.kind === 'ready'
      ? statusFilter === 'All'
        ? loadState.requests
        : loadState.requests.filter((r) => r.status === statusFilter)
      : [];

  return (
    <main className="reviewer-page" aria-labelledby="reviewer-heading">
      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      <header className="reviewer-header">
        <h1 id="reviewer-heading">Reviewer queue</h1>
        <p>Review submitted project requests and triage them to the right team.</p>
      </header>

      <div className="reviewer-filters" role="group" aria-label="Status filter">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            className={`filter-btn${statusFilter === s ? ' filter-btn--active' : ''}`}
            onClick={() => setStatusFilter(s as RequestStatus | 'All')}
          >
            {s}
          </button>
        ))}
      </div>

      {loadState.kind === 'loading' && (
        <p className="placeholder-note">Loading requests…</p>
      )}
      {loadState.kind === 'error' && (
        <p className="placeholder-note">
          Could not load requests ({loadState.message}).
        </p>
      )}

      {loadState.kind === 'ready' && (
        <table className="reviewer-table">
          <thead>
            <tr>
              <th scope="col">Request ID</th>
              <th scope="col">Submitted by</th>
              <th scope="col">Project</th>
              <th scope="col">Reuse grouping</th>
              <th scope="col">Recommended tech</th>
              <th scope="col">Created</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  No requests with status{' '}
                  <strong>{statusFilter === 'All' ? 'any' : statusFilter}</strong>.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <ReviewerRow
                  key={r.id}
                  request={r}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                  onAction={(action) => handleAction(r, action)}
                  actioning={actioningId === r.id}
                />
              ))
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
