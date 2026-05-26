import React from 'react';

/**
 * RequestsPage — paginated read-only list of all Requests across users.
 * Columns per FR-027: requestId, ownerId, sessionId, status, createdAt,
 * submittedAt, linkedProjectId, orgContextVersion.
 * TODO M1: load from /api/admin/requests with filter/sort/pagination.
 */
export function RequestsPage() {
  return (
    <section aria-labelledby="requests-heading">
      <h1 id="requests-heading">Requests</h1>
      <p>Every project idea that has come through the advisor, across all users.</p>

      <div className="table-controls">
        {/* TODO M1: filter by status / owner / date range / project / org-context version */}
      </div>

      <table>
        <thead>
          <tr>
            <th scope="col">Request ID</th>
            <th scope="col">Owner</th>
            <th scope="col">Session ID</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
            <th scope="col">Submitted</th>
            <th scope="col">Linked project</th>
            <th scope="col">Org context</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={8} className="empty-state">
              No requests yet.
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
