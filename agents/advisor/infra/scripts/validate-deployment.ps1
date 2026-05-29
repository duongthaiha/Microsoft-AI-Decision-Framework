<#
.SYNOPSIS
    Post-deploy validation for the AI Framework Advisor Agent POC.

.DESCRIPTION
    Validates that:
    1. The Container App /health endpoint is publicly reachable (HTTP 200).
    2. The app can reach Cosmos DB over private connectivity FROM THE DEPLOYED HOST
       (not from this developer machine). This is done by calling a /health/deep
       endpoint on the Container App that internally exercises the Cosmos DB connection.
    3. The app can reach Azure AI Search over private connectivity (same pattern).

    IMPORTANT: Tests 2 and 3 verify private connectivity from inside the VNet,
    not from your laptop. The /health/deep endpoint must exist in the deployed API.
    If it does not yet exist (Wave 2 work), a clear warning is printed and the
    script exits with code 2 (partial validation).

.PARAMETER AppFqdn
    The Container App FQDN (e.g. ca-advisor-abc123.eastus2.azurecontainerapps.io).
    If not supplied, the script reads it from 'azd env get-values'.

.PARAMETER ResourceGroupName
    The Azure resource group name (e.g. rg-advisor-poc-dev).
    If not supplied, the script reads it from 'azd env get-values'.

.PARAMETER ContainerAppName
    The Container App resource name (e.g. ca-advisor-abc123).
    If not supplied, the script reads it from 'azd env get-values'.

.PARAMETER EnvironmentName
    The azd environment name. Used to load env values if other params are omitted.

.EXAMPLE
    # Auto-detect all values from azd env
    .\validate-deployment.ps1 -EnvironmentName poc-dev

.EXAMPLE
    # Supply values explicitly
    .\validate-deployment.ps1 `
        -AppFqdn "ca-advisor-abc.eastus2.azurecontainerapps.io" `
        -ResourceGroupName "rg-advisor-poc-dev" `
        -ContainerAppName "ca-advisor-abc"

.NOTES
    Run from agents/advisor/ after 'azd deploy' completes.
    Requires: az CLI authenticated, PowerShell 7+.
    Exit codes:
        0 — all checks passed
        1 — one or more checks failed
        2 — partial validation (deep health endpoint not yet implemented)
#>

[CmdletBinding()]
param(
    [string]$AppFqdn,
    [string]$ResourceGroupName,
    [string]$ContainerAppName,
    [string]$EnvironmentName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Colour helpers ────────────────────────────────────────────────────────────
function Write-Ok    { param([string]$Msg) Write-Host "  ✅ $Msg" -ForegroundColor Green }
function Write-Fail  { param([string]$Msg) Write-Host "  ❌ $Msg" -ForegroundColor Red }
function Write-Warn  { param([string]$Msg) Write-Host "  ⚠️  $Msg" -ForegroundColor Yellow }
function Write-Info  { param([string]$Msg) Write-Host "     $Msg" -ForegroundColor Cyan }
function Write-Head  { param([string]$Msg) Write-Host "`n── $Msg" -ForegroundColor White }

$failCount = 0
$warnCount = 0

# ── Load azd env values if params not supplied ────────────────────────────────
Write-Head "Loading environment values"

$azdEnvValues = @{}
try {
    $rawEnv = & azd env get-values 2>$null
    foreach ($line in $rawEnv) {
        if ($line -match '^([^=]+)="?(.*?)"?\s*$') {
            $azdEnvValues[$Matches[1]] = $Matches[2]
        }
    }
    Write-Ok "Loaded azd env values"
} catch {
    Write-Warn "Could not load azd env values (is azd installed and authenticated?)"
}

if (-not $AppFqdn)          { $AppFqdn          = $azdEnvValues['AZURE_CONTAINER_APP_FQDN'] }
if (-not $ResourceGroupName){ $ResourceGroupName = $azdEnvValues['AZURE_RESOURCE_GROUP'] }
if (-not $ContainerAppName)  { $ContainerAppName  = $azdEnvValues['AZURE_CONTAINER_APP_NAME'] }

