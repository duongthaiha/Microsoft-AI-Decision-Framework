#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Seeds the advisor-project-knowledge AI Search index and NFU Mutual guidance
    via the container's admin endpoints.

.DESCRIPTION
    AI Search is behind a private endpoint — this machine cannot reach it directly.
    Instead, the container app (which IS in the VNet) exposes guarded admin endpoints:

      POST /admin/seed/project-knowledge   — create/update index + upload seed docs
      POST /admin/guidance/:orgId          — upsert org guidance into Cosmos DB

    Both endpoints are idempotent (safe to run multiple times).
    The seed endpoint requires ENABLE_ADMIN_SEED=true on the container.

.PARAMETER BaseUrl
    Container App public base URL.
    Default: https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io

.PARAMETER SkipGuidance
    Skip seeding the NFU Mutual guidance document.

.PARAMETER SkipSearch
    Skip seeding the project-knowledge index.

.EXAMPLE
    # Full seed (both Search and Cosmos guidance)
    .\seed-via-admin-endpoint.ps1

.EXAMPLE
    # Only seed the AI Search index
    .\seed-via-admin-endpoint.ps1 -SkipGuidance

.NOTES
    Pre-requisites:
    - Container App must have ENABLE_ADMIN_SEED=true (set via az containerapp update or Bicep)
    - Container image must include the admin seed endpoint (this repo, post-commit 2026-06-03)
    - No Azure CLI or credentials required from this machine (auth is managed identity in-container)
#>

