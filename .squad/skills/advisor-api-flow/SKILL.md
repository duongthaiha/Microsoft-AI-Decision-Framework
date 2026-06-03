# Skill: Driving the Advisor API Flow Programmatically

**Category:** Integration / Testing  
**Extracted from:** Wave 4 live demo validation (2026-06-03)

---

## Problem Pattern

You need to exercise the full advisor flow (session → intake → conversation → recommendation) programmatically — for demos, integration tests, or automation — without writing a UI.

---

## Full Flow Sequence

```
POST /sessions                          → { sessionId, activeInstructionSetId }
POST /sessions/:id/intake               → { firstAgentTurn }
POST /sessions/:id/messages (loop)      → { agentTurn, readinessState }
GET  /sessions/:id/recommendation       → { recommendation }
GET  /sessions/:id/similar-projects     → { searchResult.matches[] }
POST /sessions/:id/feedback             → { recordedAt }
DELETE /sessions/:id                    → { endedAt }
```

---

## Intake Payload Shape

```json
{
  "intake": {
    "submittedAt": "2026-06-03T15:00:00Z",
    "formTitle": "AI Advisor Intake Form",
    "respondent": {
      "name": "Sarah Williams",
      "role": "Regional Claims Operations Manager",
      "organisation": "NFU Mutual"
    },
    "answers": {
      "problem_plain_english": "string",
      "improvement_measures": ["Faster claim triage", "..."],
      "preferred_place_to_use_agent": ["Microsoft Teams", "Inside the claims system"],
      "...": "flat Record<questionId, string | string[]>"
    },
    "validationState": "valid"
  }
}
```

All question IDs come from the form schema (`agents/backlog/sample-intake-form-nfum.json`). Multi-select / multi-text questions use `string[]`, all others use `string`.

---

## Message Loop Pattern

```javascript
const terminalStates = new Set(['readyForRecommendation', 'recommendationDelivered', 'ended']);
let readinessState = 'phase1InProgress';
let lastAgentTurn = firstAgentTurnFromIntake;

while (!terminalStates.has(readinessState) && turnCount < MAX_TURNS) {
  // Phase-aware answer selection:
  let answer;
  if (lastAgentTurn?.messageType === 'summary' && lastAgentTurn?.phase?.startsWith('phase3')) {
    answer = 'proceed';  // Trigger recommendation generation
  } else if (lastAgentTurn?.messageType === 'recommendation') {
    readinessState = 'readyForRecommendation';
    break;
  } else {
    answer = yourCannedAnswer;
  }

  const { agentTurn, readinessState: rs } = await POST /sessions/:id/messages { content: answer };
  readinessState = rs;
  lastAgentTurn = agentTurn;
}
```

---

## Turn Budget (NFU Mutual scenario with org-specific custom instructions)

| Phase | Turns | Notes |
|---|---|---|
| Phase 1 BXT | 1 | Data access / permissions question |
| Phase 2 Tech | 1 | 3 questions pre-answered by custom instructions; 1 POC scope question |
| Phase 3 | 1 | Summary → "proceed" → recommendation inline |
| **Total** | **3** | With `instr-nfum-claims-001` active |

Without custom instructions, expect 6–8 turns.

---

## readinessState Quirk

`POST /sessions/:id/messages` returns a `readinessState` from a computed `evaluateReadiness()` function, not the stored `session.conversationCapture.readinessState`. As of 2026-06-03 this means `readinessState` stays `phase1InProgress` through Phase 3 delivery.

**Workaround:** Detect recommendation delivery by checking `agentTurn.messageType === 'recommendation'`, then break the loop and call GET /recommendation. The recommendation endpoint reads the stored state and works correctly.

---

## GET /recommendation Response Shape

```json
{
  "ok": true,
  "data": {
    "sessionId": "...",
    "recommendation": {
      "generatedAt": "...",
      "status": "recommendationReady",
      "confidence": "Medium-High",
      "recommendedApproach": {
        "summary": "Teams-first Copilot Studio + Azure AI Search + Azure OpenAI...",
        "primaryTechnologies": [{ "name": "...", "role": "..." }],
        "supportingTechnologies": [{ "name": "...", "role": "..." }]
      },
      "rationale": [{ "reason": "...", "evidence": ["..."] }],
      "assumptions": ["..."],
      "followUpQuestions": ["..."],
      "similarProjectHighlights": [{ "projectId": "...", "title": "...", "whyItMatters": "..." }],
      "decisionEvidenceSources": ["intake", "customInstructions", "conversation", "frameworkDocs", "projectSearch"]
    }
  }
}
```

Note: `rationale` is an **array of objects**, not a string. Each entry has `reason: string` and `evidence: string[]`.

---

## GET /similar-projects Response Shape

```json
{
  "data": {
    "searchResult": {
      "matches": [
        { "projectId": "...", "title": "...", "score": 0.972, "matchRationale": "...", "technologies": ["..."] }
      ]
    }
  }
}
```

`matches` is either `SimilarProjectMatch[]` or `{ noMatchFound: true, reason: "..." }`. Check `Array.isArray(matches)` before iterating. `score` is 0–1 normalised. Returns `500 SEARCH_FAILURE` if the Search index doesn't exist.

---

## Error Handling Notes

| Scenario | HTTP | Body | Handling |
|---|---|---|---|
| Search index not seeded | 500 | `{ code: "SEARCH_FAILURE" }` | Print friendly note, continue |
| Recommendation not ready | 422 | `{ code: "RECOMMENDATION_NOT_READY" }` | Check readinessState first |
| Session not found | 404 | `{ code: "INVALID_SESSION" }` | Abort — session lost |
| Internal error on message | 500 | `{ code: "INTERNAL_ERROR" }` | Use GET /messages/latest to recover state |

---

## Cold-Start Note

API is deployed with `min-replicas=0`. First call after inactivity takes 10–30s. Probe `/health` with retry loop (6 × 15s = 90s budget) before starting the flow.

---

## Live Demo Scripts

```bash
# Node.js (no deps, Node 20+)
node agents/advisor/examples/run-advisor-demo.mjs

# PowerShell (PS 7+)
.\agents\advisor\examples\run-advisor-demo.ps1

# Override base URL
ADVISOR_BASE_URL=http://localhost:3000 node agents/advisor/examples/run-advisor-demo.mjs
```
