#!/usr/bin/env bash
# register-foundry-agent.sh — M2.1 post-deploy hook for Foundry Hosted Agent registration.
#
# STATUS: PREVIEW / BLOCKED — Foundry Hosted Agent registration has NO Bicep/ARM GA support
# as of 2026-05-27. Registration is only possible via the Python SDK (azure-ai-projects>=2.1.0)
# or the azd + VS Code extension workflow.  This script is a REFERENCE IMPLEMENTATION
# that documents what would be needed when the project has a Foundry AI Services account
# provisioned with project management enabled.
#
# CURRENT STATE:
#   - This repo does NOT yet have a Foundry project (Microsoft.CognitiveServices/accounts
#     with kind=AIServices + --allow-project-management true).
#   - The advisor container exposes /v1/responses (custom Express route), NOT the
#     azure-ai-agentserver-responses protocol library endpoint (/responses).
#   - The container serves on port 8080; Foundry Hosted Agent expects port 8088 locally,
#     though the platform gateway handles production routing.
#
# BLOCKERS (see docs/m2-foundry-hosted-agent.md for full detail):
#   1. No Foundry project provisioned — needs infra/modules/foundry.bicep update
#      with Microsoft.CognitiveServices/accounts + project resource.
#   2. Container does not implement azure-ai-agentserver-responses protocol library.
#   3. No Bicep resource type for agent version registration (Preview gap).
#
# When the blockers are resolved, run:
#   FOUNDRY_PROJECT_ENDPOINT=<endpoint> CONTAINER_IMAGE=<acr/image:tag> bash scripts/register-foundry-agent.sh
#
# Docs: https://learn.microsoft.com/azure/foundry/agents/how-to/deploy-hosted-agent
# Requires: Python 3.10+, azure-ai-projects>=2.1.0, az CLI 2.80+

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override via env vars or derive from azd env get-values
# ---------------------------------------------------------------------------
FOUNDRY_PROJECT_ENDPOINT="${FOUNDRY_PROJECT_ENDPOINT:-}"
CONTAINER_IMAGE="${CONTAINER_IMAGE:-}"
AGENT_NAME="${AGENT_NAME:-advisor-agent}"
AGENT_CPU="${AGENT_CPU:-1}"
AGENT_MEMORY="${AGENT_MEMORY:-2Gi}"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Foundry Hosted Agent — Registration Script (M2.1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [[ -z "${FOUNDRY_PROJECT_ENDPOINT}" ]]; then
  echo "❌  FOUNDRY_PROJECT_ENDPOINT is not set."
  echo "    This is required. Format: https://<resource>.services.ai.azure.com/api/projects/<project>"
  echo ""
  echo "    See docs/m2-foundry-hosted-agent.md for provisioning instructions."
  echo ""
  echo "SKIPPING registration — run when a Foundry project is provisioned."
  exit 0
fi

if [[ -z "${CONTAINER_IMAGE}" ]]; then
  echo "❌  CONTAINER_IMAGE is not set."
  echo "    Format: <acr-login-server>/advisor-agent:<tag>"
  echo "    Derive from: azd env get-values | grep AZURE_CONTAINER_REGISTRY_ENDPOINT"
  echo ""
  echo "SKIPPING registration."
  exit 0
fi

# Check Python and SDK
if ! command -v python3 &>/dev/null; then
  echo "❌  python3 not found — install Python 3.10+ to proceed."
  exit 1
fi

echo "  Project endpoint : ${FOUNDRY_PROJECT_ENDPOINT}"
echo "  Container image  : ${CONTAINER_IMAGE}"
echo "  Agent name       : ${AGENT_NAME}"
echo ""

# ---------------------------------------------------------------------------
# Install Python SDK if not present
# ---------------------------------------------------------------------------
echo "→ Checking azure-ai-projects SDK..."
if ! python3 -c "import azure.ai.projects" 2>/dev/null; then
  echo "  Installing azure-ai-projects>=2.1.0..."
  pip install "azure-ai-projects>=2.1.0" --quiet
fi
echo "  SDK ready ✓"
echo ""

# ---------------------------------------------------------------------------
# Register the Hosted Agent version via Python SDK
#
# NOTE: The advisor container must expose the azure-ai-agentserver-responses
# protocol library endpoint before this registration will produce a working agent.
# Currently the container exposes /v1/responses (custom route) which is NOT
# protocol-compatible with Foundry Hosted Agent.
# ---------------------------------------------------------------------------
echo "→ Registering Foundry Hosted Agent version..."

python3 - <<PYEOF
import os, sys, time
from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import HostedAgentDefinition, ProtocolVersionRecord, AgentProtocol

PROJECT_ENDPOINT = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
IMAGE            = os.environ["CONTAINER_IMAGE"]
AGENT_NAME       = os.environ.get("AGENT_NAME", "advisor-agent")
CPU              = os.environ.get("AGENT_CPU", "1")
MEMORY           = os.environ.get("AGENT_MEMORY", "2Gi")

credential = DefaultAzureCredential()
project = AIProjectClient(
    endpoint=PROJECT_ENDPOINT,
    credential=credential,
    allow_preview=True,
)

agent = project.agents.create_version(
    agent_name=AGENT_NAME,
    definition=HostedAgentDefinition(
        container_protocol_versions=[
            ProtocolVersionRecord(protocol=AgentProtocol.RESPONSES, version="1.0.0")
        ],
        cpu=CPU,
        memory=MEMORY,
        image=IMAGE,
        environment_variables={
            "ADVISOR_DEMO_MODE": os.environ.get("ADVISOR_DEMO_MODE", "false"),
            "ENTRA_TENANT_ID":   os.environ.get("ENTRA_TENANT_ID", ""),
            "ENTRA_API_AUDIENCE": os.environ.get("ENTRA_API_AUDIENCE", ""),
        }
    )
)

print(f"Agent created: name={agent.name}, version={agent.version}")
print("Polling for active status...")

MAX_WAIT = 300
start = time.time()
while time.time() - start < MAX_WAIT:
    v = project.agents.get_version(AGENT_NAME, agent.version)
    print(f"  status: {v.status}")
    if v.status == "active":
        print(f"Agent is ACTIVE. Endpoint: {PROJECT_ENDPOINT}/agents/{AGENT_NAME}")
        sys.exit(0)
    elif v.status in ("failed", "error"):
        print(f"Agent version failed: {v}")
        sys.exit(1)
    time.sleep(10)

print("Timeout waiting for agent to become active.")
sys.exit(1)
PYEOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Foundry Hosted Agent registration complete."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
