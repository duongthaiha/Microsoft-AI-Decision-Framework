# Foundry Hosted Agent Deployment

This directory deploys the **Microsoft AI Decision Framework Advisor** as a
**Foundry hosted agent** — a container that Azure AI Foundry Agent Service pulls
and runs behind a managed agent endpoint. The container runs the *same* GitHub
Copilot SDK advisor as the local console (`../src/advisor_console.py`); the
Copilot logic is preserved, not replaced by a prompt.

## How it works

```
client -> Foundry gateway -> hosted container (port 8088, /responses)
                                   |
                                   |- azure-ai-agentserver-responses (protocol)
                                   |- GitHub Copilot SDK + Copilot CLI
                                   |- bundled skills (decision-framework + org-context)
                                   `- BYOK -> Foundry project model (gpt-5.4)
```

- **Protocol:** Foundry **Responses** protocol via `azure-ai-agentserver-responses`
  (`../src/foundry_hosted_agent.py`). Each request runs one advisor turn.
- **Model auth:** the platform provisions a dedicated Entra **agent identity** with
  the `Foundry User` role on the project. The container uses `DefaultAzureCredential`
  to get a token (audience `https://ai.azure.com/.default`) and calls the model
  through the **project** endpoint `.../api/projects/<project>/openai/v1/`.
- **Skills:** bundled into the image under `/app/skills` (same layout as the console).

## Files

| File | Purpose |
|---|---|
| `../Dockerfile` | linux/amd64 image: Node 24 (Copilot CLI needs `node:sqlite`) + Python + venv |
| `../src/foundry_hosted_agent.py` | Container entrypoint - Responses handler wrapping the Copilot SDK advisor |
| `requirements-hosted.txt` | Pinned runtime deps (`azure-ai-agentserver-responses`, `github-copilot-sdk==0.2.3`, ...) |
| `deploy_hosted_agent.py` | Creates the hosted agent version (`HostedAgentDefinition`) and polls until `active` |
| `invoke_hosted_agent.py` | Invokes the live agent through `get_openai_client().responses.create(...)` |

## Live deployment (this repo's environment)

Already deployed and validated end-to-end:

| Item | Value |
|---|---|
| Foundry project endpoint | `https://foundry-project-hd-sc-resource.services.ai.azure.com/api/projects/project-hd-sc` |
| Agent | `advisor-agent` (hosted), active version **5** |
| Image | `acradvvvsqmavln47g4.azurecr.io/advisor-hosted:v4` |
| Model | `gpt-5.4` |
| ACR | `acradvvvsqmavln47g4` (rg-advisor-v2, swedencentral) |

## Prerequisites

- A Microsoft Foundry project, and **Foundry Project Manager** at project scope
  (to create hosted agents and let the platform assign `Foundry User` to the agent
  identity). Owner / User Access Administrator also works.
- Docker Desktop and Azure CLI >= 2.80.
- An Azure Container Registry reachable over its **public** endpoint (private-only
  ACR is not supported for hosted agents).
- `pip install "azure-ai-projects>=2.1.0" azure-identity openai`.

## Deploy from scratch

### 1. Build and push a single-arch image

Hosted agents require a `linux/amd64` **single image manifest** - not a multi-arch
OCI index. Disable provenance/SBOM attestations so buildx produces a plain manifest:

```powershell
$acr = "acradvvvsqmavln47g4"
az acr login --name $acr
docker buildx build --platform linux/amd64 --provenance=false --sbom=false `
  -t "$acr.azurecr.io/advisor-hosted:v4" -f ../Dockerfile --push ..
```

Verify it is a single manifest (mediaType `...manifest.v2+json`, not `...image.index...`):

```powershell
az acr manifest list-metadata --registry $acr --name advisor-hosted `
  --query "[?tags[0]=='v4'].{tag:tags[0],arch:architecture,mediaType:mediaType}" -o table
```

### 2. Grant the project identity pull access on the ACR

The image is pulled by the **project's** managed identity (distinct from the
account identity). Grant it `AcrPull` (this ACR uses `LegacyRegistryPermissions`,
so `AcrPull` is the effective role; on ABAC registries use *Container Registry
Repository Reader*):

```powershell
$projMi = az rest --method get --url "https://management.azure.com/subscriptions/<sub>/resourceGroups/rg-foundry-sc/providers/Microsoft.CognitiveServices/accounts/foundry-project-hd-sc-resource/projects/project-hd-sc?api-version=2025-04-01-preview" --query identity.principalId -o tsv
$acrId = az acr show --name acradvvvsqmavln47g4 --query id -o tsv
az role assignment create --assignee-object-id $projMi --assignee-principal-type ServicePrincipal --role AcrPull --scope $acrId
```

### 3. Create the hosted agent version

```powershell
python deploy_hosted_agent.py
```

This calls `project.agents.create_version(... HostedAgentDefinition(container_configuration=ContainerConfiguration(image=...), protocol_versions=[RESPONSES], cpu, memory, environment_variables))` and polls until `active`.

> **Reserved env names:** the platform rejects any `FOUNDRY_*` / `AGENT_*` agent
> environment variables. The advisor config is therefore passed under `ADVISOR_*`
> names and remapped to `FOUNDRY_*` inside the container entrypoint.

### 4. Invoke

```powershell
python invoke_hosted_agent.py "Which Microsoft AI technology fits a governed claims assistant?"
```

## Configuration (agent `environment_variables`)

All passed under `ADVISOR_*` (remapped to `FOUNDRY_*` in the container):

| Variable | Value here | Notes |
|---|---|---|
| `ADVISOR_FOUNDRY_ENDPOINT` | project services.ai host | Fallback only; the entrypoint prefers the platform-injected `FOUNDRY_PROJECT_ENDPOINT` |
| `ADVISOR_AUTH_MODE` | `entra` | Uses the platform agent identity via `DefaultAzureCredential` |
| `ADVISOR_PROVIDER_TYPE` | `openai` | OpenAI-compatible `/openai/v1/` API |
| `ADVISOR_WIRE_API` | `responses` | gpt-5.4 uses the Responses API |
| `ADVISOR_TOKEN_SCOPE` | `https://ai.azure.com/.default` | Data-plane audience for the project endpoint |
| `ADVISOR_MODEL` | `gpt-5.4` | Deployment name on the Foundry project |

The platform injects `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_AGENT_NAME`, etc. The
entrypoint uses `FOUNDRY_PROJECT_ENDPOINT` to build the model base URL
`<project_endpoint>/openai/v1/`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Version status `failed`, `ImageError` | Project identity lacks ACR pull, or image is a multi-arch/attestation index | Grant `AcrPull` to the **project** identity; rebuild with `--provenance=false --sbom=false` |
| `Invalid payload ... reserved for platform use` | Used `FOUNDRY_*`/`AGENT_*` env names | Pass config under `ADVISOR_*`; the entrypoint remaps them |
| `Authentication failed ... HTTP 401` | Wrong token audience or calling the bare account endpoint | Use scope `https://ai.azure.com/.default` and the **project** path `/api/projects/<project>/openai/v1/` |
| Container won't start (`node:sqlite`) | Node < 22.5 | Base image is `node:24` (required by the Copilot CLI) |

## Update the agent

Build a new image tag, push it, and run `deploy_hosted_agent.py` again (set
`ADVISOR_IMAGE` to the new tag). Each call creates a new immutable version; the
agent serves the latest active version.
