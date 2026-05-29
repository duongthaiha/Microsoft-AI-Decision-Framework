# Demo Script — AI Framework Advisor Agent POC

_Last updated: 2026-05-29_  
_Demo org: `org-nfum`_  
_Sample respondent: Sarah Williams, Regional Claims Operations Manager, NFU Mutual_

This demo is the boarding pass, the cockpit, and the flight recorder: intake captures the route, the advisor flies the Three-Phase Decision Framework, and the stores prove continuity and grounding.

## Grounding map

Claims in this script are grounded in:

- `agents\advisor\README.md`
- `agents\advisor\api\src\app.ts`
- `agents\advisor\api\src\composition.ts`
- `agents\advisor\api\src\agent\AgentOrchestrator.ts`
- `agents\advisor\api\src\agent\readinessGates.ts`
- `agents\advisor\cli\src\index.ts`
- `agents\advisor\web\src\pages\*.tsx`
- `agents\advisor\web\src\components\*`
- `agents\advisor\data\src\seed\guidance.ts`
- `agents\advisor\data\src\seed\projects.ts`
- `agents\advisor\docs\deployment-runbook.md`

## Presenter setup

### Fast path: CLI-only, fully offline mock mode

Use this when you need the fastest stakeholder proof without Azure, a browser, Cosmos DB, AI Search, or a real LLM.

```powershell
Set-Location 'C:\Git\Microsoft-AI-Decision-Framework\agents\advisor'
npm install
npm run build
Remove-Item Env:\COSMOS_ENDPOINT,Env:\SEARCH_ENDPOINT -ErrorAction SilentlyContinue
$env:ADVISOR_AGENT_MODE='mock'
node .\cli\dist\index.js --org org-nfum --intake ..\backlog\sample-intake-form-nfum.json
```

What to say:

- Mock mode is deterministic and fully offline.
- The CLI imports the built API internals and exercises the same orchestrator flow as the API.
- It loads sample answers from `..\backlog\sample-intake-form-nfum.json` and uses `org-nfum` guidance.
- Watch for: Phase 1 question, Phase 2 custom-instruction pre-answering, Phase 3 summary, final `RecommendationOutput`, and similar-project lookup.

Optional asserted run:

```powershell
Set-Location 'C:\Git\Microsoft-AI-Decision-Framework\agents\advisor'
npm run regression
```

### Full UI path: API + React SPA, local mock mode

Terminal 1 — API:

```powershell
Set-Location 'C:\Git\Microsoft-AI-Decision-Framework\agents\advisor'
npm install
npm run build
Remove-Item Env:\COSMOS_ENDPOINT,Env:\SEARCH_ENDPOINT -ErrorAction SilentlyContinue
$env:ADVISOR_AGENT_MODE='mock'
npm run start --workspace=api
```

Terminal 2 — web:

```powershell
Set-Location 'C:\Git\Microsoft-AI-Decision-Framework\agents\advisor'
npm run dev --workspace=web
```

Open: `http://localhost:5173`

What to say:

- Vite serves the SPA on port `5173` and proxies `/sessions`, `/admin`, and `/health` to the API on port `3000`.
- The UI has four screens: intake (`/`), conversation (`/session/:sessionId`), recommendation (`/session/:sessionId/recommendation`), and admin guidance (`/admin`).
- Local mock mode stores sessions and guidance in memory. Restarting the API clears that memory.

## Walkthrough order

### 1. Customer intake via UI using NFU Mutual sample

Screen: `/`

1. Leave **Organization ID** as `org-nfum`.
2. Use the intake wizard sections from the embedded form JSON.
3. For demo speed, use the sample answers from `agents\backlog\sample-intake-form-nfum.json`:
   - Problem: claims handlers spend too much time searching policy documents, guidance, prior notes, and repair guidance.
   - Users: claims handlers and team leaders.
   - Preferred place: inside the claims system and Microsoft Teams.
   - Human boundary: claim decisions, approvals, commitments, complaints, and payments stay human-owned.
   - Sensitive data: customer personal data, claim details, financial information, medical information where relevant.
4. Submit the review screen.

Point out:

- The intake is not treated as a chat turn from the user. It becomes structured opening context submitted to `POST /sessions/:id/intake`.
- The API creates the session first with `POST /sessions`, then stores the intake snapshot and starts Phase 1.

### 2. Phase 1 — Business assessment behavior

Screen: `/session/:sessionId`

Expected first advisor turn:

- Phase: `phase1.businessImpactAssessment`
- Message type: `clarifyingQuestion`
- It asks about data access controls because the intake includes sensitive information and SharePoint-like knowledge locations.

Presenter answer:

```text
Yes — SharePoint and claims-system permissions are already in place and maintained by claims operations.
```

Point out:

- This is the BXT gate: the agent is checking technology feasibility before recommending a shiny object.
- The response is stored as a conversation fact and advances readiness toward Phase 2.

### 3. Phase 2 — Technology groupings behavior

Expected advisor turn:

- Phase: `phase2.technologyGroupings`
- It shows **Pre-answered from your organization's custom instructions** when NFU guidance is active.
- Active NFU instructions include:
  - `human-approval-required`
  - `preferred-user-experience`
  - `grounded-answers-only`

Presenter answer:

```text
For the POC it should only draft and recommend actions. No claims-system write-back.
```

Point out:

- The agent does not ask questions already covered by active org instructions.
- It still asks the missing action-safety boundary because Q7 needs an explicit POC decision.
- This is the Cast, not a cage: Copilot Studio, Azure AI Search, and Azure OpenAI / Microsoft Foundry play different roles.

