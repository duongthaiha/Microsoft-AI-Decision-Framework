import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppHeader } from './components/AppHeader';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { BriefPage } from './pages/BriefPage';
import { ReviewerPage } from './pages/ReviewerPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { OrgContextPage } from './pages/admin/OrgContextPage';
import { EntitlementsPage } from './pages/admin/EntitlementsPage';
import { CustomInstructionsPage } from './pages/admin/CustomInstructionsPage';
import { RequestsPage } from './pages/admin/RequestsPage';
import { ProjectsPage } from './pages/admin/ProjectsPage';

export function App() {
  return (
    <>
      <AppHeader />
      <RequireAuth>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/brief/:id" element={<BriefPage />} />
          <Route path="/reviewer" element={<ReviewerPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/org-context" replace />} />
            <Route path="org-context" element={<OrgContextPage />} />
            <Route path="entitlements" element={<EntitlementsPage />} />
            <Route path="custom-instructions" element={<CustomInstructionsPage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
          </Route>
        </Routes>
      </RequireAuth>
    </>
  );
}
