# advisor-agent/agent

Backend service for the AI Project Advisor Agent.

## What this is

The agent exposes a [Microsoft Foundry Hosted Agent](https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents) runtime endpoint and wires the Microsoft AI Decision Framework reasoning flow (Intake → BXT → Reuse Gate → Phase 2 → Phase 3 → Readiness Brief) against Azure Cosmos DB and Azure AI Search.

In M0 this is a typed, compilable scaffold — all framework and data methods are stubs that throw `NotImplementedError`. M1 will wire the Copilot SDK session and real Cosmos DB / Search calls.

## Structure

```
src/
  index.ts              Entry point — starts Express on PORT (default 8080)
  errors.ts             NotImplementedError
  adapter/
    responses.ts        Hosted Agent Responses protocol adapter (stub)
  framework/
    intake.ts           Intake field validation
    phase1-bxt.ts       BXT scoring stub
    step1b-reuse.ts     Reuse Gate search stub
    phase2-groupings.ts Technology Groupings stub (9 questions)
    phase3-selection.ts Scenario Selection + Readiness Brief stub
  data/
    models.ts           Canonical TypeScript interfaces (Session, Request, Project, OrgContext)
    cosmos-client.ts    CosmosClient factory (ManagedIdentityCredential)
    session-store.ts    Session CRUD interface + stub
    request-store.ts    Request CRUD interface + stub
    project-store.ts    Project read interface + stub
    org-context-store.ts OrgContext read/admin interface + stub
  search/
    project-index.ts    AI Search similarity stub
  auth/
    identity.ts         getModelCredential() + resolveCallerId()
  admin/
    admin-api.ts        Admin API sub-router (AdvisorAdmin role required)
```

## Quick start (local dev)

```bash
cd agent
npm install
ADVISOR_LOCAL_DEV=true ADVISOR_DEMO_MODE=true npm run build && node dist/index.js
```

## Further reading

- [Data model contract](../docs/data-model.md)
- [Architecture overview](../docs/architecture.md)
- [Deployment guide](../docs/deployment.md)
- [Product spec](../product-spec.md)
