# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### M0 — Web App Scaffold (2026-05-26)

**Routing decisions**
React Router v6 with nested routes under `/admin/*`. `AdminLayout` renders a left-nav + `<Outlet>` so every admin page gets the nav for free. The index redirect at `/admin` → `/admin/org-context` avoids a blank admin landing page without duplicating content. Auth gates (`RequireAuth`, `RequireAdmin`) are layout components, not route wrappers, so they render their own feedback UI rather than silently redirecting.

**MSAL stub strategy**
`msal-config.ts` reads `VITE_ADVISOR_TENANT_ID` / `VITE_ADVISOR_CLIENT_ID` from env. If `VITE_ADVISOR_DEMO_MODE=true`, it stubs the config with a placeholder authority and exports `isDemoMode = true`. `RequireAuth` and `RequireAdmin` both check `isDemoMode` before inspecting token claims. This keeps the MSAL dependency fully present (not tree-shaken) so M1 auth wiring is a config change, not an architectural change. Real credentials are never in source.

**Shared-types coupling decision**
Dallas's `agent/src/data/models.ts` did not exist at scaffold time. Per the spec and IMPLEMENTATION_PLAN Data Model Summary, the full interface set was duplicated in `web/src/types/index.ts` with a TODO comment to unify via a shared package in M1. This is safer than a relative cross-workspace import that would break bundling and create circular workspace dependencies. The shapes match the IMPLEMENTATION_PLAN §Data Model Summary exactly — any divergence from Dallas's final file must be reconciled in M1.

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.