### 4. Phase 3 — Framework combination advisor behavior

Expected advisor turn:

- Phase: `phase3.scenarioSpecificSelection`
- Message type: `summary`
- It summarizes a Teams-first, human-in-the-loop, grounded retrieval assistant.

Presenter answer:

```text
proceed
```

Point out:

- The recommendation is a combination, not a single-product trophy: Copilot Studio for orchestration, Azure AI Search for retrieval, Azure OpenAI / Microsoft Foundry for language capability.
- The current mock recommendation is deterministic and not a live LLM response.

### 5. Azure AI Search-backed similar-project lookup

In local mock mode:

- The `InMemoryProjectSearch` adapter returns seeded insurance/claims matches.
- For NFU, expect matches such as `Policy Guidance Assistant for Commercial Insurance` and `Claims Triage Copilot for Weather Events`.

In Azure mode:

- If `COSMOS_ENDPOINT` and `SEARCH_ENDPOINT` are present, `composition.ts` swaps to `AzureAiSearchProjectSearch` from `@advisor/data`.
- The Azure adapter queries the project knowledge index and returns either ranked matches or an explicit `noMatchFound` object.

Presenter endpoint call, if needed:

```powershell
$sessionId='<session id from UI URL>'
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/sessions/$sessionId/similar-projects"
```

Point out:

- Search is a portfolio memory, not the conversation memory.
- Cosmos owns mutable session and guidance state; Search owns reusable project knowledge.

### 6. Cosmos DB conversation continuity

POC reality:

- Local mock mode uses `InMemoryConversationStore`; continuity lasts while the API process lives.
- Azure mode uses `CosmosConversationStore` when `COSMOS_ENDPOINT` and `SEARCH_ENDPOINT` are both set.
- The UI also keeps a browser `sessionStorage` copy for local rendering, but the API store is the source for the advisor flow.

Presenter endpoint call, if needed:

```powershell
$sessionId='<session id from UI URL>'
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/sessions/$sessionId/messages/latest"
```

Point out:

- There is no full `GET /sessions/:id` endpoint in the current API; the latest-message endpoint is the readback path implemented today.
- In Azure, session and guidance documents partition by `customerOrganizationId`.

### 7. Grounded recommendation reflecting active NFU custom instructions

Screen: `/session/:sessionId/recommendation`

Point out these sections:

- **Recommended Approach:** Teams-first human-in-the-loop guidance assistant.
- **Primary technologies:** Microsoft Copilot Studio, Azure AI Search, Azure OpenAI / Microsoft Foundry.
- **Why this recommendation:** Rationale includes the guidance-retrieval problem, Teams-first channel, Azure AI Search need, and human-in-the-loop controls.
- **Similar Projects:** Highlights prior projects when matches exist.
- **Custom Instruction Influence:** Shows each active instruction and its effect:
  - `human-approval-required` rules out autonomous claim approval/payment/write-back.
  - `preferred-user-experience` prioritizes Teams-first delivery.
  - `grounded-answers-only` requires citations, uncertainty flags, and grounded retrieval.
- **Feedback:** 1–5 rating plus optional comment persists through `POST /sessions/:id/feedback`.

### 8. Admin instruction change via admin UI

Screen: `/admin`

1. Leave org as `org-nfum`.
2. Click **Load Instructions**.
3. Select **New Version** from the active guidance document.
4. Change one instruction, for example:

```text
Prioritize Microsoft Teams for the POC. Any claims-system integration must stay read-only until a human approval workflow is signed off.
```

5. Click **Save**.
6. Click **Activate** on the new version.
7. Start a new assessment from `/` for `org-nfum`.

Point out:

- Admin guidance endpoints are implemented under `/admin/guidance`.
- Activation flips which guidance document `loadActiveGuidance(org-nfum)` returns.
- In mock mode, the change is in memory and is lost when the API process restarts.
- In Azure mode, the change is persisted to Cosmos DB guidance container.

### 9. Redeploy and configuration behavior

Local behavior:

```powershell
# Mock, no Azure data services, no LLM
Remove-Item Env:\COSMOS_ENDPOINT,Env:\SEARCH_ENDPOINT -ErrorAction SilentlyContinue
$env:ADVISOR_AGENT_MODE='mock'
npm run start --workspace=api
```

Azure provisioning/deploy behavior:

```powershell
Set-Location 'C:\Git\Microsoft-AI-Decision-Framework\agents\advisor'
azd env set ADVISOR_AGENT_MODE mock
azd up
```

Config switch rules implemented today:

| Signal | Adapter behavior |
|---|---|
| No `COSMOS_ENDPOINT` or no `SEARCH_ENDPOINT` | In-memory stores/search; offline mode |
| Both `COSMOS_ENDPOINT` and `SEARCH_ENDPOINT` present | Cosmos DB + Azure AI Search adapters |
| `ADVISOR_AGENT_MODE=mock` | `MockCopilotSessionService`; deterministic, no LLM |
| `ADVISOR_AGENT_MODE=copilot` | `RealCopilotSessionService`; requires `GITHUB_TOKEN` or `COPILOT_TOKEN` |

Point out:

- `azd provision` updates Bicep-managed infrastructure.
- `azd deploy` builds and deploys the container image.
- `azd up` does both.
- Bicep outputs wire `COSMOS_ENDPOINT`, `SEARCH_ENDPOINT`, `AZURE_CLIENT_ID`, and Application Insights connection string to the Container App.
- No source-code change is needed to swap mock/in-memory for Azure data adapters; environment is the switchboard.
