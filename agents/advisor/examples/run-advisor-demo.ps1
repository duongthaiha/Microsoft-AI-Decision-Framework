<#
.SYNOPSIS
    Walks the full AI Framework Advisor flow against the live deployed API.

.DESCRIPTION
    1. Create session
    2. Submit a realistic NFU Mutual-style intake
    3. Loop messages until readiness reaches readyForRecommendation (max 15 turns)
    4. Retrieve and pretty-print recommendation
    5. Retrieve similar projects (graceful if index not seeded)
    6. Submit feedback and end session

.PARAMETER BaseUrl
    Override the API base URL. Defaults to $env:ADVISOR_BASE_URL or the live URL.

.EXAMPLE
    .\run-advisor-demo.ps1
    $env:ADVISOR_BASE_URL="https://your-api.azurecontainerapps.io"; .\run-advisor-demo.ps1

.NOTES
    Requires PowerShell 7+ (uses Invoke-RestMethod with -SkipHttpErrorCheck).
    On Windows PowerShell 5.1 replace -SkipHttpErrorCheck with try/catch wrappers.
#>
param(
    [string]$BaseUrl = ($env:ADVISOR_BASE_URL ?? 'https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io')
)

$ErrorActionPreference = 'Stop'
$CustomerOrgId = 'org-nfum'
$MaxTurns = 15

# ---------------------------------------------------------------------------
# Canned answers for follow-up questions
# ---------------------------------------------------------------------------
$CannedAnswers = @(
    "Our claims handlers spend too much time searching policy documents and internal guidance before deciding on next best action. We want a claims assistant that helps them quickly find relevant guidance, identify missing evidence, and draft customer updates — all while keeping the handler in control of every decision.",
    "The assistant needs to work inside our claims management system and Microsoft Teams. Handlers will ask it questions during live claim handling, so conversational interaction is key. We need it grounded on our internal SharePoint documents and policy PDFs.",
    "Data sovereignty and regulatory compliance are non-negotiable. Customer PII and claim details must stay within our UK Azure tenant. Full audit trail required for every AI-assisted decision. We need to show the FCA we have human oversight.",
    "Our IT team is comfortable with Microsoft's Azure platform and Power Platform. We have limited pro-code capacity right now, so a low-code or guided approach would suit us better than building from scratch.",
    "Around 500 claims handlers across the UK. Integration with our existing Microsoft 365 environment is a priority. We want something that feels native in Teams, not a separate standalone tool.",
    "We'd like a pilot running within three months to coincide with storm season. Starting with rural property claims — our most complex and highest volume category.",
    "The primary scenario is a claims handler opening a rural property claim and needing guidance on policy wording, missing evidence checks, and a suggested customer update draft.",
    "Success means handlers can resolve routine rural claims 30% faster with fewer escalations.",
    "We're not looking to fully automate claims decisions — the AI must always recommend and never decide. Any payment or coverage commitment stays with the human handler.",
    "yes",
    "confirm",
    "that's correct",
    "proceed with recommendation",
    "yes please",
    "confirmed"
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Banner([string]$Title) {
    $line = "-" * 60
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body,
        [int]$AttemptNum = 1
    )
    $url = "$BaseUrl$Path"
    $params = @{
        Uri             = $url
        Method          = $Method
        ContentType     = 'application/json'
        SkipHttpErrorCheck = $true
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
    }
    try {
        $response = Invoke-RestMethod @params -StatusCodeVariable statusCode
        return @{ Status = $statusCode; Json = $response }
    }
    catch {
        if ($AttemptNum -lt 3) {
            Write-Host "  Warning: Network error (attempt $AttemptNum/3): $($_.Exception.Message) — retrying in 5s..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
            return Invoke-Api -Method $Method -Path $Path -Body $Body -AttemptNum ($AttemptNum + 1)
        }
        throw
    }
}

function Write-AgentTurn([object]$Turn) {
    if ($null -eq $Turn) { return }
    $phase = if ($Turn.phase) { " [$($Turn.phase)]" } else { "" }
    $type  = if ($Turn.messageType) { " ($($Turn.messageType))" } else { "" }
    Write-Host ""
    Write-Host "  Agent$phase$type:" -ForegroundColor Green
    $Turn.content -split "`n" | ForEach-Object { Write-Host "     $_" }
}

# ---------------------------------------------------------------------------
# Step 0: Health check (cold-start probe)
# ---------------------------------------------------------------------------
Write-Banner "AI Framework Advisor — End-to-End Demo"
Write-Host "  Base URL : $BaseUrl"
Write-Host "  Org      : $CustomerOrgId"
Write-Host "  Max turns: $MaxTurns"

Write-Banner "Step 0: Health check (cold-start probe)"
Write-Host "  Probing /health — first call may take 10-30 s if replica is cold..."

