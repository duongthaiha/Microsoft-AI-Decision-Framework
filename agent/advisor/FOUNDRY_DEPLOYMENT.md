# Azure AI Foundry Hosted Agent Deployment — Complete Setup

## Summary

The **Microsoft AI Decision Framework Advisor** is now deployable as a **code-first agent** in Azure AI Foundry. This document summarizes the complete implementation.

## What Was Built

### 1. Code-First Agent Runtime (`src/foundry_agent.py`)
- **Framework**: GitHub Copilot SDK (Python)
- **Execution Model**: Async/await (FastAPI compatible for future REST wrapping)
- **Configuration**: Environment variables (FOUNDRY_ENDPOINT, FOUNDRY_AUTH_MODE, etc.)
- **Skills**: Bundled (microsoft-ai-decision-framework + optional org-context)
- **Auth**: Supports both Entra ID (managed identity) and API key modes

**Key Features**:
- Reuses the same core advisor logic as the console (`advisor_console.py`)
- Integrates Copilot SDK session management for model orchestration
- Loads skills from `../skills/` directory
- Async message processing with configurable timeout
- Logging for Foundry observability

### 2. Infrastructure (`foundry/main.bicep` + `foundry/main.parameters.json`)
- **Scope**: Resource group deployment
- **Resources Provisioned**:
  - User-assigned managed identity (for Entra-based auth)
  - Outputs agent identity details for post-deployment RBAC setup
- **Parameters**: Foundry endpoint, auth mode, model, optional org-context path

**Bicep is lightweight** because:
- Foundry projects are typically managed via Portal or SDK
- Agent registration happens after identity provisioning
- RBAC assignment is done post-deployment (one-time setup)

### 3. Deployment Guide (`foundry/README.md`)
- Step-by-step deployment instructions
- Environment variable reference table
- Testing procedures (Portal, SDK, local dev)
- Troubleshooting section
- Pre-flight checklist and prerequisites

## File Structure

```
agent/advisor/
├── src/
│   ├── foundry_agent.py          # Code-first agent entry point
│   ├── advisor_console.py         # Console REPL (unchanged)
│   ├── auth.py                    # Entra token acquisition
│   ├── validate_token.py          # Token validation utility
│   ├── requirements.txt           # Dependencies (Copilot SDK, azure-identity, python-dotenv)
│   ├── .env.example               # Configuration template
│   └── README.md                  # Updated (points to foundry/README.md)
├── foundry/
│   ├── main.bicep                 # Infrastructure provisioning
│   ├── main.parameters.json       # Parameter bindings
│   └── README.md                  # Complete deployment guide
├── skills/
│   ├── microsoft-ai-decision-framework/  # Bundled skill
│   └── org-context/               # Optional org-context skill
```

## What Was Removed

- **Azure Container Apps deployment** (Dockerfile, azure.yaml, infra/, hosted_api.py)
  - Reason: User chose code-first Foundry agent over container hosting
  - Benefits: Simpler, native Foundry integration, no container orchestration overhead

## Quick Start

### Local Development (Console)
```bash
cd agent/advisor
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate
pip install -r src/requirements.txt
export FOUNDRY_ENDPOINT=https://your-foundry.services.ai.azure.com
export FOUNDRY_AUTH_MODE=entra
python src/advisor_console.py
```

### Deploy to Foundry

1. **Provision managed identity**:
   ```bash
   cd foundry
   az group create -n rg-advisor-foundry -l swedencentral
   az deployment group create \
     --resource-group rg-advisor-foundry \
     --template-file main.bicep \
     --parameters @main.parameters.json
   ```

2. **Grant Entra permissions** (if using Entra auth):
   ```bash
   PRINCIPAL_ID=$(az deployment group show \
     -g rg-advisor-foundry -n main \
     --query properties.outputs.agentIdentityPrincipalId.value -o tsv)
   
   az role assignment create \
     --assignee-object-id $PRINCIPAL_ID \
     --role "Cognitive Services OpenAI User" \
     --scope /subscriptions/{subId}/resourceGroups/{rgName}/providers/Microsoft.CognitiveServices/accounts/{foundryName}
   ```

