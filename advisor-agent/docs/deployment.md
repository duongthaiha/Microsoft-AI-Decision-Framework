# Deployment

## Prerequisites

- **Azure subscription** with sufficient quota for Cosmos DB, Azure AI Search, and Container Registry
- **Azure CLI** installed and authenticated (`az login`)
- **Azure Developer CLI** installed (`azd` — installs with Azure CLI or separately)
- **Docker** (if building the agent container locally)

## Environment Variables

Each environment uses these configuration variables (set via `.env` files or AZD secrets):

| Variable | Example | Purpose |
|----------|---------|---------|
| `AZURE_ENV_NAME` | `dev`, `test`, `prod` | Environment name (used in resource naming) |
| `AZURE_LOCATION` | `eastus`, `westus2` | Azure region for resource deployment |
| `ENVIRONMENT_NAME` | `development`, `staging`, `production` | App-level environment designation |
| `DEMO_FLAG` | `true` (dev/test only) | Disable Entra sign-in for demo mode (cannot be `true` in prod) |
| `AUTH_MODE` | `entra`, `demo` | Authentication method |

## Deployment Environments

### Dev Environment

**Purpose:** Active development and demo mode validation.

**Command:**
```bash
cd advisor-agent
azd up
```

This command:
1. Initializes/refreshes the dev environment (`AZURE_ENV_NAME=dev`)
2. Deploys all infrastructure using Bicep
3. Builds and pushes the agent container to ACR
4. Deploys the Hosted Agent runtime

**Configuration:**
- `DEMO_FLAG=true` (Entra sign-in disabled; useful for local testing)
- `AUTH_MODE=demo`

**Approval gate:** Dev team review (no formal approval required)

### Test Environment

**Purpose:** Authenticated integration testing with representative project data.

**Commands:**

Provision resources (first time):
```bash
cd advisor-agent
azd provision
```

Deploy code (after changes):
```bash
azd deploy
```

Or combine both:
```bash
azd provision && azd deploy
```

**Configuration:**
- `DEMO_FLAG=false` (Entra sign-in enabled; represents production auth)
- `AUTH_MODE=entra`
- Real Cosmos DB and Azure AI Search instances

**Approval gate:** Tech lead approval before promotion to prod

### Production Environment

**Purpose:** Production advisor for business idea intake.

**Command (via approved pipeline):**
```bash
cd advisor-agent
azd up
```

This should run through an approved CI/CD pipeline, not manual `azd up`. The pipeline enforces:
- Code review and merge to main branch
- Automated tests pass
- Security scan passes
- Architecture/security team approval

**Configuration:**
- `DEMO_FLAG=false` (Entra sign-in mandatory; demo mode blocked)
- `AUTH_MODE=entra`
- Managed identity for all Azure service access
- No service keys or connection strings in environment

**Approval gate:** Architecture review + security review + deployment approval

---

## Local Development (Without Deployment)

To run the advisor locally without deploying to Azure:

### Prerequisites

- Node.js 20+
- Optional: Azure CLI and `azd` for Cosmos DB emulator (if testing persistence)

### Start the dev servers

**Terminal 1 — Agent (Responses protocol server):**
```bash
cd advisor-agent/agent
npm install
npm run dev
```

This starts the Hosted Agent adapter on `http://localhost:3000` (port configurable).

**Terminal 2 — Web app (React dev server):**
```bash
cd advisor-agent/web
npm install
npm run dev
```

This starts the React dev server on `http://localhost:5173`.

### Connect to the web app

Open `http://localhost:5173` in your browser. The web app will connect to the agent at `http://localhost:3000`.

---

## Bicep Infrastructure

The infrastructure is defined in `infra/main.bicep` with modular templates:

| Module | Resources | Notes |
|--------|-----------|-------|
| `cosmos.bicep` | Cosmos DB account, four containers, indexes | Partitioned by `/ownerId` and `/projectId` |
| `search.bicep` | Azure AI Search service, project index | Embeddings via `text-embedding-3-small` |
| `container-registry.bicep` | Azure Container Registry | Stores agent container image |
| `monitoring.bicep` | App Insights, Log Analytics workspace | Telemetry and debugging |
| `identity.bicep` | Managed identities, RBAC role assignments | Hosted Agent identity + role bindings |
| `foundry.bicep` | Foundry project / Hosted Agent (stub) | Placeholder; Foundry support in M1 |

See `infra/main.parameters.json` for default parameter values.

---

## Troubleshooting Deployment

### `azd up` fails with "Resource group not found"

Ensure you are logged in and the correct subscription is selected:

```bash
az account show
az account set --subscription <subscription-id>
```

### `azd deploy` fails with "Container image push failed"

Ensure Docker is running and you have push rights to the ACR:

```bash
az acr login --name <registry-name>
docker ps  # Verify Docker daemon is running
```

### Cosmos DB connection fails

Check that the Hosted Agent identity has the correct RBAC role assignment:

```bash
az cosmosdb sql role assignment list --account-name <cosmos-account> --resource-group <resource-group>
```

See [docs/runbook.md](./runbook.md) for more operational guidance.

---

## Cost Considerations

Typical monthly costs (rough estimates for MVP):

| Service | Usage | Estimated Cost |
|---------|-------|-----------------|
| Cosmos DB | ~1000 RU/h, 1 GB storage | $30–50 |
| Azure AI Search | 1 index, ~100 MB | $50–75 |
| Container Registry | 1 image, ~500 MB | $10 |
| Application Insights | Advisor telemetry | $5–10 |
| Foundry Hosted Agent | Runtime (pricing TBD) | TBD |

These are **not** hard numbers — actual costs depend on usage patterns, region, and Foundry pricing once available. Monitor the Azure cost analysis dashboard during pilot.

---

## Next Steps

- **M1:** Test E2E deployment; integrate Copilot SDK and framework logic.
- **M2:** Migrate to production Azure subscription; enable Entra sign-in; validate Cosmos DB change feed.
- **M3:** Implement cost alerts; automate scaling; runbook hardening.
