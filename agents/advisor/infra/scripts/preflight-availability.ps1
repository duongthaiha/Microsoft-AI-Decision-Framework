#Requires -Version 5.1
<#
.SYNOPSIS
    READ-ONLY preflight: Azure service availability + quota check before `azd up`.

.DESCRIPTION
    Validates the deployment environment for the AI Framework Advisor Agent POC.
    Covers every Azure resource type declared in agents/advisor/infra/main.bicep:
      - Container Apps + Environment  (Microsoft.App)
      - Cosmos DB NoSQL Serverless     (Microsoft.DocumentDB)
      - Azure AI Search Basic SKU      (Microsoft.Search)
      - Key Vault Standard SKU         (Microsoft.KeyVault)
      - Container Registry Basic SKU   (Microsoft.ContainerRegistry)
      - VNet + private endpoints       (Microsoft.Network)
      - Log Analytics PerGB2018        (Microsoft.OperationalInsights)
      - Application Insights           (Microsoft.Insights)
      - User-assigned managed identity (Microsoft.ManagedIdentity)

    Checks performed (all READ-ONLY):
      1. Active subscription / tenant vs. expected
      2. Resource provider registration states (reports only, never registers)
      3. Per-region availability for every service (provider location lists)
      4. Azure AI Search Basic quota via the Search usages REST API
         (falls back to provider location check if API unavailable)
      5. Azure Policy assignments that could block the deployment
         (known: 797b37f7 Cosmos DB public network deny — aligned with our Bicep)
      6. Per-region GO / NO-GO summary table + recommended region

    Output is plain ASCII — safe for CI logs and terminals.
    Exit code is always 0.  This is a report, not a gate.

.PARAMETER Regions
    Candidate Azure regions to evaluate.
    Default: eastus2, swedencentral, westeurope, uksouth

.PARAMETER ExpectedSubscriptionId
    The subscription GUID expected to be active.
    The script warns (but continues) if the actual subscription differs.

.NOTES
    Author  : Dozer (DevOps/Infrastructure) — The Matrix squad
    Date    : 2026-05-29T16:57:59+01:00
    Infra   : agents/advisor/infra/main.bicep  (subscription scope)
    READ-ONLY — never creates, deploys, or modifies any Azure resource.
    Always exits 0.
