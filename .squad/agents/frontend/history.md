# Mouse — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework — AI Framework Advisor Agent POC.
- **Rule:** UI consumes only the headless API. Built after CLI proves the agent loop.
- **Screens:** intake form, conversation, recommendation result view, admin instruction UI.
- **Output root:** `agents/advisor/web/`.
- **User:** Ha Duong.

## Learnings

## Learnings

### 2026-05-29
- Web app structure: React + TypeScript + Vite SPA under `agents/advisor/web/`, with pages in `src/pages`, UI components in `src/components`, shared session logic in `src/hooks`, and static intake data in `src/data/intake-form.json`.
- API client location: `agents/advisor/web/src/api/client.ts`.
- Dev commands: run `npm run dev` from `agents/advisor/web/`; API runs on port 3000 and UI runs on port 5173.
- API endpoints added: `POST /sessions/:id/feedback`, `GET/POST/PUT /admin/guidance/:orgId`, and `POST /admin/guidance/:orgId/:instructionSetId/activate`.