param(
    [string]$BaseUrl = "https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io",
    [switch]$SkipGuidance,
    [switch]$SkipSearch
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AI Framework Advisor — Seed via Admin Endpoints" -ForegroundColor Cyan
Write-Host "  Base URL: $BaseUrl"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Seed AI Search project-knowledge index
# ---------------------------------------------------------------------------
if (-not $SkipSearch) {
    Write-Host "🔍 Seeding AI Search index (advisor-project-knowledge)..." -ForegroundColor Yellow
    $seedUrl = "$BaseUrl/admin/seed/project-knowledge"
    try {
        $response = Invoke-RestMethod -Method POST -Uri $seedUrl -ContentType "application/json" -Body "{}" -TimeoutSec 120
        if ($response.ok) {
            $count = $response.data.documentsSeeded
            $index = $response.data.indexName
            Write-Host "   ✓ Seeded $count documents into '$index'" -ForegroundColor Green
        } else {
            Write-Error "Seed endpoint returned ok=false: $($response | ConvertTo-Json)"
        }
    } catch {
        Write-Error "Failed to seed AI Search: $_"
    }
    Write-Host ""
}

# ---------------------------------------------------------------------------
# 2. Seed NFU Mutual guidance into Cosmos DB
# ---------------------------------------------------------------------------
if (-not $SkipGuidance) {
    Write-Host "📦 Seeding NFU Mutual guidance (org-nfum)..." -ForegroundColor Yellow

    $guidancePayload = @{
        instructionSetId     = "instr-nfum-claims-001"
        customerOrganizationId = "org-nfum"
        version              = 3
        activeFlag           = $true
        scope                = "customerOrganization"
        activeFrom           = "2026-05-20T09:00:00.000+01:00"
        organizationContext  = @{
            companySummary      = "NFU Mutual is a UK insurance organization serving rural and agricultural customers where trust, consistency, and human accountability are critical."
            businessPriorities  = @(
                "Improve claim handler productivity",
                "Preserve customer trust during weather-related claim spikes",
                "Support newer handlers with consistent guidance"
            )
            preferredChannels   = @("Microsoft Teams", "Claims system integration")
            operatingConstraints = @(
                "Claim decisions and payments require human accountability",
                "Coverage interpretation must remain grounded in approved policy and guidance sources",
                "Recommendations should be explainable to team leaders and compliance reviewers"
            )
            technologyPreferences = @(
                "Prefer Microsoft 365 and Azure services already approved by the organization",
                "Favor reusable agent patterns over one-off automation"
            )
        }
        instructions = @(
            @{
                id   = "human-approval-required"
                text = "Recommendations must preserve human ownership of claim decisions, approvals, customer commitments, complaint handling, and payment decisions."
                appliesToFrameworkQuestions = @("phase2.action_safety", "phase3.trade_offs_accepted")
            },
            @{
                id   = "preferred-user-experience"
                text = "Prioritize solutions that can appear in Microsoft Teams and later integrate into the claims system."
                appliesToFrameworkQuestions = @("phase2.user_interaction_pattern", "phase3.architecture_pattern")
            },
            @{
                id   = "grounded-answers-only"
                text = "The agent must show source guidance, flag uncertainty, and avoid making coverage decisions."
                appliesToFrameworkQuestions = @("phase2.data_strategy", "phase2.compliance_governance", "phase3.recommendation_quality")
            }
        )
        lastEditedBy = "admin@nfumutual.co.uk"
        lastEditedAt = "2026-06-03T16:15:17+01:00"
        auditTrail   = @(
            @{
                changedAt  = "2026-05-20T09:00:00.000+01:00"
                changedBy  = "admin@nfumutual.co.uk"
                changeType = "created"
            },
            @{
                changedAt  = "2026-06-03T16:15:17+01:00"
                changedBy  = "seed-script"
                changeType = "seeded-via-admin-endpoint"
            }
        )
    }

    $guidanceUrl = "$BaseUrl/admin/guidance/org-nfum"
    $body = $guidancePayload | ConvertTo-Json -Depth 10

    try {
        $response = Invoke-RestMethod -Method POST -Uri $guidanceUrl -ContentType "application/json" -Body $body -TimeoutSec 60
        if ($response.ok) {
            Write-Host "   ✓ Guidance document created/updated for org-nfum (instr-nfum-claims-001)" -ForegroundColor Green
        } else {
            Write-Error "Guidance endpoint returned ok=false: $($response | ConvertTo-Json)"
        }
    } catch {
        # 409 conflict = already exists, which is fine (idempotent)
        if ($_.Exception.Response.StatusCode -eq 409) {
            Write-Host "   ↺ Guidance already exists for org-nfum (safe to ignore)" -ForegroundColor Yellow
        } else {
            Write-Error "Failed to seed guidance: $_"
        }
    }

    # Also seed the demo org
    Write-Host "📦 Seeding demo org guidance (org-demo)..." -ForegroundColor Yellow
    $demoPayload = @{
        instructionSetId     = "instr-demo-enterprise-001"
        customerOrganizationId = "org-demo"
        version              = 1
        activeFlag           = $true
        scope                = "customerOrganization"
        activeFrom           = "2026-05-29T13:00:00.000+01:00"
        organizationContext  = @{
            companySummary      = "Generic enterprise organization evaluating Microsoft AI technology for internal knowledge management and employee productivity use cases."
            businessPriorities  = @(
                "Improve employee productivity with AI-assisted tools",
                "Reduce time spent finding internal information"
            )
            preferredChannels   = @("Microsoft Teams", "SharePoint")
            operatingConstraints = @(
                "Must use Microsoft-approved services only",
                "Data must remain within the Azure tenant"
            )
            technologyPreferences = @(
                "Prefer low-code solutions where possible",
                "Microsoft 365 ecosystem preferred"
            )
        }
        instructions = @(
            @{
                id   = "m365-first"
                text = "Prioritize Microsoft 365 and Copilot Studio solutions before recommending pro-code or custom-build options."
                appliesToFrameworkQuestions = @("phase2.build_style_control_level", "phase3.architecture_pattern")
            },
            @{
                id   = "data-residency"
                text = "All data must remain within the organization Azure tenant — no external data processing or third-party models."
                appliesToFrameworkQuestions = @("phase2.compliance_governance", "phase2.data_strategy")
            }
        )
        lastEditedBy = "admin@demo.example.com"
        lastEditedAt = "2026-06-03T16:15:17+01:00"
        auditTrail   = @(
            @{
                changedAt  = "2026-05-29T13:00:00.000+01:00"
                changedBy  = "admin@demo.example.com"
                changeType = "created"
            }
        )
    }

    $demoUrl = "$BaseUrl/admin/guidance/org-demo"
    $demoBody = $demoPayload | ConvertTo-Json -Depth 10
    try {
        $response = Invoke-RestMethod -Method POST -Uri $demoUrl -ContentType "application/json" -Body $demoBody -TimeoutSec 60
        if ($response.ok) {
            Write-Host "   ✓ Guidance document created/updated for org-demo" -ForegroundColor Green
        }
    } catch {
        if ($_.Exception.Response.StatusCode -eq 409) {
            Write-Host "   ↺ Guidance already exists for org-demo (safe to ignore)" -ForegroundColor Yellow
        } else {
            Write-Warning "Could not seed org-demo guidance: $_"
        }
    }
    Write-Host ""
}

Write-Host "✅ Seed complete." -ForegroundColor Green
Write-Host ""
Write-Host "To validate similar-project search:" -ForegroundColor Cyan
Write-Host "  1. POST $BaseUrl/sessions  body: {`"customerOrganizationId`": `"org-nfum`"}"
Write-Host "  2. POST /sessions/:id/intake  body: {`"intake`": {...}}"
Write-Host "  3. GET  /sessions/:id/similar-projects"
Write-Host ""
