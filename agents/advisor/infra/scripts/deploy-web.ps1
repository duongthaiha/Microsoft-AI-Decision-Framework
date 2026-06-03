#!/usr/bin/env pwsh
# ===========================================================
# deploy-web.ps1 — Build & deploy the Advisor React SPA to
# Azure Storage static website.
#
# Usage:
#   ./agents/advisor/infra/scripts/deploy-web.ps1
#
# Prerequisites:
#   - Azure CLI logged in: az login
#   - Correct subscription set: az account set --subscription <id>
#   - Node 20+
#   - Role "Storage Blob Data Contributor" on the storage account
#     (one-time: az role assignment create --assignee <your-object-id>
#                --role "Storage Blob Data Contributor"
#                --scope <storage-account-resource-id>)
# ===========================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SUBSCRIPTION   = "3d2c527a-481d-4e13-b3a1-637924b33343"
$RESOURCE_GROUP = "rg-advisor-advisor-poc"
$STORAGE_NAME   = "advisorwebpoc"
$API_URL        = "https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io"
$ADVISOR_ROOT   = Join-Path $PSScriptRoot "..\..\.." | Resolve-Path

Write-Host "=== Advisor Web Deploy ===" -ForegroundColor Cyan
Write-Host "API URL  : $API_URL"
Write-Host "Storage  : $STORAGE_NAME"
Write-Host ""

# 1. Ensure correct subscription
Write-Host "[1/5] Setting Azure subscription..." -ForegroundColor Yellow
az account set --subscription $SUBSCRIPTION
if ($LASTEXITCODE -ne 0) { throw "Failed to set subscription" }

# 2. Install workspace dependencies
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
Push-Location $ADVISOR_ROOT
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

# 3. Build shared package
Write-Host "[3/5] Building shared package..." -ForegroundColor Yellow
npm run build --workspace=shared
if ($LASTEXITCODE -ne 0) { throw "shared build failed" }

# 4. Build web SPA (bake in live API URL)
Write-Host "[4/5] Building web SPA (VITE_API_URL=$API_URL)..." -ForegroundColor Yellow
$env:VITE_API_URL = $API_URL
npm run build --workspace=web
if ($LASTEXITCODE -ne 0) { throw "web build failed" }
Pop-Location

# 5. Upload dist/ to $web container
Write-Host "[5/5] Uploading to Azure Storage static website..." -ForegroundColor Yellow
$distPath = Join-Path $ADVISOR_ROOT "web\dist"
az storage blob upload-batch `
    --account-name $STORAGE_NAME `
    --source $distPath `
    --destination '$web' `
    --auth-mode login `
    --overwrite
if ($LASTEXITCODE -ne 0) { throw "Upload failed" }

# Report public URL
$webUrl = az storage account show `
    --name $STORAGE_NAME `
    --resource-group $RESOURCE_GROUP `
    --query "primaryEndpoints.web" -o tsv
Write-Host ""
Write-Host "=== Deploy Complete ===" -ForegroundColor Green
Write-Host "Public URL: $webUrl" -ForegroundColor Green