if (-not $AppFqdn) {
    Write-Fail "AppFqdn not found — supply -AppFqdn or run from an azd-initialized environment"
    exit 1
}

Write-Info "App FQDN         : $AppFqdn"
Write-Info "Resource Group   : $ResourceGroupName"
Write-Info "Container App    : $ContainerAppName"

# ── Check 1: Public /health endpoint ─────────────────────────────────────────
Write-Head "Check 1: Public /health endpoint"

$healthUrl = "https://$AppFqdn/health"
Write-Info "GET $healthUrl"

try {
    $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 30 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        $body = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
        Write-Ok "HTTP 200 — app is healthy"
        if ($body.service) { Write-Info "Service : $($body.service)" }
        if ($body.ts)      { Write-Info "Time    : $($body.ts)" }
    } else {
        Write-Fail "Unexpected status $($response.StatusCode)"
        $failCount++
    }
} catch {
    Write-Fail "Failed to reach $healthUrl : $_"
    Write-Info "Possible causes:"
    Write-Info "  - azd deploy has not run yet (app shows placeholder page)"
    Write-Info "  - Container App is cold-starting (scale-to-zero) — wait 30s and retry"
    Write-Info "  - Ingress not configured correctly"
    $failCount++
}

# ── Check 2: Deep health — private Cosmos DB reachability ────────────────────
Write-Head "Check 2: Deep health — Cosmos DB private connectivity (from Container App)"

$deepHealthUrl = "https://$AppFqdn/health/deep"
Write-Info "GET $deepHealthUrl"
Write-Info "(This endpoint tests connectivity FROM the Container App to private endpoints)"

try {
    $response = Invoke-WebRequest -Uri $deepHealthUrl -TimeoutSec 30 -UseBasicParsing
    $body = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue

    if ($response.StatusCode -eq 200 -and $body.cosmos -eq $true) {
        Write-Ok "Cosmos DB reachable from Container App over private endpoint"
    } elseif ($response.StatusCode -eq 200 -and $body.cosmos -eq $false) {
        Write-Fail "Cosmos DB reachability check returned false — check private endpoint DNS"
        $failCount++
    } else {
        Write-Fail "Unexpected deep health response: $($response.Content)"
        $failCount++
    }
} catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }

    if ($status -eq 404) {
        Write-Warn "/health/deep endpoint not found (404) — deep connectivity check SKIPPED"
        Write-Info "Tank needs to implement /health/deep in Wave 3 (real adapters)."
        Write-Info "When implemented, it should return: { cosmos: bool, search: bool, ok: bool }"
        $warnCount++
    } else {
        Write-Fail "Failed to reach $deepHealthUrl : $_"
        $failCount++
    }
}

# ── Check 3: Deep health — private AI Search reachability ────────────────────
Write-Head "Check 3: Deep health — AI Search private connectivity (from Container App)"

# Re-use /health/deep response from above check (same endpoint, check 'search' field)
try {
    $response = Invoke-WebRequest -Uri $deepHealthUrl -TimeoutSec 30 -UseBasicParsing
    $body = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue

    if ($response.StatusCode -eq 200 -and $body.search -eq $true) {
        Write-Ok "AI Search reachable from Container App over private endpoint"
    } elseif ($response.StatusCode -eq 200 -and $body.search -eq $false) {
        Write-Fail "AI Search reachability check returned false — check private endpoint DNS"
        $failCount++
    } else {
        Write-Warn "AI Search status not in deep health response — check /health/deep implementation"
        $warnCount++
    }
} catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 404) {
        Write-Warn "/health/deep endpoint not found — AI Search check SKIPPED (see Check 2 note)"
        $warnCount++
    } else {
        Write-Fail "Failed to reach $deepHealthUrl for AI Search check : $_"
        $failCount++
    }
}

# ── Check 4: Container App is running (via az CLI) ───────────────────────────
Write-Head "Check 4: Container App running state (via az CLI)"

