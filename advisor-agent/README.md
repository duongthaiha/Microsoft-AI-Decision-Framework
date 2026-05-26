# AI Project Advisor Agent

> 📦 **M0 Scaffold** — Runnable skeleton, no feature logic yet.

## What is this?

The AI Project Advisor Agent is the **front desk for new AI project ideas**. A business user arrives with a problem statement—"Can AI help with customer support triage?"—and the advisor takes them through a structured intake conversation, applies the Microsoft AI Decision Framework, searches for similar existing projects to prevent duplication, and surfaces a plain-language readiness brief with a recommended Microsoft platform, rationale, and next steps. Think of it as the combination of an intake desk clerk (captures the business problem) and a librarian (finds relevant existing work).

## M0 Status

This is the scaffolding phase. The directory structure is in place, all TypeScript types are defined, linting and tests pass, and you can run the advisor locally. The Copilot SDK session wiring, the framework flow logic, and the Cosmos DB integration happen in M1.

## Prerequisites

- **Node.js** 20.x or later
- **Azure CLI** (for local Azure auth)
- **Azure Developer CLI** (`azd`, for deployment)
- **Docker** (optional, for building the agent container)
- **Bicep CLI** (included with `azd`, for IaC validation)

## Local Setup

### Install dependencies

```bash
npm install
npm run build
```

### Run in dev mode

**Agent server** (Hosted Agent adapter):
```bash
cd agent
npm run dev
```

**Web app** (Intake form + admin UI):
```bash
cd web
npm run dev
```

Both workspaces watch for changes and rebuild on save.

## Project Structure

```
advisor-agent/
├── agent/              # Backend: Copilot SDK advisor + Responses adapter (TypeScript)
├── web/                # Frontend: React + Vite intake form + admin UI
├── infra/              # Bicep IaC (Cosmos DB, Azure AI Search, ACR, Hosted Agent)
├── docs/               # Architecture, deployment, data model, runbook, admin guide
├── tests/              # Unit, integration, e2e test scaffolds
├── azure.yaml          # Azure Developer CLI config
└── package.json        # Monorepo root (npm workspaces)
```

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed workspace boundaries and M0/M1/M2 milestones.

## Key Links

- **[product-spec.md](./product-spec.md)** — Full PRD with all acceptance criteria and data models
- **[docs/architecture.md](./docs/architecture.md)** — Architecture overview and design decisions
- **[docs/deployment.md](./docs/deployment.md)** — Deployment commands and environment setup
- **[docs/data-model.md](./docs/data-model.md)** — Cosmos DB container schemas
- **[docs/runbook.md](./docs/runbook.md)** — Operational guide and troubleshooting
- **[docs/admin-guide.md](./docs/admin-guide.md)** — Admin backend user manual
- **[docs/change-feed-consumer.md](./docs/change-feed-consumer.md)** — Contract for downstream Request consumers

## Microsoft Learn References

- [GitHub Copilot Extensions](https://learn.microsoft.com/en-us/github/copilot/copilot-extensions/about-copilot-extensions)
- [Microsoft Foundry (Private preview)](https://learn.microsoft.com/en-us/azure/foundry/)
- [Azure Cosmos DB for NoSQL](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/)
- [Azure AI Search](https://learn.microsoft.com/en-us/azure/search/)
- [Azure Entra ID](https://learn.microsoft.com/en-us/entra/identity/)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/)
- [Bicep language](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview)

---

**Built with the Microsoft AI Decision Framework.**  
Read the Constitution in the parent repository for our storytelling voice and philosophy.
