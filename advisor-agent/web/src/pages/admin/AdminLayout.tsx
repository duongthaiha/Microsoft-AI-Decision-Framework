import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { RequireAdmin } from '../../auth/RequireAdmin';

export function AdminLayout() {
  return (
    <RequireAdmin>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Admin navigation">
          <h2>Admin</h2>
          <ul>
            <li>
              <NavLink
                to="/admin/org-context"
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                Org Context
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/admin/requests"
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                Requests
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/admin/projects"
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                Projects
              </NavLink>
            </li>
          </ul>
        </nav>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </RequireAdmin>
  );
}
