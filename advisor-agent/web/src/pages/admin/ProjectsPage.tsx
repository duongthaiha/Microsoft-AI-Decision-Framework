import React, { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import type { Project } from '../../types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; projects: Project[] }
  | { kind: 'error'; message: string };

/**
 * ProjectsPage — paginated read-only list of all Projects.
 * Columns per FR-029: projectId, name, owner, status, technologies,
 * lastUpdated, linked request count.
 */
export function ProjectsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiGet<Project[]>('/admin/projects')
      .then((projects) => { if (!cancelled) setState({ kind: 'ready', projects }); })
      .catch((err) => {
        if (!cancelled)
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section aria-labelledby="projects-heading">
      <h1 id="projects-heading">Projects</h1>
      <p>Existing and accepted AI initiatives in the organisation&apos;s portfolio.</p>

      {state.kind === 'loading' && <p className="placeholder-note">Loading projects…</p>}
      {state.kind === 'error' && (
        <p className="placeholder-note">
          Could not load projects ({state.message}).
        </p>
      )}

      {state.kind !== 'loading' && (
        <table>
          <thead>
            <tr>
              <th scope="col">Project ID</th>
              <th scope="col">Name</th>
              <th scope="col">Owner</th>
              <th scope="col">Status</th>
              <th scope="col">Technologies</th>
              <th scope="col">Last updated</th>
              <th scope="col">Linked requests</th>
            </tr>
          </thead>
          <tbody>
            {state.kind === 'ready' && state.projects.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No projects yet.</td></tr>
            )}
            {state.kind === 'ready' && state.projects.map((p) => (
              <tr key={p.id}>
                <td><code>{p.projectId ?? p.id}</code></td>
                <td>{p.name}</td>
                <td>{p.owner}</td>
                <td>{p.status}</td>
                <td>{p.technologies.join(', ') || '—'}</td>
                <td>{new Date(p.updatedAt).toLocaleDateString()}</td>
                <td>{p.linkedRequestIds.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