#>
[CmdletBinding()]
param(
    [string[]]$Regions = @('eastus2', 'swedencentral', 'westeurope', 'uksouth'),
    [string]$ExpectedSubscriptionId = '3d2c527a-481d-4e13-b3a1-637924b33343'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# ── Display helpers ────────────────────────────────────────────────────────────

$LINEWIDTH = 78

function Write-Banner {
    param([string]$Text)
    $line = ('=' * $LINEWIDTH)
    $pad  = [Math]::Max(0, [int](($LINEWIDTH - $Text.Length) / 2))
    Write-Host ''
    Write-Host $line                                -ForegroundColor Cyan
    Write-Host ((' ' * $pad) + $Text)               -ForegroundColor Cyan
    Write-Host $line                                -ForegroundColor Cyan
}

function Write-Section {
    param([string]$Text)
    Write-Host ''
    Write-Host "  -- $Text" -ForegroundColor Yellow
    Write-Host "  $('-' * ($LINEWIDTH - 5))" -ForegroundColor DarkGray
}

function Write-OK   { param([string]$m); Write-Host "  [OK]      $m" -ForegroundColor Green }
function Write-WARN { param([string]$m); Write-Host "  [WARN]    $m" -ForegroundColor Yellow }
function Write-FAIL { param([string]$m); Write-Host "  [FAIL]    $m" -ForegroundColor Red }
function Write-INFO { param([string]$m); Write-Host "  [INFO]    $m" -ForegroundColor Gray }
function Write-UNK  { param([string]$m); Write-Host "  [UNKNOWN] $m" -ForegroundColor DarkYellow }

# ── Safe az CLI JSON call ──────────────────────────────────────────────────────

function Invoke-AzJson {
    param([string[]]$AzArgs)
    try {
        $raw = (& az @AzArgs --output json 2>&1)
        if ($LASTEXITCODE -ne 0) { return $null }
        $joined = ($raw -join '')
        if ([string]::IsNullOrWhiteSpace($joined)) { return $null }
        return ($joined | ConvertFrom-Json -ErrorAction Stop)
    }
    catch { return $null }
}

# ── Region name normalisation ──────────────────────────────────────────────────
# Azure provider API returns display names ("East US 2") and short names ("eastus2").
# Normalise: lowercase, strip spaces, strip parentheses.

function Normalize-Region {
    param([string]$r)
    return $r.ToLower().Replace(' ', '').Replace('(', '').Replace(')', '')
}

# ── Provider location cache (avoid redundant API calls) ───────────────────────

$script:ProviderLocationCache = @{}

function Get-ProviderLocations {
    param([string]$Namespace, [string]$ResourceType)
    $key = "$Namespace/$ResourceType"
    if ($script:ProviderLocationCache.ContainsKey($key)) {
        return $script:ProviderLocationCache[$key]
    }
    try {
        $provider = Invoke-AzJson @('provider', 'show', '--namespace', $Namespace)
        if ($null -eq $provider) {
            $script:ProviderLocationCache[$key] = @()
            return @()
        }
        $rt = $provider.resourceTypes | Where-Object { $_.resourceType -ieq $ResourceType }
        if ($null -eq $rt) {
            $script:ProviderLocationCache[$key] = @()
            return @()
        }
        $locs = @($rt.locations | ForEach-Object { Normalize-Region $_ })
        $script:ProviderLocationCache[$key] = $locs
        return $locs
    }
    catch {
        $script:ProviderLocationCache[$key] = @()
        return @()
    }
}

function Test-RegionSupport {
    param([string]$Namespace, [string]$ResourceType, [string]$Region)
    try {
        $locs = Get-ProviderLocations -Namespace $Namespace -ResourceType $ResourceType
        if ($locs.Count -eq 0) { return 'UNKNOWN' }
        $norm = Normalize-Region $Region
        if ($locs -contains $norm) { return 'OK' } else { return 'FAIL' }
    }
    catch { return 'UNKNOWN' }
}

# ── Script-level state ─────────────────────────────────────────────────────────

$script:UnregisteredProviders = @()
$script:PolicyBlockers         = @()
$script:RegionResults          = @{}

# ==============================================================================
Write-Banner 'Advisor Agent POC -- Azure Pre-Deployment Preflight'
Write-Host "  Script    : preflight-availability.ps1 (READ-ONLY)" -ForegroundColor Gray
Write-Host "  Run at    : $(Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')"   -ForegroundColor Gray
Write-Host "  Regions   : $($Regions -join ', ')"                          -ForegroundColor Gray
Write-Host "  Expected  : subscription $ExpectedSubscriptionId"             -ForegroundColor Gray

# ==============================================================================
# SECTION 1 — Active subscription / tenant
# ==============================================================================
Write-Section '1. Active Subscription & Identity'

$account = $null
try { $account = Invoke-AzJson @('account', 'show') } catch {}

if ($null -eq $account) {
    Write-FAIL 'Could not retrieve account info. Is az CLI logged in?'
    Write-INFO 'Run: az login  (or check az account show)'
}
else {
    Write-INFO "Subscription : $($account.name)"
    Write-INFO "Sub ID       : $($account.id)"
    Write-INFO "Tenant ID    : $($account.tenantId)"
    Write-INFO "User         : $($account.user.name)"
    Write-INFO "Cloud        : $($account.environmentName)"

    if ($account.id -ne $ExpectedSubscriptionId) {
        Write-WARN "Active sub '$($account.id)' differs from expected '$ExpectedSubscriptionId'."
        Write-WARN "Run: az account set --subscription $ExpectedSubscriptionId"
    }
    else {
        Write-OK 'Subscription ID matches expected — correct context.'
    }
}

$subscriptionId = if ($null -ne $account) { $account.id } else { $ExpectedSubscriptionId }

# ==============================================================================
# SECTION 2 — Resource Provider Registration
# ==============================================================================
Write-Section '2. Resource Provider Registration'

$requiredProviders = @(
    'Microsoft.App',
    'Microsoft.OperationalInsights',
    'Microsoft.DocumentDB',
    'Microsoft.Search',
    'Microsoft.KeyVault',
    'Microsoft.ContainerRegistry',
    'Microsoft.Network',
    'Microsoft.ManagedIdentity',
    'Microsoft.Insights'
)

foreach ($rp in $requiredProviders) {
    try {
        $p = Invoke-AzJson @('provider', 'show', '--namespace', $rp)
        if ($null -eq $p) {
            Write-UNK "$rp  (no response from provider show)"
        }
        elseif ($p.registrationState -eq 'Registered') {
            Write-OK "$rp  -- $($p.registrationState)"
        }
        else {
            Write-FAIL "$rp  -- $($p.registrationState)"
            $script:UnregisteredProviders += $rp
        }
    }
    catch {
        Write-UNK "$rp  (check error: $($_.Exception.Message))"
    }
}

if ($script:UnregisteredProviders.Count -gt 0) {
    Write-Host ''
    Write-WARN 'Providers not yet registered. Run these commands to register:'
    foreach ($rp in $script:UnregisteredProviders) {
        Write-Host "      az provider register --namespace $rp --wait" -ForegroundColor Magenta
    }
}

# ==============================================================================
# SECTION 3 — Per-Region Availability
# ==============================================================================
Write-Section '3. Per-Region Availability'
Write-INFO 'Fetching provider location lists (cached per RP — takes ~30 s)...'

foreach ($region in $Regions) {
    Write-Host ''
    Write-Host "  >> $region" -ForegroundColor White

    $r = @{
        ContainerApps = 'UNKNOWN'
        CosmosDB      = 'UNKNOWN'
        SearchBasic   = 'UNKNOWN'
        SearchQuota   = 'No data'
        KeyVault      = 'UNKNOWN'
        ACR           = 'UNKNOWN'
        Monitoring    = 'UNKNOWN'
        Network       = 'UNKNOWN'
        Overall       = 'UNKNOWN'
    }

    # Container Apps environments
    try { $r.ContainerApps = Test-RegionSupport 'Microsoft.App' 'managedEnvironments' $region }
    catch { $r.ContainerApps = 'UNKNOWN' }

    # Cosmos DB accounts
    try { $r.CosmosDB = Test-RegionSupport 'Microsoft.DocumentDB' 'databaseAccounts' $region }
    catch { $r.CosmosDB = 'UNKNOWN' }

    # Key Vault
    try { $r.KeyVault = Test-RegionSupport 'Microsoft.KeyVault' 'vaults' $region }
    catch { $r.KeyVault = 'UNKNOWN' }

    # Container Registry
    try { $r.ACR = Test-RegionSupport 'Microsoft.ContainerRegistry' 'registries' $region }
    catch { $r.ACR = 'UNKNOWN' }

    # Monitoring: both Log Analytics and App Insights must pass
    try {
        $law  = Test-RegionSupport 'Microsoft.OperationalInsights' 'workspaces'  $region
        $appi = Test-RegionSupport 'Microsoft.Insights'            'components'  $region
        if ($law -eq 'OK' -and $appi -eq 'OK')           { $r.Monitoring = 'OK'      }
        elseif ($law -eq 'FAIL' -or $appi -eq 'FAIL')    { $r.Monitoring = 'FAIL'    }
        else                                              { $r.Monitoring = 'UNKNOWN' }
    }
    catch { $r.Monitoring = 'UNKNOWN' }

    # VNet / private endpoints / DNS
    try { $r.Network = Test-RegionSupport 'Microsoft.Network' 'virtualNetworks' $region }
    catch { $r.Network = 'UNKNOWN' }

    # Azure AI Search — Basic SKU
    # Attempt 1: Search usages REST endpoint (gives per-SKU quota data)
    # Attempt 2: Fall back to provider location list
    $searchDone = $false
    try {
        $url = "https://management.azure.com/subscriptions/$subscriptionId" +
               "/providers/Microsoft.Search/locations/$region" +
               "/usages?api-version=2023-11-01"
        $usages = Invoke-AzJson @('rest', '--method', 'GET', '--url', $url)

        if ($null -ne $usages -and $null -ne $usages.value -and $usages.value.Count -gt 0) {
            # The Search usages endpoint returns entries like:
            #   { name: { value: "searchServices/Basic", ... }, currentValue: 0, limit: 12 }
            # We look for any Basic (or generic searchServices) entry.
            $basicEntry = $usages.value | Where-Object {
                $_.name.value -imatch 'basic' -or $_.name.value -imatch 'searchService'
            }
            if ($null -ne $basicEntry -and @($basicEntry).Count -gt 0) {
                $entry       = @($basicEntry)[0]
                $used        = $entry.currentValue
                $limit       = $entry.limit
                $r.SearchQuota = "Used=$used / Limit=$limit"
                if ($limit -gt 0) {
                    $r.SearchBasic = 'OK'
                }
                else {
                    $r.SearchBasic = 'FAIL'
                    $r.SearchQuota = "QUOTA EXHAUSTED: Used=$used / Limit=$limit"
                }
                $searchDone = $true
            }
        }
    }
    catch { <# Quota API unavailable — fall through to location check #> }

    if (-not $searchDone) {
        try {
            $r.SearchBasic = Test-RegionSupport 'Microsoft.Search' 'searchServices' $region
            $r.SearchQuota = if ($r.SearchBasic -eq 'OK') {
                'Location available (quota API unavailable)'
            } else {
                'Location not listed (quota API unavailable)'
            }
        }
        catch {
            $r.SearchBasic = 'UNKNOWN'
            $r.SearchQuota = 'Both quota API and location check failed'
        }
    }

    # Overall result
    $allChecks = @($r.ContainerApps, $r.CosmosDB, $r.SearchBasic, $r.KeyVault,
                   $r.ACR, $r.Monitoring, $r.Network)
    if ($allChecks -contains 'FAIL')    { $r.Overall = 'NO-GO'   }
    elseif ($allChecks -contains 'UNKNOWN') { $r.Overall = 'CAUTION' }
    else                                { $r.Overall = 'GO'      }

    $script:RegionResults[$region] = $r

    # Inline status per region
    $statusColor = switch ($r.Overall) {
        'GO'      { 'Green'  }
        'NO-GO'   { 'Red'    }
        'CAUTION' { 'Yellow' }
        default   { 'Gray'   }
    }
    $short = "  ContainerApps=$($r.ContainerApps)  Cosmos=$($r.CosmosDB)" +
             "  SearchBasic=$($r.SearchBasic)  KV=$($r.KeyVault)" +
             "  ACR=$($r.ACR)  Monitor=$($r.Monitoring)  Net=$($r.Network)"
    Write-Host $short -ForegroundColor DarkGray
    Write-Host "     --> $($r.Overall)  | Search quota: $($r.SearchQuota)" -ForegroundColor $statusColor
}

# ==============================================================================
# SECTION 4 — Azure Policy Scan
# ==============================================================================
Write-Section '4. Azure Policy -- Relevant Assignment Scan'
Write-INFO 'Listing policy assignments at subscription scope (read-only)...'

try {
    $assignments = Invoke-AzJson @(
        'policy', 'assignment', 'list',
        '--scope', "/subscriptions/$subscriptionId"
    )

    if ($null -eq $assignments) {
        Write-UNK 'Could not retrieve policy assignments (insufficient permissions or API unavailable).'
    }
    else {
        Write-INFO "Total policy assignments found: $($assignments.Count)"

        # Keywords that suggest a policy could interfere with this infra
        $riskKeywords = @(
            'network', 'public', 'deny', 'restrict', 'sku', 'location',
            'region', 'cosmos', 'search', 'vault', 'registry', 'container',
            'tls', 'https', 'encrypt'
        )

        foreach ($a in $assignments) {
            $displayName = if ($null -ne $a.displayName -and $a.displayName -ne '') {
                $a.displayName
            } else { $a.name }
            $policyDefId = if ($null -ne $a.policyDefinitionId) { $a.policyDefinitionId } else { '' }
            $enforcement = if ($null -ne $a.enforcementMode) { $a.enforcementMode } else { 'Default' }

            # Detect effect from parameters or metadata
            $effect = 'unknown'
            try {
                if ($null -ne $a.parameters -and
                    $null -ne $a.parameters.effect -and
                    $null -ne $a.parameters.effect.value) {
                    $effect = $a.parameters.effect.value
                }
            } catch {}

            # Check known blocker IDs
            $isKnownBlocker = $policyDefId -match '797b37f7'

            # Check relevance by keywords
            $isRelevant = $isKnownBlocker
            if (-not $isRelevant) {
                foreach ($kw in $riskKeywords) {
                    if ($displayName -imatch $kw -or $policyDefId -imatch $kw) {
                        $isRelevant = $true
                        break
                    }
                }
            }

            if ($isRelevant) {
                $severity = if ($isKnownBlocker -or $effect -ieq 'Deny') { 'BLOCKER' } else { 'REVIEW' }
                $entry = [PSCustomObject]@{
                    Name        = $displayName
                    PolicyId    = $policyDefId
                    Enforcement = $enforcement
                    Effect      = $effect
                    Severity    = $severity
                }
                $script:PolicyBlockers += $entry

                if ($severity -eq 'BLOCKER') {
                    Write-FAIL "[$severity] $displayName"
                } else {
                    Write-WARN "[$severity] $displayName"
                }
                Write-INFO "           PolicyId    : $policyDefId"
                Write-INFO "           Enforcement : $enforcement | Effect: $effect"
            }
        }

        if ($script:PolicyBlockers.Count -eq 0) {
            Write-OK 'No obviously blocking policy assignments detected at subscription scope.'
            Write-INFO '(Note: management-group level policies are not checked here.)'
        }
    }
}
catch {
    Write-UNK "Policy assignment list failed: $($_.Exception.Message)"
}

# Specific known-policy advisory
Write-Host ''
$cosmosKnown = $null
try {
    if ($null -ne $assignments) {
        $cosmosKnown = @($assignments | Where-Object {
            $null -ne $_.policyDefinitionId -and $_.policyDefinitionId -match '797b37f7'
        })
    }
} catch {}

if ($null -ne $cosmosKnown -and $cosmosKnown.Count -gt 0) {
    Write-WARN 'KNOWN POLICY PRESENT: 797b37f7 (Cosmos DB public network access — deny/audit)'
    Write-INFO 'ALIGNMENT CHECK: our Bicep sets publicNetworkAccess=Disabled + private endpoint.'
    Write-INFO 'This is ALIGNED with the policy intent. Creation should succeed.'
    Write-INFO 'Confirm enforcement mode is not "DoNotEnforce" to avoid false green.'
} else {
    Write-INFO 'Policy 797b37f7 not found at subscription scope.'
    Write-INFO 'It may be assigned at Management Group level — check MC portal if creation fails.'
}

# Light compliance state check (Cosmos DB — only relevant if resources already exist)
Write-Host ''
Write-INFO 'Checking policy state for Microsoft.DocumentDB (existing resources only)...'
try {
    $policyState = Invoke-AzJson @(
        'policy', 'state', 'list',
        '--subscription', $subscriptionId,
        '--filter', "resourceType eq 'Microsoft.DocumentDB/databaseAccounts'",
        '--top', '5'
    )
    if ($null -eq $policyState) {
        Write-UNK 'Policy state check unavailable (may require Reader on existing resources).'
    }
    elseif (@($policyState).Count -eq 0) {
        Write-OK 'No existing Cosmos DB resources flagged as non-compliant.'
    }
    else {
        Write-WARN "Found $(@($policyState).Count) Cosmos DB policy state record(s). Review in portal."
    }
}
catch {
    Write-UNK "Policy state check failed: $($_.Exception.Message)"
}

# ==============================================================================
# SECTION 5 — Summary Table
# ==============================================================================
Write-Section '5. Per-Region GO / NO-GO Summary'
Write-Host ''

# Column widths
$c = @{ Reg=16; CA=13; Cos=10; Srch=12; KV=10; Acr=8; Mon=11; Net=9; Result=9 }

$hdr = 'Region'.PadRight($c.Reg) +
       'ContainerApp'.PadRight($c.CA) +
       'Cosmos'.PadRight($c.Cos) +
       'SearchBasic'.PadRight($c.Srch) +
       'KeyVault'.PadRight($c.KV) +
       'ACR'.PadRight($c.Acr) +
       'Monitoring'.PadRight($c.Mon) +
       'Network'.PadRight($c.Net) +
       'RESULT'
Write-Host "  $hdr" -ForegroundColor White
Write-Host "  $('-' * $hdr.Length)" -ForegroundColor DarkGray

$recommendedRegion = $null

foreach ($region in $Regions) {
    $r = $script:RegionResults[$region]
    $row = $region.PadRight($c.Reg) +
           $r.ContainerApps.PadRight($c.CA) +
           $r.CosmosDB.PadRight($c.Cos) +
           $r.SearchBasic.PadRight($c.Srch) +
           $r.KeyVault.PadRight($c.KV) +
           $r.ACR.PadRight($c.Acr) +
           $r.Monitoring.PadRight($c.Mon) +
           $r.Network.PadRight($c.Net) +
           $r.Overall

    $color = switch ($r.Overall) {
        'GO'      { 'Green'  }
        'NO-GO'   { 'Red'    }
        'CAUTION' { 'Yellow' }
        default   { 'Gray'   }
    }
    Write-Host "  $row" -ForegroundColor $color

    if ($null -eq $recommendedRegion -and $r.Overall -eq 'GO') {
        $recommendedRegion = $region
    }
}

Write-Host ''
Write-Host '  AI Search quota detail:' -ForegroundColor Gray
foreach ($region in $Regions) {
    $r = $script:RegionResults[$region]
    Write-Host "    $($region.PadRight(16)) $($r.SearchQuota)" -ForegroundColor DarkGray
}

# ==============================================================================
# SECTION 6 — Final Recommendation & Action Checklist
# ==============================================================================
Write-Section '6. Recommendation'
Write-Host ''

if ($null -ne $recommendedRegion) {
    Write-Host "  *** RECOMMENDED REGION: $recommendedRegion ***" -ForegroundColor Green
    Write-Host ''
    Write-Host '  Set the region and provision:' -ForegroundColor White
    Write-Host "    azd env set AZURE_LOCATION $recommendedRegion" -ForegroundColor Magenta
    Write-Host '    azd up' -ForegroundColor Magenta
}
else {
    # Best CAUTION region as fallback
    $cautionRegion = $null
    foreach ($region in $Regions) {
        if ($script:RegionResults[$region].Overall -eq 'CAUTION') {
            $cautionRegion = $region
            break
        }
    }
    if ($null -ne $cautionRegion) {
        Write-WARN "No region passed all checks cleanly. Best CAUTION candidate: $cautionRegion"
        Write-WARN 'Resolve UNKNOWN checks before proceeding.'
    }
    else {
        Write-FAIL 'All candidate regions have FAIL or UNKNOWN status. Review blockers above.'
        Write-INFO 'Options: choose a different region, fix provider registrations, or request quota.'
    }
}

Write-Host ''
Write-Host '  PRE-FLIGHT ACTION CHECKLIST:' -ForegroundColor White
Write-Host "  $('-' * 56)" -ForegroundColor DarkGray

if ($script:UnregisteredProviders.Count -gt 0) {
    foreach ($rp in $script:UnregisteredProviders) {
        Write-Host "  [ ] Register provider: az provider register --namespace $rp --wait" -ForegroundColor Red
    }
}
else {
    Write-Host '  [x] All required resource providers are Registered' -ForegroundColor Green
}

$blockerPolicies = @($script:PolicyBlockers | Where-Object { $_.Severity -eq 'BLOCKER' })
if ($blockerPolicies.Count -gt 0) {
    Write-Host '  [ ] Review BLOCKER policies (see Section 4). Confirm Bicep is aligned.' -ForegroundColor Red
}
else {
    Write-Host '  [x] No blocking policy assignments detected' -ForegroundColor Green
}

if ($null -ne $recommendedRegion) {
    Write-Host "  [x] Deploy to: $recommendedRegion  (azd env set AZURE_LOCATION $recommendedRegion)" -ForegroundColor Green
}
else {
    Write-Host '  [ ] Select a viable region (see Section 5 CAUTION regions)' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  NOTES FOR MANAGED (MCAP/CSP) ENVIRONMENT:' -ForegroundColor Gray
Write-Host '    - Cosmos DB Serverless + private endpoint is ALIGNED with policy 797b37f7.' -ForegroundColor DarkGray
Write-Host '    - AI Search Basic disableLocalAuth=true uses RBAC only (no key auth).' -ForegroundColor DarkGray
Write-Host '    - ACR Basic has public access (managed identity AcrPull, no admin).' -ForegroundColor DarkGray
Write-Host '    - KV purge protection is ENABLED — plan soft-delete retention (7 days).' -ForegroundColor DarkGray
Write-Host '    - If AI Search Basic has no quota: use deploySearch=false param or' -ForegroundColor DarkGray
Write-Host '      request quota at https://aka.ms/azuresearchquota.' -ForegroundColor DarkGray

Write-Banner 'Preflight Complete -- READ-ONLY, no changes made -- exit 0'
exit 0
