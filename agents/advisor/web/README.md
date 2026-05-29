# AI Framework Advisor Web

A React + TypeScript + Vite single-page app for the Advisor agent. It provides intake, conversation, recommendation, feedback, and admin guidance screens.

## Prerequisites

- Node 20+
- Advisor API running on port 3000

## Start local UI

```powershell
cd agents/advisor
npm install
npm run build --workspace=shared
cd web
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3000
- `VITE_API_URL`: optional. Leave empty for local dev so Vite proxies `/sessions`, `/admin`, and `/health` to the API.

## Screens

- `/` intake wizard rendered from embedded JSON
- `/session/:sessionId` advisor conversation
- `/session/:sessionId/recommendation` recommendation and feedback
- `/admin` guidance version management

Admin tip: open `/admin`, enter `org-nfum`, and load the NFU Mutual sample instructions.

## Full stack

Start the API:

```powershell
cd agents/advisor
npm run build --workspace=shared
npm run build --workspace=api
cd api
node dist/index.js
```

Start the UI:

```powershell
cd agents/advisor/web
npm run dev
```
