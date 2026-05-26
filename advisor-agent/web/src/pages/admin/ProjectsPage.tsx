import React from 'react';

/**
 * ProjectsPage — paginated read-only list of all Projects.
 * Columns per FR-029: projectId, name, owner, status, technologies,
 * lastUpdated, linked request count.
 * TODO M1: load from /api/admin/projects with pagination.
 */
export function ProjectsPage() {
  return (
    <section aria-labelledby="projects-heading">
      <h1 id="projects-heading">Projects</h1>
      <p>Existing and accepted AI initiatives in the organisation&apos;s portfolio.</p>

      <div className="table-controls">
        {/* TODO M1: filter / sort controls */}
      </div>

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
          <tr>
            <td colSpan={7} className="empty-state">
              No projects yet.
            </td>
          </tr>
        </tbody>
      </table>

      <div className="pagination" aria-label="Pagination">
        {/* TODO M1: pagination controls */}
      </div>
    </section>
  );
}