$healthy = $false
for ($i = 1; $i -le 6; $i++) {
    try {
        $h = Invoke-Api -Method 'GET' -Path '/health'
        if ($h.Status -eq 200 -and $h.Json.ok) {
            Write-Host "  OK API healthy — service: $($h.Json.service), ts: $($h.Json.ts)" -ForegroundColor Green
            $healthy = $true
            break
        }
    } catch {
        # ignore
    }
    Write-Host "  Not ready yet (attempt $i/6) — waiting 15 s..."
    Start-Sleep -Seconds 15
}

if (-not $healthy) {
    Write-Host "  ERROR: API did not respond after 90 s. Check the Container App replica state." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Step 1: Create session
# ---------------------------------------------------------------------------
Write-Banner "Step 1: Create session"

$r1 = Invoke-Api -Method 'POST' -Path '/sessions' -Body @{
    customerOrganizationId = $CustomerOrgId
    userId = 'demo-user-sarah-williams'
}

if ($r1.Status -ne 201 -or -not $r1.Json.ok) {
    Write-Host "  ERROR: Failed to create session: $($r1.Json | ConvertTo-Json)" -ForegroundColor Red
    exit 1
}

$sessionId = $r1.Json.data.sessionId
Write-Host "  OK Session created: $sessionId" -ForegroundColor Green
if ($r1.Json.data.activeInstructionSetId) {
    Write-Host "  Active instruction set: $($r1.Json.data.activeInstructionSetId)"
}

# ---------------------------------------------------------------------------
# Step 2: Submit intake
# ---------------------------------------------------------------------------
Write-Banner "Step 2: Submit intake (NFU Mutual — rural claims assistant)"

$intake = @{
    submittedAt = (Get-Date -Format 'o')
    formTitle   = 'AI Advisor Intake Form'
    respondent  = @{
        name            = 'Sarah Williams'
        role            = 'Regional Claims Operations Manager'
        organisation    = 'NFU Mutual'
        country         = 'United Kingdom'
        areaOfExpertise = 'Rural insurance claims, especially farm property and weather-related damage'
    }
    answers = @{
        problem_plain_english     = 'Claims handlers spend too much time searching policy documents, internal guidance, previous claim notes, and repair guidance before deciding the next best action.'
        affected_people           = 'Claims handlers, team leaders, brokers, and customers waiting for claim decisions.'
        why_now                   = 'Storm-related claims are increasing, and newer handlers need more support to make consistent decisions.'
        success_description       = 'Handlers can quickly understand what guidance applies to a claim, what information is missing, and what they should do next.'
        improvement_measures      = @('Faster claim triage','Fewer escalations for routine cases','More consistent decisions','Better customer updates','Less time searching documents')
        must_not_happen           = 'The AI should not approve or reject claims by itself. It should support the handler, not replace their judgement.'
        main_users                = 'Claims handlers and claims team leaders.'
        user_experience_level     = 'Mixed experience. Some are senior specialists; others are newer handlers learning rural and agricultural claims.'
        current_work_locations    = 'They work across claims systems, email, Teams, policy documents, internal guidance, and case notes.'
        preferred_place_to_use_agent = @('Inside the claims system','Microsoft Teams')
        moment_of_need            = 'When a handler opens a new rural property claim, reviews incoming evidence, prepares a customer update, or decides whether to escalate the case.'
        agent_should_interrupt    = 'Both, depending on the situation'
        questions_to_answer       = @('What policy wording may apply to this claim?','What information is missing?','Has this type of claim been handled before?','What guidance should the handler consider?','When should the claim be escalated?')
        tasks_to_help_complete    = @('Summarise claim details','Find relevant internal guidance','Draft customer update messages','Suggest next steps','Highlight risks or missing information')
        human_owned_decisions     = 'Claim decisions, approvals, customer commitments, complaint handling, and any payment decision.'
        business_knowledge        = @('Policy documents','Claims handling guidance','Farm property claim procedures','Storm and flood claim guidance','Previous similar case examples','Escalation rules')
        information_location      = "SharePoint, internal claims systems, email templates, policy PDFs, team guidance notes, and experienced colleagues' knowledge."
        information_freshness     = 'Not always. Some guidance is formal and current, while some local knowledge sits with senior handlers.'
        poor_advice_risk          = 'A handler could give the wrong customer message, miss an escalation point, or apply the wrong policy guidance.'
        sensitive_information     = @('Customer personal data','Claim details','Financial information','Medical information where relevant','Commercially sensitive farm or business data')
        comfort_controls          = @('Show where answers came from','Make uncertainty clear','Require human approval','Keep an audit trail','Respect existing access permissions','Escalate complex or high-value claims')
        tone                      = 'Clear, practical, and careful. It should sound like a helpful senior claims colleague, not a chatbot making decisions.'
        trust_factors             = 'It explains its reasoning, links to source guidance, flags uncertainty, and does not pretend to know things it cannot verify.'
        rejection_factors         = 'Generic answers, overconfidence, wrong policy references, or anything that feels like it is replacing claims expertise.'
        real_world_situation      = 'A customer reports storm damage to several outbuildings on a farm. The handler needs to understand what cover may apply, what evidence is needed, whether any exclusions matter, and whether the case should be escalated.'
        ai_expected_response      = 'Summarise the claim, find the relevant policy wording and claims guidance, list missing information, suggest the next handler actions, and draft a careful customer update.'
        ai_boundaries             = 'It should not confirm cover, reject the claim, approve payment, or send the customer message without handler review.'
        first_use_case            = 'Helping claims handlers find the right guidance quickly and understand the next best action for routine rural property claims.'
    }
    validationState = 'valid'
}

$r2 = Invoke-Api -Method 'POST' -Path "/sessions/$sessionId/intake" -Body @{ intake = $intake }

if ($r2.Status -ne 200 -or -not $r2.Json.ok) {
    Write-Host "  ERROR: Intake failed: $($r2.Json | ConvertTo-Json)" -ForegroundColor Red
    exit 1
}

Write-Host "  OK Intake submitted" -ForegroundColor Green
if ($r2.Json.data.firstAgentTurn) {
    Write-AgentTurn $r2.Json.data.firstAgentTurn
}

# ---------------------------------------------------------------------------
# Step 3: Message loop
# ---------------------------------------------------------------------------
Write-Banner "Step 3: Message loop (until recommendation ready)"

$readinessState = 'phase1InProgress'
$turnCount = 0
$cannedIdx = 0
$terminalStates = @('readyForRecommendation','recommendationDelivered','ended')

while ($terminalStates -notcontains $readinessState -and $turnCount -lt $MaxTurns) {
    $turnCount++
    $answer = $CannedAnswers[$cannedIdx % $CannedAnswers.Count]
    $cannedIdx++

    $preview = if ($answer.Length -gt 80) { $answer.Substring(0, 80) + '...' } else { $answer }
    Write-Host ""
    Write-Host "  User turn ${turnCount}: `"$preview`"" -ForegroundColor Yellow

    $rm = Invoke-Api -Method 'POST' -Path "/sessions/$sessionId/messages" -Body @{ content = $answer }

    if ($rm.Status -ne 200 -or -not $rm.Json.ok) {
        Write-Host "  ERROR: Message failed: $($rm.Json | ConvertTo-Json)" -ForegroundColor Red
        break
    }

    $readinessState = if ($rm.Json.data.readinessState) { $rm.Json.data.readinessState } else { $readinessState }
    Write-Host "  Readiness: $readinessState"
    Write-AgentTurn $rm.Json.data.agentTurn

    if ($terminalStates -contains $readinessState) {
        Write-Host ""
        Write-Host "  Recommendation gate reached!" -ForegroundColor Green
        break
    }

    Start-Sleep -Milliseconds 500
}

if ($turnCount -ge $MaxTurns -and $terminalStates -notcontains $readinessState) {
    Write-Host ""
    Write-Host "  Warning: Reached $MaxTurns turn cap. State: $readinessState" -ForegroundColor Yellow
    Write-Host "  Proceeding to retrieve recommendation anyway..."
}

# ---------------------------------------------------------------------------
# Step 4: Retrieve recommendation
# ---------------------------------------------------------------------------
Write-Banner "Step 4: Retrieve recommendation"

$r4 = Invoke-Api -Method 'GET' -Path "/sessions/$sessionId/recommendation"

if ($r4.Status -eq 200 -and $r4.Json.ok) {
    $rec = $r4.Json.data.recommendation
    Write-Host ""
    Write-Host "  RECOMMENDATION RECEIVED" -ForegroundColor Green
    Write-Host ""
    if ($rec.recommendedApproach.summary) {
        Write-Host "  Primary Recommendation:" -ForegroundColor Cyan
        Write-Host "     $($rec.recommendedApproach.summary)"
        if ($rec.recommendedApproach.primaryTechnologies -and $rec.recommendedApproach.primaryTechnologies.Count -gt 0) {
            Write-Host ""
            Write-Host "  Primary Technologies:" -ForegroundColor Cyan
            foreach ($t in $rec.recommendedApproach.primaryTechnologies) {
                Write-Host "     * $($t.name): $($t.role)"
            }
        }
    }
    if ($rec.rationale) {
        Write-Host ""
        Write-Host "  Rationale:" -ForegroundColor Cyan
        if ($rec.rationale -is [array]) {
            foreach ($r in $rec.rationale) {
                Write-Host "     * $($r.reason)"
                if ($r.evidence) {
                    foreach ($e in $r.evidence) { Write-Host "       -> $e" }
                }
            }
        } else {
            $rec.rationale -split "`n" | ForEach-Object { Write-Host "     $_" }
        }
    }
    if ($rec.assumptions -and $rec.assumptions.Count -gt 0) {
        Write-Host ""
        Write-Host "  Assumptions:" -ForegroundColor Cyan
        $rec.assumptions | ForEach-Object { Write-Host "     * $_" }
    }
    $nextItems = if ($rec.followUpQuestions) { $rec.followUpQuestions } else { $rec.nextSteps }
    if ($nextItems -and $nextItems.Count -gt 0) {
        Write-Host ""
        Write-Host "  Follow-up Questions / Next Steps:" -ForegroundColor Cyan
        $nextItems | ForEach-Object { Write-Host "     * $_" }
    }
    if (-not $rec.recommendedApproach -and -not $rec.rationale) {
        Write-Host "  Raw recommendation:"
        Write-Host ($rec | ConvertTo-Json -Depth 10)
    }
} elseif ($r4.Status -eq 422) {
    Write-Host "  Note: Recommendation not ready (state: $readinessState)" -ForegroundColor Yellow
    Write-Host ($r4.Json | ConvertTo-Json -Depth 5)
} else {
    Write-Host "  Note: Recommendation endpoint returned $($r4.Status):" -ForegroundColor Yellow
    Write-Host ($r4.Json | ConvertTo-Json -Depth 5)
}

