import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import type { Session } from '../types';

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; sessions: Session[] }
  | { kind: 'error'; message: string };

export function HomePage() {
  const navigate = useNavigate();
  const [listState, setListState] = useState<ListState>({ kind: 'loading' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<Session[]>('/sessions')
      .then((sessions) => {
        if (!cancelled) setListState({ kind: 'ready', sessions });
      })
      .catch((err) => {
        if (!cancelled)
          setListState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
      });
    return () => { cancelled = true; };
  }, []);

  async function handleNewSession() {
    setCreating(true);
    try {
      const session = await apiPost<Session>('/sessions', { title: 'New session' });
      navigate(`/session/${session.id ?? session.sessionId}`);
    } catch (err) {
      // Backend not yet deployed — navigate to the stub route so the form is still usable.
      console.warn('[HomePage] POST /sessions failed, using stub route:', err);
      navigate('/session/new');
    } finally {
      setCreating(false);
    }
  }

  const sessions = listState.kind === 'ready' ? listState.sessions : [];

  return (
    <main className="home-page">
      <header className="home-header">
        <h1>AI Project Advisor</h1>
        <p className="home-tagline">
          Have an AI idea? Let&apos;s see if Microsoft already builds it, what
          we&apos;d recommend, and what it&apos;ll take.
        </p>
      </header>

      <section aria-labelledby="new-session-heading">
        <h2 id="new-session-heading" className="visually-hidden">
          Start a new session
        </h2>
        <button
          type="button"
          className="cta-button"
          onClick={handleNewSession}
          disabled={creating}
        >
          {creating ? 'Creating…' : 'Start a new session'}
        </button>
      </section>

      <section aria-labelledby="sessions-heading" className="sessions-list">
        <h2 id="sessions-heading">Your sessions</h2>

        {listState.kind === 'loading' && (
          <p className="placeholder-note">Loading sessions…</p>
        )}

        {listState.kind === 'error' && (
          <p className="placeholder-note">
            Could not load sessions ({listState.message}). The backend may not be deployed yet.
          </p>
        )}

        {listState.kind === 'ready' && sessions.length === 0 && (
          <p className="empty-state">
            Nothing here yet. Start a session above and the advisor will walk
            you through the Microsoft AI Decision Framework.
          </p>
        )}

        {listState.kind === 'ready' && sessions.length > 0 && (
          <ul className="sessions-list__items">
            {sessions.map((s) => (
              <li key={s.id} className="sessions-list__item">
                <Link to={`/session/${s.id}`} className="sessions-list__link">
                  <span className="sessions-list__title">{s.title || 'Untitled session'}</span>
                  <span className="sessions-list__meta">
                    {s.status} · {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