if (-not $ResourceGroupName -or -not $ContainerAppName) {
    Write-Warn "ResourceGroupName or ContainerAppName not set — skipping az check"
    $warnCount++
} else {
    try {
        $caJson = & az containerapp show `
            --name $ContainerAppName `
            --resource-group $ResourceGroupName `
            --output json 2>$null
        $ca = $caJson | ConvertFrom-Json
        $runningStatus = $ca.properties.runningStatus
        $provisionState = $ca.properties.provisioningState

        if ($provisionState -eq 'Succeeded' -and ($runningStatus -eq 'Running' -or $runningStatus -eq 'Stopped')) {
            Write-Ok "Container App provisioning: $provisionState"
            if ($runningStatus -eq 'Stopped') {
                Write-Info "App is stopped (scale-to-zero) — this is expected with minReplicas=0"
                Write-Info "It will start on first HTTP request"
            } else {
                Write-Info "Running status: $runningStatus"
            }
        } else {
            Write-Fail "Unexpected state — provisioning: $provisionState, running: $runningStatus"
            $failCount++
        }

        # Print the ingress FQDN for reference
        $fqdn = $ca.properties.configuration.ingress.fqdn
        if ($fqdn) { Write-Info "Ingress FQDN : $fqdn" }

    } catch {
        Write-Warn "az CLI check failed (is az authenticated?): $_"
        $warnCount++
    }
}

# ── Check 5: Verify public network access is disabled on data services ────────
Write-Head "Check 5: Public network access disabled on data services"

if (-not $ResourceGroupName) {
    Write-Warn "ResourceGroupName not set — skipping data-service checks"
    $warnCount++
} else {
    # Cosmos DB
    try {
        $cosmosJson = & az cosmosdb list --resource-group $ResourceGroupName --output json 2>$null
        $cosmosList = $cosmosJson | ConvertFrom-Json
        foreach ($c in $cosmosList) {
            $pna = $c.publicNetworkAccess
            if ($pna -eq 'Disabled') {
                Write-Ok "Cosmos DB '$($c.name)': publicNetworkAccess = Disabled ✓"
            } else {
                Write-Fail "Cosmos DB '$($c.name)': publicNetworkAccess = $pna (expected Disabled)"
                $failCount++
            }
        }
        if ($cosmosList.Count -eq 0) { Write-Warn "No Cosmos DB accounts found in $ResourceGroupName" ; $warnCount++ }
    } catch {
        Write-Warn "Could not query Cosmos DB: $_"
        $warnCount++
    }

    # Azure AI Search
    try {
        $searchJson = & az search service list --resource-group $ResourceGroupName --output json 2>$null
        $searchList = $searchJson | ConvertFrom-Json
        foreach ($s in $searchList) {
            $pna = $s.publicNetworkAccess
            if ($pna -eq 'disabled') {
                Write-Ok "AI Search '$($s.name)': publicNetworkAccess = disabled ✓"
            } else {
                Write-Fail "AI Search '$($s.name)': publicNetworkAccess = $pna (expected disabled)"
                $failCount++
            }
        }
        if ($searchList.Count -eq 0) { Write-Warn "No AI Search services found in $ResourceGroupName" ; $warnCount++ }
    } catch {
        Write-Warn "Could not query AI Search: $_"
        $warnCount++
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor White
Write-Host " Validation Summary" -ForegroundColor White
Write-Host "════════════════════════════════════════" -ForegroundColor White

if ($failCount -eq 0 -and $warnCount -eq 0) {
    Write-Host "  ✅ All checks passed" -ForegroundColor Green
    exit 0
} elseif ($failCount -eq 0 -and $warnCount -gt 0) {
    Write-Host "  ⚠️  Passed with $warnCount warning(s)" -ForegroundColor Yellow
    Write-Host "     Warnings typically mean deep health endpoint not yet implemented (Wave 3)." -ForegroundColor Yellow
    exit 2
} else {
    Write-Host "  ❌ $failCount check(s) FAILED, $warnCount warning(s)" -ForegroundColor Red
    Write-Host "     Review the output above and fix before marking deployment successful." -ForegroundColor Red
    exit 1
}