# ---------------------------------------------------------------------------
# Step 5: Similar projects
# ---------------------------------------------------------------------------
Write-Banner "Step 5: Similar projects"

$r5 = Invoke-Api -Method 'GET' -Path "/sessions/$sessionId/similar-projects"

if ($r5.Status -eq 200 -and $r5.Json.ok) {
    $matches = $r5.Json.data.searchResult.matches
    $matchArray = if ($matches -is [array]) { $matches } else { @() }
    if ($null -eq $matchArray -or $matchArray.Count -eq 0) {
        Write-Host "  Note: No similar projects found (Search index may not be seeded yet)."
    } else {
        Write-Host "  OK Found $($matchArray.Count) similar project(s):" -ForegroundColor Green
        foreach ($m in $matchArray) {
            Write-Host ""
            $name = if ($m.title) { $m.title } elseif ($m.projectId) { $m.projectId } else { 'Unknown' }
            Write-Host "  Project: $name" -ForegroundColor Cyan
            if ($m.matchRationale) {
                $summary = if ($m.matchRationale.Length -gt 120) { $m.matchRationale.Substring(0,120) + '...' } else { $m.matchRationale }
                Write-Host "     $summary"
            }
            if ($null -ne $m.score) { Write-Host "     Score: $([math]::Round($m.score, 3))" }
        }
    }
} elseif ($r5.Status -eq 500 -and $r5.Json.error.code -eq 'SEARCH_FAILURE') {
    Write-Host "  Note: Similar projects unavailable — the Search index is not yet seeded." -ForegroundColor Yellow
    Write-Host "  (Expected for fresh deployments. Run: npm run seed in agents/advisor/)"
} else {
    Write-Host "  Note: Similar projects returned $($r5.Status) — skipping gracefully." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 6: Feedback + end session
# ---------------------------------------------------------------------------
Write-Banner "Step 6: Submit feedback"

$r6 = Invoke-Api -Method 'POST' -Path "/sessions/$sessionId/feedback" -Body @{
    rating  = 5
    comment = 'Excellent guidance — Copilot Studio + M365 Agents SDK recommendation was spot on for our Teams-first, low-code, compliance-heavy scenario.'
}

if ($r6.Status -eq 200 -and $r6.Json.ok) {
    Write-Host "  OK Feedback recorded at $($r6.Json.data.recordedAt)" -ForegroundColor Green
} else {
    Write-Host "  Note: Feedback returned $($r6.Status): $($r6.Json | ConvertTo-Json)" -ForegroundColor Yellow
}

Write-Banner "Step 7: End session"

$r7 = Invoke-Api -Method 'DELETE' -Path "/sessions/$sessionId"

if ($r7.Status -eq 200 -and $r7.Json.ok) {
    Write-Host "  OK Session ended at $($r7.Json.data.endedAt)" -ForegroundColor Green
} else {
    Write-Host "  Note: End session returned $($r7.Status): $($r7.Json | ConvertTo-Json)" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Banner "Demo complete"
Write-Host "  Session    : $sessionId"
Write-Host "  Turns      : $turnCount"
Write-Host "  Final state: $readinessState"
Write-Host ""
