# Decision: M2 Observability + Foundry Hosted Agent

**Author:** Parker (DevOps/SRE)  
**Date:** 2026-05-27T07:00:00Z  
**Status:** Shipped (observability) / M2.1 follow-up (Foundry)

---

## EPIC 1 — Application Insights Observability ✅ Shipped

### What shipped

| Item | Status | Detail |
|---|---|---|
| `infra/modules/monitoring.bicep` | ✅ Pre-existing + enhanced | Log Analytics (PerGB2018, 30d) + App Insights workspace-based. Added `instrumentationKey` output. |
| `infra/main.bicep` wiring | ✅ Pre-existing | `appInsightsConnectionString` passed to container-apps.bicep as `APPLICATIONINSIGHTS_CONNECTION_STRING` env var. |
| `applicationinsights@^2.9.8` npm | ✅ Installed | `cd agent && npm install applicationinsights@^2.9.5` resolved to 2.9.8. |
| SDK init in `agent/src/index.ts` | ✅ Wired | Import + `setup().setAutoCollectConsole(true,true).setAutoDependencyCorrelation(true).start()` guarded on env var. |
| `requestProcessed` custom event | ✅ Wired | `appInsights.defaultClient?.trackEvent(...)` in `agent/src/adapter/responses.ts` after each loop completion. |

### Custom event shape

```ts
appInsights.defaultClient?.trackEvent({
  name: "requestProcessed",
  properties: {
    requestId,       // Cosmos request ID
    sessionId,       // session
    durationMs,      // total loop duration string
    toolsInvoked,    // count of phases executed (bxt+search+reuse+readiness)
    finalGrouping,   // readinessBrief.recommendedPlatform.platformKey
    finalTech,       // readinessBrief.recommendedPlatform.displayName
  },
});
```

### Verification query (after deploy, wait 2–5 min)

```kusto
// In Application Insights → Logs:
customEvents
| where name == "requestProcessed"
| project timestamp, tostring(customDimensions.requestId), tostring(customDimensions.durationMs), tostring(customDimensions.finalTech)
| order by timestamp desc
| take 20

requests
| where url contains "/v1/responses"
| project timestamp, duration, resultCode
| order by timestamp desc
| take 20
```

### Guardrails respected

- CORS middleware order NOT changed (Dallas's fix preserved) ✅
- `jwt-middleware.ts` NOT modified ✅
- `responses.ts` reasoning logic NOT changed — only `trackEvent` ADDED ✅
- All 20 tests pass after changes ✅

---

## EPIC 2 — Foundry Hosted Agent Registration 🟡 M2.1 Blocked

See `.squad/decisions/inbox/parker-foundry-hosted-agent-blocker.md` for full detail.

**Summary:** Documented as M2.1 follow-up. Three blockers: no Foundry project infra, container doesn't implement protocol library, no Bicep for agent version registration.

**Artefacts produced:**
- `scripts/register-foundry-agent.sh` — reference registration script (Python SDK, guards on missing env vars)
- `docs/m2-foundry-hosted-agent.md` — M2.1 handoff doc with step-by-step unblocking plan

---

## Commit strategy

Pushed App Insights changes first (separate commit to reduce conflict with Dallas's streaming work on index.ts + responses.ts), then Foundry docs.
