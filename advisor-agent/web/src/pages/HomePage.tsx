import React from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '../types';

// Placeholder session list — replaced by API call in M1.
const placeholderSessions: Session[] = [];

export function HomePage() {
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
        <Link to="/session/new" className="cta-button" role="button">
          Start a new session
        </Link>
      </section>

      <section aria-labelledby="sessions-heading" className="sessions-list">
        <h2 id="sessions-heading">Your sessions</h2>
        {placeholderSessions.length === 0 ? (
          <p className="empty-state">
            Nothing here yet. Start a session above and the advisor will walk
            you through the Microsoft AI Decision Framework.
          </p>
        ) : (
          <ul>
            {placeholderSessions.map((s) => (
              <li key={s.id}>
                <Link to={`/session/${s.id}`}>{s.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
