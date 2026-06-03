# Advisor Demo Scripts

End-to-end demonstration scripts for the AI Framework Advisor API. They walk the **full advisor flow** — session creation, intake submission, conversational Q&A loop, recommendation retrieval, similar-project search, feedback, and session teardown — against the **live deployed API**.

---

## Prerequisites

| Script | Requirement |
|---|---|
| `run-advisor-demo.mjs` | **Node.js 20+** (uses built-in `fetch` — no `npm install` needed) |
| `run-advisor-demo.ps1` | **PowerShell 7+** (uses `-SkipHttpErrorCheck` on `Invoke-RestMethod`) |

---

## Running the Node.js script

```bash
# From anywhere — no build step, no dependencies
node agents/advisor/examples/run-advisor-demo.mjs

# Override the API base URL
ADVISOR_BASE_URL=https://your-api.azurecontainerapps.io node agents/advisor/examples/run-advisor-demo.mjs
```

## Running the PowerShell script

```powershell
# From the repo root
.\agents\advisor\examples\run-advisor-demo.ps1

# Override the API base URL
$env:ADVISOR_BASE_URL = "https://your-api.azurecontainerapps.io"
.\agents\advisor\examples\run-advisor-demo.ps1

# Or pass as a parameter
.\agents\advisor\examples\run-advisor-demo.ps1 -BaseUrl "https://your-api.azurecontainerapps.io"
```

---

## What the script does

| Step | Endpoint | Description |
|---|---|---|
| 0 | `GET /health` | Cold-start probe — retries up to 6 × 15 s |
| 1 | `POST /sessions` | Creates a session for `org-nfum` |
| 2 | `POST /sessions/:id/intake` | Submits the full NFU Mutual rural-claims intake |
| 3 | `POST /sessions/:id/messages` | Loops canned answers until `readyForRecommendation` (max 15 turns) |
| 4 | `GET /sessions/:id/recommendation` | Retrieves and pretty-prints the recommendation |
| 5 | `GET /sessions/:id/similar-projects` | Lists similar past projects (graceful if index not seeded) |
| 6 | `POST /sessions/:id/feedback` | Submits a rating 5 / comment |
| 7 | `DELETE /sessions/:id` | Ends the session |

---

## Expected output (live run — 2026-06-03)

```
------------------------------------------------------------
  AI Framework Advisor — End-to-End Demo
------------------------------------------------------------
  Base URL : https://ca-advisor-33wfyfewrvjcg.redplant-6456c196.swedencentral.azurecontainerapps.io
  Org      : org-nfum
  Max turns: 15

  Step 0: Health check → ✅ API healthy

  Step 1: Create session → ✅ session-<uuid>
  Active instruction set: instr-nfum-claims-001

  Step 2: Submit intake → ✅ Intake submitted
  Agent [phase1] asks about data access controls

  Step 3: Message loop (3 user turns)
  Turn 1 → Phase 2 question (3 questions pre-answered by custom instructions)
  Turn 2 → Phase 3 summary — asks to proceed
  Turn 3 → "proceed" → recommendation delivered inline

  Step 4: Retrieve recommendation → ✅ RECOMMENDATION RECEIVED

  Primary Recommendation:
    Start with a Teams-first human-in-the-loop guidance assistant using
    Copilot Studio for conversational orchestration, Azure AI Search for
    grounded retrieval over policy and guidance content, and Azure OpenAI
    or Microsoft Foundry model endpoints for summarization and drafting.

  Primary Technologies:
    • Microsoft Copilot Studio: low-code Teams-first POC orchestration
    • Azure AI Search: grounded retrieval over policy docs and procedures
    • Azure OpenAI / Microsoft Foundry: summarization, drafting, reasoning

  Step 5: Similar projects → ✅ Found 3 (scores 0.972, 0.961, 0.919)
    - Rural Claims Advisor Agent — NFU Mutual (0.972)
    - Claims Triage Copilot for Weather Events (0.961)
    - HR Policy Advisor Agent (0.919)

  Step 6: Feedback → ✅ recorded
  Step 7: End session → ✅

  Turns: 3  |  Final state: readyForRecommendation
```

> **Turns to recommendation:** 3 user turns. Custom instruction set `instr-nfum-claims-001` pre-answers 3 of the Phase 2 framework questions, reducing the total question set significantly.

---

## Cold-start note

The API is deployed to Azure Container Apps with **`min-replicas=0`**. The first call after a period of inactivity triggers a cold start that can take **10–30 seconds**. The scripts handle this automatically with a 6-attempt retry loop (90 s total budget). If you need instant responses in demos, set `min-replicas=1` in the Bicep infra and redeploy.

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `ADVISOR_BASE_URL` | Live ACA URL | Override to point at a local or staging instance |

For local development:
```bash
# Start the API locally first (from agents/advisor/)
npm run dev

# Then run the demo against localhost
ADVISOR_BASE_URL=http://localhost:3000 node agents/advisor/examples/run-advisor-demo.mjs
```
