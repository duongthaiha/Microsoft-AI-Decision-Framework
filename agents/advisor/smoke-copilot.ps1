$ErrorActionPreference = 'Stop'
$base = "https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io"

function PostJson($url, $body, $timeout = 240) {
  $json = $body | ConvertTo-Json -Depth 12
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec $timeout
}

Write-Host "=== 1. create session ==="
$create = PostJson "$base/sessions" @{ customerOrganizationId = 'org-nfum'; userId = 'smoke-test' }
$sid = $create.data.sessionId
Write-Host "sessionId=$sid activeInstr=$($create.data.activeInstructionSetId)"

Write-Host "`n=== 2. submit intake (NFU) ==="
$intake = @{
  submittedAt   = (Get-Date).ToString('o')
  formTitle     = 'AI Advisor Intake Form'
  answers       = @{
    problem_plain_english     = 'Claims handlers spend too much time searching policy documents, internal guidance, previous claim notes, and repair guidance before deciding the next best action.'
    affected_people           = 'Claims handlers, team leaders, brokers, and customers waiting for claim decisions.'
    why_now                   = 'Storm-related claims are increasing, and newer handlers need more support to make consistent decisions.'
    sensitive_information     = @('personal customer data', 'financial information', 'property assessment records')
    information_location      = 'SharePoint libraries, policy PDFs, claims system notes'
    main_users                = 'Claims handlers and team leaders'
    preferred_place_to_use_agent = @('Microsoft Teams', 'Claims system integration')
    agent_should_interrupt    = 'Only when flagging missing information or escalation triggers'
    user_experience_level     = 'Mixed team — mostly claims handlers with varying tech confidence'
    business_knowledge        = @('Policy documents', 'Claim procedures', 'Repair guidance notes')
    must_not_happen           = 'Agent must never commit claim decisions, approve payments, or make customer commitments without human review.'
  }
  validationState = 'valid'
}
$r2 = PostJson "$base/sessions/$sid/intake" @{ intake = $intake }
Write-Host "firstAgentTurn:"; $r2.data.firstAgentTurn | ConvertTo-Json -Depth 6

$answers = @(
  'Yes — SharePoint and system permissions are already in place.',
  'Draft and recommend only — no system write-back in the POC.',
  'proceed'
)
$turn = 0
foreach ($a in $answers) {
  $turn++
  Write-Host "`n=== 3.$turn message: $a ==="
  $rm = PostJson "$base/sessions/$sid/messages" @{ content = $a }
  Write-Host "readiness=$($rm.data.readinessState)"
  Write-Host "agentTurn:"; $rm.data.agentTurn | ConvertTo-Json -Depth 6
  $lastReadiness = $rm.data.readinessState
}

Write-Host "`n=== 4. GET recommendation ==="
for ($i = 1; $i -le 4; $i++) {
  try {
    $rec = Invoke-RestMethod -Method Get -Uri "$base/sessions/$sid/recommendation" -TimeoutSec 240
    Write-Host "RECOMMENDATION:"; $rec.data.recommendation | ConvertTo-Json -Depth 12
    break
  } catch {
    Write-Host "rec attempt $i ERR: $_"; Start-Sleep 10
  }
}
