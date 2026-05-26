import React from 'react';
import { useParams } from 'react-router-dom';

/**
 * SessionPage — intake form (left) + advisor chat (right).
 * Form fields per spec §4 and FR-001. Non-functional in M0 — renders shape only.
 */
export function SessionPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="session-layout">
      <aside className="session-intake" aria-label="Project intake form">
        <h1>New project idea</h1>
        <p className="session-id-note">Session: {id}</p>

        <form className="intake-form" onSubmit={(e) => e.preventDefault()}>
          <div className="form-field">
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              type="text"
              placeholder="What are you calling this idea?"
              disabled
            />
          </div>

          <div className="form-field">
            <label htmlFor="business-outcome">Business outcome</label>
            <textarea
              id="business-outcome"
              placeholder="What does success look like for the business?"
              rows={3}
              disabled
            />
          </div>

          <div className="form-field">
            <label htmlFor="affected-users">Affected users</label>
            <input
              id="affected-users"
              type="text"
              placeholder="Who will use this? (e.g. sales team, customers, HR)"
              disabled
            />
          </div>

          <div className="form-field">
            <label htmlFor="desired-behavior">Desired behavior</label>
            <textarea
              id="desired-behavior"
              placeholder="What should the AI do? Describe the interaction."
              rows={3}
              disabled
            />
          </div>

          <div className="form-field">
            <label htmlFor="data-sources">Data sources</label>
            <input
              id="data-sources"
              type="text"
              placeholder="What data does the AI need access to?"
              disabled
            />
          </div>

          <div className="form-field">
            <label htmlFor="actions">Actions</label>
            <input
              id="actions"
              type="text"
              placeholder="What should the AI be able to do? (read, write, trigger…)"
              disabled
            />
          </div>

          <div className="form-field">
            <label htmlFor="urgency">Urgency</label>
            <select id="urgency" disabled>
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
              disabled
            />
          </div>

          <button type="submit" disabled>
            Start analysis
          </button>
        </form>
      </aside>

      <main className="session-chat" aria-label="Advisor conversation">
        <p className="placeholder-note">
          {/* M1: wire up Copilot SDK / Hosted Agent chat stream here */}
          Advisor chat will appear here once the session is started.
        </p>
      </main>
    </div>
  );
}
