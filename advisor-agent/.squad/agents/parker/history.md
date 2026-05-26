# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

---

## M0 Infra Scaffold — 2026-05-26

### Bicep module structure

Six modules under `infra/modules/`:

| Module | Resources | Key decisions |
|---|---|---|
| `cosmos.bicep` | `Microsoft.DocumentDB/databaseAccounts`, `sqlDatabases/advisor`, 4× `sqlDatabases/containers` | `disableLocalAuth: true` — all access via managed identity + data-plane RBAC |
| `search.bicep` | `Microsoft.Search/searchServices` (Basic SKU) | System-assigned identity; no index in M0 — Dallas adds in M1; `authOptions.aadOrApiKey` keeps RBAC strict |
| `container-registry.bicep` | `Microsoft.ContainerRegistry/registries` (Basic SKU) | `adminUserEnabled: false`; agent identity gets AcrPull via ARM RBAC in identity.bicep |
| `monitoring.bicep` | `Microsoft.OperationalInsights/workspaces` + `Microsoft.Insights/components` (workspace-based) | Workspace-based App Insights so all telemetry lands in one queryable LA store |
| `identity.bicep` | 2× `Microsoft.ManagedIdentity/userAssignedIdentities`, 2× ARM role assignments, 8× `Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments` | See identity model below |
| `foundry.bicep` | Placeholder only — no deployable resource yet (see Foundry gap below) | Output `agentPlaceholder` lets downstream modules reference the agent name |

### Identity model

Two user-assigned managed identities:

**agentIdentity** (advisor Hosted Agent / Container App runtime)
- `Cosmos DB Built-in Data Contributor` → sessions, requests, projects containers
- `Cosmos DB Built-in Data Reader` → org-context container
- `Search Index Data Reader` → Search service (ARM RBAC)
- `AcrPull` → Container Registry (ARM RBAC)

**adminIdentity** (admin backend service)
- `Cosmos DB Built-in Data Contributor` → org-context
- `Cosmos DB Built-in Data Reader` → sessions, requests, projects (admin browse screens — elevated privilege, must be audit-logged)

Cosmos DB data-plane role assignments use `Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments`. The well-known built-in role definition IDs are:
- `00000000-0000-0000-0000-000000000001` — Built-in Data Reader
- `00000000-0000-0000-0000-000000000002` — Built-in Data Contributor

⚠️ **TODO (M1):** Narrow `scope` on each `sqlRoleAssignment` from account scope to container scope once containers stabilise.

### Foundry Hosted Agent preview gap

**Problem:** `Microsoft.FoundryService/agents` (or the confirmed ARM resource type) is not GA in the Bicep/ARM provider as of M0. There is no stable Bicep resource declaration to deploy or version a Hosted Agent.

**Bridge:** AZD `predeploy` hook in `azure.yaml` will call `scripts/deploy-hosted-agent.sh` (to be created in M1 by Parker or Ripley). The script wraps `az rest` / Foundry CLI to PUT the agent definition. This is explicitly called out in `infra/modules/foundry.bicep` with a TODO comment.

**When to revisit:** Monitor https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents and the ARM provider changelog. Replace the placeholder block in `foundry.bicep` with the real resource declaration once GA is confirmed.

### Networking posture

Public networking selected per product-spec §10. `publicNetworking` parameter defaults to `true` in `main.parameters.json` for dev. Cosmos DB `disableLocalAuth: true` enforces managed identity regardless of network posture. Private endpoint hardening is a prod path — leave Bicep structure extensible (no VNet resources in M0).

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.
