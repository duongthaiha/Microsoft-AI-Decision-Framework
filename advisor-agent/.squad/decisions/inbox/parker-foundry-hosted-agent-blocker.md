# Blocker: Foundry Hosted Agent Registration — M2.1 Follow-up

**Author:** Parker (DevOps/SRE)  
**Date:** 2026-05-27T07:00:00Z  
**Severity:** Non-blocking (M2.1 deferred — not on M2 critical path)  
**Spec ref:** FR-003, product-spec.md §9

---

## What was requested

> "Register the ACA endpoint as a Microsoft Foundry Agent Service Hosted Agent."

---

## Research findings

### What "Foundry Hosted Agent" actually is

Foundry Hosted Agent is a **container hosting service** operated by the Foundry gateway — not an endpoint registry. You give it a container image; it runs that image in an isolated sandbox with a dedicated Entra agent identity. Our ACA endpoint and a Foundry Hosted Agent are two separate hosting environments that both run the same code.

### Docs consulted (2026-05-27)

| Document | URL | Key finding |
|---|---|---|
| Hosted agents concept | https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents | Preview; container must use protocol library |
| Deploy hosted agent (SDK + REST) | https://learn.microsoft.com/azure/foundry/agents/how-to/deploy-hosted-agent | Python SDK `azure-ai-projects>=2.1.0` only; no Bicep for agent version |
| Quickstart (azd) | https://learn.microsoft.com/azure/foundry/agents/quickstarts/quickstart-hosted-agent | azd/VS Code only; no IaC resource type |
| Bicep types reference | https://learn.microsoft.com/azure/templates/microsoft.cognitiveservices/accounts | CognitiveServices/accounts supports AIServices kind + projects child |

### Three concrete blockers

#### Blocker 1 — No Foundry project in our infra

Foundry Hosted Agent requires:
1. `Microsoft.CognitiveServices/accounts` with `kind=AIServices` + `allowProjectManagement: true`
2. A child `Microsoft.CognitiveServices/accounts/projects` resource

Our current `infra/modules/foundry.bicep` is a placeholder that acknowledges this gap. Neither resource is deployed to `rg-advisor-dev`.

**Cost impact:** AIServices S0 = ~$10/mo base + model token costs (separate from current AOAI account).

#### Blocker 2 — Container doesn't implement Foundry protocol library

The Foundry gateway requires the container to use:
- Python: `azure-ai-agentserver-responses`
- .NET: `Azure.AI.AgentServer.Responses`
- **Node.js: No official library as of 2026-05-27**

The library exposes a `/responses` endpoint (not our `/v1/responses`), `/readiness`, and handles SSE streaming with the Foundry lifecycle (created → in_progress → completed). Our Express container doesn't implement this contract.

**There is no Node.js Foundry protocol library currently published on npm.** Node.js is NOT listed in the [language support matrix](https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents#language-support) for Hosted Agents.

This is a fundamental gap: to deploy to Foundry Hosted Agent from Node.js, we would need to either manually implement the protocol contract or migrate the agent to Python/.NET.

#### Blocker 3 — No Bicep resource type for agent version registration

The Foundry data-plane agent version lifecycle (create/poll/activate) has **no ARM/Bicep resource type**. Registration is only possible via:
- Python SDK (`azure.ai.projects>=2.1.0`, `project.agents.create_version(...)`)
- azd + VS Code extension workflow
- Direct REST API calls

The `infra/modules/foundry.bicep` placeholder cannot be completed until Microsoft publishes a GA ARM resource type.

---

## What was delivered in M2

| Artefact | Purpose |
|---|---|
| `scripts/register-foundry-agent.sh` | Reference registration script using Python SDK; guards on missing env vars; exits cleanly if Foundry project is not configured |
| `docs/m2-foundry-hosted-agent.md` | Full M2.1 handoff doc: step-by-step unblocking plan, Bicep snippets, RBAC commands, JWT audience verification guidance |

---

## Recommended next steps (M2.1)

1. **Decide on language:** Evaluate whether to migrate the agent to Python (Azure AI Agent Framework) or wait for Microsoft to publish a Node.js Foundry protocol library.
2. **Provision Foundry project:** Update `infra/modules/foundry.bicep` with AIServices account + project (Bicep snippets in `docs/m2-foundry-hosted-agent.md`). Run `azd provision`.
3. **Implement `/responses` protocol endpoint** (alongside existing `/v1/responses`).
4. **Register agent version** via `scripts/register-foundry-agent.sh` or `azd` once above are done.
5. **Verify JWT audience:** Foundry tokens may carry a different `aud` — check against `api://4f4f4a4d-e60f-4b86-a681-86059aae4597`.

---

*Parker — 2026-05-27T07:00:00Z*
