# Foundry Code-First Agent Deployment

This directory contains the infrastructure and deployment guide for hosting the **Microsoft AI Decision Framework Advisor** as a code-first agent in Azure AI Foundry.

## Overview

The advisor is a **Python console agent** built on the GitHub Copilot SDK that provides structured guidance for AI technology selection. When deployed to Foundry, it runs as a managed code-first agent with:

- **Copilot SDK** for model orchestration and skill loading
- **Skills** bundled: Microsoft AI Decision Framework + optional org-context
- **Authentication**: Entra ID (managed identity) or API key
- **Model**: GPT-4o or configurable
- **Runtime**: Python 3.10+ with Node.js 24 (for Copilot CLI)

## Prerequisites

1. **Azure subscription** with Foundry enabled
2. **Foundry project** and **hub** (create via Portal or use existing)
3. **Foundry compute** (agent runtime environment)
4. **Azure CLI** and **Bicep CLI** installed locally
5. For **key-auth**: Foundry API key with access to your model deployment
6. For **entra-auth**: Azure role assignment (see "Entra ID Setup" below)

## Deployment Steps

### 1. Configure Parameters

Edit `main.parameters.json`:

```json
{
  "projectName": "project-advisor",
  "projectResourceGroup": "rg-advisor-foundry",
  "projectLocation": "swedencentral",  // or your preferred region
  "foundryEndpoint": "https://foundry-swedencentral.services.ai.azure.com",
  "foundryAuthMode": "entra",  // or "key"
  "foundryApiKey": "",  // only if authMode="key"
  "advisorModel": "gpt-4o"
}
```

**For Entra ID auth** (recommended):
- Set `foundryAuthMode: "entra"`
- Leave `foundryApiKey` empty
- The agent runs with managed identity; grant the identity `Cognitive Services OpenAI User` role on Foundry

**For API key auth**:
- Set `foundryAuthMode: "key"`
- Set `foundryApiKey` to your key (or use Azure Key Vault secret reference)

### 2. Validate Bicep

```bash
az bicep build --file main.bicep
```

### 3. Preview Deployment

```bash
az deployment sub create \
  --name advisor-agent-deploy \
  --location swedencentral \
  --template-file main.bicep \
  --parameters @main.parameters.json \
  --what-if
```

### 4. Deploy

```bash
az deployment sub create \
  --name advisor-agent-deploy \
  --location swedencentral \
  --template-file main.bicep \
  --parameters @main.parameters.json
```

The deployment outputs:
- `agentId`: Foundry agent resource ID
- `identityClientId`: Managed identity client ID (for RBAC assignment)
- `projectId`: Foundry project ID

### 5. Entra ID Setup (if using entra-auth)

Retrieve the agent's managed identity principal ID from deployment output, then grant it the `Cognitive Services OpenAI User` role on your Foundry endpoint:

```bash
# Get the principal ID from deployment output
PRINCIPAL_ID=$(az deployment sub show \
  --name advisor-agent-deploy \
  --query properties.outputs.identityPrincipalId.value -o tsv)

# Get your Foundry resource ID
FOUNDRY_RESOURCE_ID=$(az cognitiveservices account list \
  --query "[0].id" -o tsv)

# Assign the role
az role assignment create \
  --assignee-object-id "$PRINCIPAL_ID" \
  --role "Cognitive Services OpenAI User" \
  --scope "$FOUNDRY_RESOURCE_ID"
```

### 6. Deploy Agent Runtime to Foundry

The Bicep template registers the agent resource, but you must package and deploy the runtime code to Foundry:

#### Option A: Foundry Portal

1. Navigate to your Foundry project → **Agents** → **Create Agent**
2. Select **Code-first** deployment
3. Upload the advisor package:
   - Include: `src/foundry_agent.py`, `src/requirements.txt`, `src/auth.py`, `src/validate_token.py`
   - Include: `skills/` directory (bundled)
4. Set environment variables from parameters
5. Deploy

#### Option B: Azure CLI (airunway or Foundry SDK)

```bash
# Package the advisor
zip -r advisor-agent.zip \
  src/foundry_agent.py \
  src/requirements.txt \
  src/auth.py \
  src/validate_token.py \
  skills/

# Deploy via Foundry SDK (pseudo-code; use your Foundry SDK)
foundry agents deploy \
  --project-id <projectId> \
  --name advisor-agent \
  --runtime python \
  --package advisor-agent.zip \
  --entry-point src/foundry_agent.py \
  --env-file main.parameters.json
```

