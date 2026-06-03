# SKILL: Deploy a Vite SPA to Azure Storage Static Website

**Category:** Deployment  
**Stack:** Vite / React / TypeScript + Azure CLI + Azure Storage  
**Validated:** 2026-06-03 against subscription `3d2c527a...` / `swedencentral`

---

## When to use

Use this skill when you need to host a Vite (or any static-asset) SPA cheaply and repeatably in Azure, without SWA CLI, without Docker, and without a CDN (CDN is optional on top).

This is the right choice when:
- The SPA calls an API on a different origin (CORS must be enabled on the API)
- You want a single `az` CLI deploy with no proprietary tooling
- The API is already a Container App with `app.use(cors())` or equivalent

---

## Steps

### 1. Build the SPA with the live API URL

```powershell
$env:VITE_API_URL = "https://<your-container-app>.azurecontainerapps.io"
# from the workspace root (monorepo):
npm install
npm run build --workspace=shared   # if a shared package exists
npm run build --workspace=web
# Output: agents/advisor/web/dist/
```

### 2. Create storage account (once)

```powershell
az storage account create `
  --name "<storageaccountname>" `
  --resource-group "<rg>" `
  --location "<region>" `
  --sku Standard_LRS `
  --kind StorageV2 `
  --allow-blob-public-access true
```

> **Note:** If the subscription disables key-based auth, always append `--auth-mode login` to storage operations. Assign yourself **Storage Blob Data Contributor** on the storage resource first (see below).

### 3. Enable static website (once)

```powershell
az storage blob service-properties update `
  --account-name "<storageaccountname>" `
  --static-website `
  --index-document "index.html" `
  --404-document "index.html" `   # critical for SPA React Router
  --auth-mode login
```

Setting `--404-document index.html` makes React Router deep-links work on hard reload.

### 4. Assign RBAC (once per deployer identity)

```powershell
$storageId = az storage account show --name "<name>" --resource-group "<rg>" --query id -o tsv
az role assignment create `
  --assignee "<aad-object-id>" `
  --role "Storage Blob Data Contributor" `
  --scope $storageId
# Wait ~30 seconds for propagation, then proceed
Start-Sleep -Seconds 30
```

### 5. Upload dist/ to $web

```powershell
az storage blob upload-batch `
  --account-name "<storageaccountname>" `
  --source "./web/dist" `
  --destination '$web' `
  --auth-mode login `
  --overwrite
```

### 6. Get public URL

```powershell
az storage account show --name "<name>" --resource-group "<rg>" `
  --query "primaryEndpoints.web" -o tsv
# → https://<name>.z1.web.core.windows.net/
```

---

## Verify CORS (before publishing URL to users)

```powershell
$headers = @{
    "Origin" = "https://<name>.z1.web.core.windows.net"
    "Access-Control-Request-Method" = "GET"
}
Invoke-WebRequest -Uri "https://<api>/health" -Headers $headers -Method OPTIONS -UseBasicParsing |
  Select-Object -ExpandProperty Headers
# Expect: Access-Control-Allow-Origin = https://<name>.z1.web.core.windows.net
```

---

## Gotchas

| Gotcha | Fix |
|--------|-----|
| `KeyBasedAuthenticationNotPermitted` on upload | Add `--auth-mode login` to all `az storage` commands |
| Role assignment propagation takes ~30 s | `Start-Sleep -Seconds 30` after `az role assignment create` before uploading |
| React Router 404 on deep-links | Set `--404-document index.html` when enabling static website |
| API URL not baked into bundle | Set `$env:VITE_API_URL` before running `vite build`; verify with `Select-String` on JS bundle |
| SWA CLI `StaticSitesClient` ARM errors | Skip SWA entirely; Storage static website is simpler and more reliable for POC |

---

## Reusable deploy script template

See: `agents/advisor/infra/scripts/deploy-web.ps1` for a working example.

---

## CDN (optional upgrade)

To add a custom domain + edge caching, front the storage endpoint with Azure CDN or Azure Front Door:

```powershell
az cdn profile create --name "<cdn-profile>" --resource-group "<rg>" --sku Standard_Microsoft
az cdn endpoint create --name "<endpoint>" --profile-name "<cdn-profile>" `
  --resource-group "<rg>" --origin "<name>.z1.web.core.windows.net" `
  --origin-host-header "<name>.z1.web.core.windows.net"
```
