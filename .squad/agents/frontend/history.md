# Mouse — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework — AI Framework Advisor Agent POC.
- **Rule:** UI consumes only the headless API. Built after CLI proves the agent loop.
- **Screens:** intake form, conversation, recommendation result view, admin instruction UI.
- **Output root:** `agents/advisor/web/`.
- **User:** Ha Duong.

## Learnings

## Learnings

### 2026-06-03

#### Web Deploy — Azure Storage Static Website

- **Deploy path chosen:** Azure Storage static website (Option b). Selected over SWA (CLI binary risk noted in team history) and Container App nginx (overkill for static assets).
- **Public URL:** https://advisorwebpoc.z1.web.core.windows.net/
- **Storage account:** `advisorwebpoc`, RG `rg-advisor-advisor-poc`, region `swedencentral`.
- **Build approach:** Set `$env:VITE_API_URL` before `npm run build --workspace=web`. The live Container App URL is baked into the JS bundle at build time (confirmed via `Select-String` on the output JS).
- **CORS confirmed:** Live API returns `Access-Control-Allow-Origin: https://advisorwebpoc.z1.web.core.windows.net` on OPTIONS preflight. `app.use(cors())` with no origin restriction works as expected.
- **Key-based auth disabled:** This subscription enforces Azure AD for storage. All `az storage` commands require `--auth-mode login`. Must also pre-assign `Storage Blob Data Contributor` role to the deployer identity and wait ~30 s for propagation.
- **React Router routing:** Configured `--404-document index.html` so deep-links (e.g. `/session/:id`, `/admin`) resolve correctly on browser reload.
- **Redeploy script:** `agents/advisor/infra/scripts/deploy-web.ps1` — one command to build + upload.
- **Skill extracted:** `.squad/skills/vite-spa-azure-storage-deploy/SKILL.md`

### 2026-05-29
- Web app structure: React + TypeScript + Vite SPA under `agents/advisor/web/`, with pages in `src/pages`, UI components in `src/components`, shared session logic in `src/hooks`, and static intake data in `src/data/intake-form.json`.
- API client location: `agents/advisor/web/src/api/client.ts`.
- Dev commands: run `npm run dev` from `agents/advisor/web/`; API runs on port 3000 and UI runs on port 5173.
- API endpoints added: `POST /sessions/:id/feedback`, `GET/POST/PUT /admin/guidance/:orgId`, and `POST /admin/guidance/:orgId/:instructionSetId/activate`.
