# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-05-26 — M0 Framework Spine & Architectural Call-outs

**Framework spine locked:**  
`Intake → Phase 1 BXT → Step 1b Reuse Gate → Phase 2 Technology Groupings → Phase 3 Scenario Selection → Brief → Confirm → status: New`

Each step maps to a file in `agent/src/framework/` with typed input/output interfaces. The Reuse Gate (Step 1b) is the advisor's only addition to the public Microsoft AI Decision Framework — it sits between BXT and Phase 2, not at the end.

**Architectural call-outs for the team:**

1. **Identity model — no secrets in the container.** The Hosted Agent identity model means the agent container itself never holds secrets. Dallas must build the Cosmos client around `ManagedIdentityCredential` from day 1. `DefaultAzureCredential` is the local-dev fallback only. If a GitHub token is needed for the Copilot SDK model path, it goes to Key Vault — never env vars or config files.

2. **TypeScript, not Python.** The spec (§3 line 111) says TypeScript/Node.js with `@github/copilot-sdk`. The history.md project context mentions Python — that's outdated. The spec wins.

3. **Partition keys are structural isolation.** Sessions and Requests partition on `/ownerId`. Projects on `/projectId`. OrgContext on `/orgId`. Every query against `sessions` and `requests` MUST include the caller's `ownerId` as the partition key — this is not optional app-level filtering, it's the architectural isolation boundary.

4. **Types flow one way.** `agent/src/data/models.ts` is the single source of truth for document shapes. Frontend and tests import from there. Never duplicate types.

5. **Responses protocol first.** We start with the Responses protocol for the Hosted Agent adapter. If M1 discovery shows the Copilot SDK needs an Invocations bridge, that's a decision-inbox item, not a silent switch.

6. **OrgContext is read-only to the agent.** The agent identity has Cosmos Data Reader on `org-context`. Only the admin backend identity has Data Contributor on `org-context`. This is enforced at the RBAC layer, not just application code.

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.
