# advisor-agent-web

The React + Vite + TypeScript frontend for the AI Project Advisor Agent.

## What this is

A polished web app that puts the Microsoft AI Decision Framework in the hands of business users. You describe an idea; the advisor walks you through the framework, searches for similar projects, and delivers a readiness brief.

## Stack

- **React 18** + **TypeScript** — component model and type safety
- **Vite** — fast dev server, proxies `/api` to the agent on `:8080`
- **React Router v6** — client-side routing
- **MSAL React** — Microsoft Entra sign-in (bypassed in demo mode)

## Getting started

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

Set environment variables in a `.env.local` file (never commit this):

```
VITE_ADVISOR_TENANT_ID=<your-tenant-id>
VITE_ADVISOR_CLIENT_ID=<your-app-registration-client-id>
VITE_API_BASE_URL=/api
```

To run without Entra (demo mode):

```
VITE_ADVISOR_DEMO_MODE=true
```

## Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `HomePage` | Session list + new session CTA |
| `/session/:id` | `SessionPage` | Intake form + chat |
| `/brief/:id` | `BriefPage` | Readiness brief |
| `/admin/*` | `AdminLayout` | Requires `AdvisorAdmin` role |
| `/admin/org-context` | `OrgContextPage` | System inventory, entitlements, instructions |
| `/admin/requests` | `RequestsPage` | All requests, read-only |
| `/admin/projects` | `ProjectsPage` | All projects, read-only |

## Scripts

```bash
npm run dev       # Dev server
npm run build     # tsc + vite build
npm run preview   # Preview production build
npm run lint      # ESLint
npm run test      # Vitest
```

## M0 status

All pages are **placeholder skeletons**. API calls, form logic, and chat wiring are deferred to M1.
