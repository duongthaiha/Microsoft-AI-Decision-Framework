# Decision: SWA Deploy via GitHub Actions (parker-swa-github-actions-deploy)

**By:** Parker (Infra/DevOps)  
**Date:** 2026-05-26T22:44:00Z  
**Status:** ✅ COMPLETE — SPA live, smoke test green

---

## Summary

Deployed the advisor-agent Web SPA to Azure Static Web Apps (`advisor-web-uwmrjzgkhs2hk`) via a GitHub Actions workflow, bypassing the SWA CLI ARM aarch64 incompatibility documented in parker-4.

**Deploy flow:** `push` to `feat-ai-decision-agent` or `main` → `deploy-web.yml` → Node 20 build (`npm ci && npm run build`) → `Azure/static-web-apps-deploy@v1` → SWA CDN.

---

## Secrets & Variables Set

### Repo Secret (sensitive — never commit)
| Name | How set | Notes |
|---|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `gh secret set` | SWA deployment token from `az staticwebapp secrets list`. Rotate if compromised. |

### Repo Variables (public — safe to commit/display)
| Name | Value | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io` | Container App URL (swedencentral) |
| `VITE_ADVISOR_CLIENT_ID` | `4f4f4a4d-e60f-4b86-a681-86059aae4597` | Entra app reg App ID — public, safe |
| `VITE_ADVISOR_TENANT_ID` | `cdfe81b5-821e-4f07-9ea7-516efc8497e4` | Entra tenant ID — public, safe |
| `VITE_AZURE_REDIRECT_URI` | `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` | SWA hostname (Entra redirect URI) |

---

## Workflow File

**Path:** `.github/workflows/deploy-web.yml` (repo root — not under `advisor-agent/`)  
**Commit:** `868bd67`  
**PR/branch:** `feat-ai-decision-agent`

### Key workflow design decisions
- **Runner: `ubuntu-latest`** — x86-64; bypasses ARM aarch64 SWA CLI blocker (parker-4 root cause).
- **`app_location: 'advisor-agent/web'`** — monorepo-relative path; SWA action handles `npm ci && npm run build` inside this directory.
- **`output_location: 'dist'`** — Vite output; no `api_location` (no Azure Functions API).
- **`submodules: true`** on checkout — future-proofing; no submodules currently.
- **Vite envs via `env:` block** on the deploy step with `vars.*` fallbacks to hardcoded defaults.
- **`pull_request` trigger** — SWA action auto-creates preview environments per PR.
- **`close_pull_request_job`** — cleans up preview env when PR is closed (per SWA action docs).
- **`permissions: contents: read, pull-requests: write`** — minimal; write needed for SWA PR preview comments.

---

## First Run

| Field | Value |
|---|---|
| Run ID | `26479487737` |
| Run URL | `https://github.com/duongthaiha/Microsoft-AI-Decision-Framework/actions/runs/26479487737` |
| Status | ✅ success |
| Duration | ~1m 8s |
| Triggered by | Push of commit `868bd67` to `feat-ai-decision-agent` |

---

## Deployed Site Verification

```
curl -I https://polite-mushroom-0a09fa803.7.azurestaticapps.net
HTTP/2 200
content-type: text/html
date: Tue, 26 May 2026 22:47:11 GMT
last-modified: Tue, 26 May 2026 22:46:46 GMT
```

✅ **HTTP 200, `text/html`** — SPA is live and serving.

---

## Caveats

1. **Token rotation:** `AZURE_STATIC_WEB_APPS_API_TOKEN` is a long-lived SWA deployment token. Should be rotated via `az staticwebapp secrets reset-api-key` + `gh secret set` if ever exposed.
2. **Vite env fallbacks:** Workflow has hardcoded defaults for all four `VITE_*` vars so the build doesn't break if repo variables are deleted. Update both the variable and the fallback if endpoints change.
3. **PR preview environments:** Each PR on `feat-ai-decision-agent` / `main` touching `advisor-agent/web/**` will spin up a SWA staging environment. Free tier allows up to 10 staging environments.
4. **No Entra auth enforcement at SWA edge:** Authentication is handled client-side (PKCE). SWA does not enforce Entra login on its own for this config.
5. **`close_pull_request_job` skips if no PR context:** The `if:` condition ensures the close job only runs on `pull_request` closed events — safe for push/dispatch triggers.

---

## Future Deploy Flow

**Push → Action → SWA:** Any push to `feat-ai-decision-agent` or `main` touching `advisor-agent/web/**` (or the workflow file itself) automatically triggers a build and deploy. No manual steps required. Use `gh workflow run deploy-web.yml` for manual deploys.