3. **Create agent in Foundry** (via Portal or SDK):
   - Package: src/foundry_agent.py + src/auth.py + src/requirements.txt + skills/
   - Entry point: src/foundry_agent.py
   - Runtime: Python 3.10+
   - Environment variables: (from main.parameters.json)

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Code-first over visual builder** | Preserves existing Copilot SDK logic; avoids re-platforming |
| **Async/await pattern** | Matches Copilot SDK async API; compatible with async Python frameworks |
| **Lightweight Bicep** | Foundry projects are managed differently; identity is the only portable artifact |
| **Bundled skills** | Skills travel with the agent; no separate skill registry needed |
| **Entra + key auth** | Entra preferred (managed identity); key auth for lift-and-shift scenarios |

## Testing Checklist

- [x] foundry_agent.py compiles (Python syntax + imports validated)
- [x] AdvisorConfig.from_env() loads environment successfully
- [x] Bicep validates (resource group scope, no syntax errors)
- [x] Skills discovery works (bundled framework skill found)
- [x] Local test mode confirmed (config loads, no runtime errors)

## Deployment Validation (Post-Deployment)

Once deployed to Foundry:

1. **Check logs** in Foundry diagnostics for startup messages
2. **Send test message** via Foundry Portal chat
3. **Verify model access** (check for 401/403 auth errors)
4. **Monitor trace** (OpenTelemetry exports if enabled via Langfuse env vars)

## Configuration Reference

| Env Var | Default | Required | Notes |
|---------|---------|----------|-------|
| `FOUNDRY_ENDPOINT` | — | Yes | Base URL (e.g., https://foundry-region.services.ai.azure.com) |
| `FOUNDRY_AUTH_MODE` | `entra` | No | `entra` or `key` |
| `FOUNDRY_PROVIDER_TYPE` | `azure` | No | `azure` or `openai` |
| `FOUNDRY_API_KEY` | — | If authMode=key | API key (omit if Entra) |
| `ADVISOR_MODEL` | `gpt-4o` | No | Model deployment name |
| `AZURE_CLIENT_ID` | — | If authMode=entra | Managed identity client ID (Foundry auto-sets) |
| `ADVISOR_ORGANIZATION_CONTEXT` | — | No | Optional org-context skill path |

## Future Enhancements

- **REST wrapper**: Wrap foundry_agent.py in FastAPI for webhook-style invocation
- **Custom tools**: Add Foundry tool definitions (OpenAPI) for structured actions
- **Multi-turn state**: Implement session persistence for multi-turn conversations
- **Scaling**: Configure Foundry compute for load balancing and auto-scaling
- **Observability**: Integrate with Foundry diagnostics and Application Insights

## Support & Troubleshooting

See **`foundry/README.md`** for:
- Complete step-by-step deployment
- Environment variable configuration
- Testing procedures (Portal, SDK, local)
- Common error solutions
- Pre-deployment checklist

## Key Files Modified

| File | Change | Reason |
|------|--------|--------|
| `src/requirements.txt` | Removed fastapi, uvicorn | No longer needed for Foundry (not REST-based) |
| `src/README.md` | Replaced ACA section with Foundry | Deployment model changed |
| `foundry/` (new) | Added main.bicep, params, README | Foundry infrastructure & guide |
| `src/foundry_agent.py` (new) | Code-first agent runtime | Foundry deployment target |

## Deployment Diagram

```
┌─────────────────────────────────────────────────────┐
│         Azure AI Foundry (Portal or SDK)            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │   Advisor Agent (Code-First)                  │  │
│  ├───────────────────────────────────────────────┤  │
│  │  Runtime: src/foundry_agent.py                │  │
│  │  Skills: microsoft-ai-decision-framework      │  │
│  │  Auth: Managed Identity (Entra) + Key        │  │
│  │  Model: GPT-4o (configurable)                 │  │
│  └───────────────────────────────────────────────┘  │
│          ↓                                           │
│  ┌───────────────────────────────────────────────┐  │
│  │   Copilot SDK                                 │  │
│  │   (session management, skill orchestration)   │  │
│  └───────────────────────────────────────────────┘  │
│          ↓                                           │
│  ┌───────────────────────────────────────────────┐  │
│  │   Azure Foundry Model Deployment              │  │
│  │   (gpt-4o via OpenAI API)                     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
        ↑                               ↓
  User / API              Azure OpenAI Backend
```

---

**Status**: ✅ Ready for Foundry Deployment
**Last Updated**: 2026-06-11
**Next Step**: Run `foundry/README.md` deployment steps