## Testing the Deployed Agent

### Option 1: Foundry Portal Chat

In Foundry Portal, navigate to your agent and test via the chat interface.

### Option 2: Foundry SDK

```python
from azure.ai.foundry import FoundryClient

client = FoundryClient.from_connection_string("<foundry-connection-string>")
response = client.agents.invoke(
    project_id="<projectId>",
    agent_id="<agentId>",
    user_message="What's the best AI technology for a chatbot?"
)
print(response.content)
```

### Option 3: Local Test (Development)

Before deploying to Foundry, test `foundry_agent.py` locally:

```bash
cd agent/advisor

# Install dependencies
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r src/requirements.txt

# Set environment variables
export FOUNDRY_ENDPOINT="https://foundry-swedencentral.services.ai.azure.com"
export FOUNDRY_AUTH_MODE="entra"  # or "key"
export FOUNDRY_PROVIDER_TYPE="azure"
export ADVISOR_MODEL="gpt-4o"
export AZURE_CLIENT_ID="<managed-identity-client-id>"  # if using entra

# Test with a sample question
python src/foundry_agent.py "What's the right architecture for my AI initiative?"
```

## Environment Variables

The agent accepts these configuration variables (set in Foundry deployment config):

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `FOUNDRY_ENDPOINT` | — | Yes | Foundry base URL (e.g., `https://foundry-swedencentral.services.ai.azure.com`) |
| `FOUNDRY_AUTH_MODE` | `entra` | No | `entra` or `key` |
| `FOUNDRY_PROVIDER_TYPE` | `azure` | No | `azure` or `openai` |
| `FOUNDRY_API_KEY` | — | If authMode=key | API key for Foundry endpoint |
| `ADVISOR_MODEL` | `gpt-4o` | No | Model name (e.g., `gpt-4`, `gpt-4o`, `gpt-35-turbo`) |
| `AZURE_CLIENT_ID` | — | If authMode=entra | Managed identity client ID (Foundry sets automatically) |
| `ADVISOR_ORGANIZATION_CONTEXT` | — | No | Path to additional org-context skill (relative to deployment root) |

## Troubleshooting

### Agent fails to start: `No module named copilot`

Ensure `requirements.txt` dependencies are installed in the Foundry runtime. Check that `github-copilot-sdk` version is compatible with Python 3.10+.

### Authentication error: 401 Unauthorized

- **If using Entra**: Verify the managed identity has the `Cognitive Services OpenAI User` role on Foundry
- **If using key auth**: Verify `FOUNDRY_API_KEY` is set and valid

### Agent cannot find skills

Verify the `skills/` directory is included in the deployment package and at the correct relative path (`../skills/` from `src/`).

### "Connection is closed" error

The Copilot CLI may be initializing. Retry with increased timeout (Foundry should retry automatically).

## Architecture Notes

- **Code-first**: Agent logic lives in `src/foundry_agent.py`, not Foundry's visual builder
- **Copilot SDK**: Handles model access, skill orchestration, and BYOK token management
- **Skills**: Loaded from `skills/` directory; `microsoft-ai-decision-framework` is bundled; additional org-context skill is optional
- **Auth**: Supports both Entra ID (recommended for managed identity) and API key (lift-and-shift scenarios)
- **Isolation**: Each agent instance has its own Python runtime and Copilot client session

## Post-Deployment

1. **Monitor logs**: Check Foundry diagnostics/logs for runtime issues
2. **Scale**: Adjust Foundry compute to handle traffic (autoscaling available)
3. **Update skills**: To add org-context, update `ADVISOR_ORGANIZATION_CONTEXT` environment variable and redeploy
4. **Model updates**: Change `ADVISOR_MODEL` in deployment config and redeploy

## Cleanup

To remove the deployed resources:

```bash
az deployment sub delete \
  --name advisor-agent-deploy
```

Or delete the resource group:

```bash
az group delete \
  --name rg-advisor-foundry \
  --yes
```

## Related Files

- **`src/foundry_agent.py`** - Agent entry point (code-first runtime)
- **`src/advisor_console.py`** - Original console REPL (local dev/testing)
- **`src/auth.py`** - Entra ID token acquisition
- **`skills/microsoft-ai-decision-framework/`** - Bundled skill with framework
- **`skills/org-context/`** - Optional org-context skill (loaded if `ADVISOR_ORGANIZATION_CONTEXT` is set)
