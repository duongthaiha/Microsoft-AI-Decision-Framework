# Skill: GitHub Actions as Deploy Fallback

**Category:** Infra/DevOps  
**Created:** 2026-05-26T22:44:00Z  
**Author:** Parker  
**Origin:** parker-5 — SWA CLI ARM aarch64 incompatibility unblocked via GitHub Actions

---

## Problem This Solves

Some deployment CLIs ship **x86-64-only binaries** that fail silently or crash on ARM aarch64 environments (GitHub Codespaces on M-series hosts, Apple Silicon VMs, ARM dev containers). The local toolchain is blocked, but the artifact is ready to deploy.

**Known affected tools (as of 2026-05-26):**
- Azure Static Web Apps CLI (`StaticSitesClient` inside `@azure/static-web-apps-cli`) — x86-64 ELF only
- Some `azd` deploy phases that shell out to platform-specific binaries

---

## Solution Pattern

Route the deploy through **GitHub Actions on `ubuntu-latest`** (x86-64). The workflow runs on GitHub-hosted infrastructure — no dependency on the developer's local CPU architecture.

```
Developer (ARM codespace)
  → git push (artifact already built locally or built in CI)
  → GitHub Actions ubuntu-latest runner (x86-64)
  → deploy action (SWA CLI / azd / az CLI)
  → Azure
```

---

## Reusable Steps

### 1. Store the deploy credential as a repo secret

```bash
# Fetch the credential (example: SWA deployment token)
TOKEN=$(az staticwebapp secrets list -n <swa-name> -g <rg> --query properties.apiKey -o tsv)

# Set as GitHub secret — NEVER echo to terminal, NEVER commit
gh secret set <SECRET_NAME> --body "$TOKEN" -R owner/repo
```

### 2. Store public build-time config as repo variables

```bash
gh variable set VITE_API_BASE_URL --body "https://..." -R owner/repo
gh variable set VITE_ADVISOR_CLIENT_ID --body "..." -R owner/repo
# etc.
```

### 3. Create the workflow file

Minimal template for an Azure Static Web Apps deploy:

```yaml
name: Deploy to SWA
on:
  push:
    branches: [main]
    paths: ['my-app/**', '.github/workflows/deploy-swa.yml']
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

jobs:
  deploy:
    runs-on: ubuntu-latest  # x86-64 — bypasses ARM toolchain blocker
    steps:
      - uses: actions/checkout@v4
      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: 'upload'
          app_location: 'my-app'
          output_location: 'dist'
          app_build_command: 'npm ci && npm run build'
        env:
          # Vite / build-time env vars — use vars.* for public config
          VITE_API_URL: ${{ vars.VITE_API_URL || 'https://fallback.example.com' }}
```

### 4. Commit + push to trigger

```bash
git add .github/workflows/deploy-swa.yml
git commit -m "ci: add SWA deploy workflow (ARM workaround)"
git push
```

### 5. Verify

```bash
gh run list --workflow=deploy-swa.yml --limit 3 -R owner/repo
gh run watch <run-id> -R owner/repo --exit-status
curl -I https://<swa-hostname>   # expect HTTP 200, content-type: text/html
```

---

## Generalisation Beyond SWA

This pattern applies to **any tool with an architecture-gated binary**:

| Tool | Credential secret | Workflow action |
|---|---|---|
| Azure Static Web Apps CLI | `AZURE_STATIC_WEB_APPS_API_TOKEN` | `Azure/static-web-apps-deploy@v1` |
| Azure Developer CLI (`azd`) | Service Principal env vars | `azure/setup-azd` + `azd deploy` |
| Azure CLI (`az`) | `AZURE_CREDENTIALS` | `azure/login` + `az` commands |
| Docker push to ACR | `ACR_PASSWORD` (or managed identity via OIDC) | `docker/login-action` + `docker push` |

For `azd deploy`, use [Azure/azure-dev](https://github.com/Azure/azure-dev) action on `ubuntu-latest` with `AZURE_CREDENTIALS` secret (or federated identity).

---

## Caveats

- **Token rotation:** Long-lived SWA tokens should be rotated periodically via `az staticwebapp secrets reset-api-key`. Update the GitHub secret after rotation.
- **Inline fallbacks:** Always add `|| 'default'` fallbacks for `vars.*` references in the `env:` block to prevent build failure if variables are removed.
- **PR preview envs:** SWA action auto-provisions staging slots per PR. Free tier: 10 slots max. Add `close_pull_request_job` to clean up.
- **OIDC preferred for production:** Federated credentials (OIDC) are preferable to long-lived secrets for production deploys. This skill uses token-based auth for simplicity in dev.

---

## Reference Implementation

- **Workflow:** `.github/workflows/deploy-web.yml` (commit `868bd67`, repo `duongthaiha/Microsoft-AI-Decision-Framework`)
- **Decision record:** `advisor-agent/.squad/decisions/inbox/parker-swa-github-actions-deploy.md`
- **parker history entry:** `advisor-agent/.squad/agents/parker/history.md` — "SWA GitHub Actions Deploy — 2026-05-26"
