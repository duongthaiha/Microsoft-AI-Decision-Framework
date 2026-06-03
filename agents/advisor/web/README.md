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

## Deploying to Azure

The SPA is deployed as an **Azure Storage static website** in `rg-advisor-advisor-poc` (swedencentral).

**Public URL:** https://advisorwebpoc.z1.web.core.windows.net/

### One-liner redeploy

```powershell
# From the repo root — builds + uploads in one pass
.\agents\advisor\infra\scripts\deploy-web.ps1
```

The script:
1. Sets the subscription to `3d2c527a-481d-4e13-b3a1-637924b33343`
2. Installs npm workspace deps
3. Builds `@advisor/shared`
4. Builds the SPA with `VITE_API_URL` baked in (pointing at the live Container App)
5. Uploads `web/dist/` to the `$web` blob container via `az storage blob upload-batch --auth-mode login`

### First-time prerequisite (RBAC)

The upload step uses Azure AD login (`--auth-mode login`). Key-based auth is disabled on the storage account.
Assign yourself **Storage Blob Data Contributor** once:

```powershell
$storageId = az storage account show --name advisorwebpoc --resource-group rg-advisor-advisor-poc --query id -o tsv
az role assignment create --assignee <your-aad-object-id> --role "Storage Blob Data Contributor" --scope $storageId
```

### CORS

The live API Container App (`ca-advisor-33wfyfewrvjcg...`) has `app.use(cors())` enabled.
It returns `Access-Control-Allow-Origin: https://advisorwebpoc.z1.web.core.windows.net` for preflight and regular requests — no extra config needed.

### SPA routing

The storage account is configured with `404-document = index.html`, so React Router deep-links (`/session/:id`, `/admin`) resolve correctly on reload.

---

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
