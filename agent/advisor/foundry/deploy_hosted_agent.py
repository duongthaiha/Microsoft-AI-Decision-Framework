"""
Create (or update) the Foundry **hosted agent** version for the advisor.

This registers the container image we pushed to ACR with Foundry Agent Service.
The platform pulls the image, provisions a dedicated Entra agent identity, and
runs the container behind the agent's Responses endpoint. We then poll until the
version is ``active``.

Run:
  python foundry/deploy_hosted_agent.py
"""

from __future__ import annotations

import os
import sys
import time

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (
    AgentProtocol,
    ContainerConfiguration,
    HostedAgentDefinition,
    ProtocolVersionRecord,
)
from azure.identity import DefaultAzureCredential

PROJECT_ENDPOINT = os.environ.get(
    "FOUNDRY_PROJECT_ENDPOINT",
    "https://foundry-project-hd-sc-resource.services.ai.azure.com/api/projects/project-hd-sc",
)
AGENT_NAME = os.environ.get("ADVISOR_AGENT_NAME", "advisor-agent")
IMAGE = os.environ.get(
    "ADVISOR_IMAGE", "acradvvvsqmavln47g4.azurecr.io/advisor-hosted:v4"
)

# The container runs the Copilot SDK advisor with BYOK against the Foundry model.
# It authenticates with the platform-provisioned agent identity (entra), so no
# key is needed. gpt-5.4 is reached through the OpenAI-compatible Responses API.
# NOTE: FOUNDRY_* and AGENT_* env names are reserved by the platform, so the
# advisor config is passed under ADVISOR_* names and remapped inside the container.
AGENT_ENV = {
    "ADVISOR_FOUNDRY_ENDPOINT": os.environ.get(
        "ADVISOR_FOUNDRY_ENDPOINT",
        "https://foundry-project-hd-sc-resource.services.ai.azure.com",
    ),
    "ADVISOR_AUTH_MODE": "entra",
    "ADVISOR_PROVIDER_TYPE": "openai",
    "ADVISOR_WIRE_API": "responses",
    # The hosted agent identity authenticates to the project's /openai/v1 endpoint
    # with the AI Foundry data-plane audience (not the cognitiveservices audience).
    "ADVISOR_TOKEN_SCOPE": "https://ai.azure.com/.default",
    "ADVISOR_MODEL": os.environ.get("ADVISOR_MODEL", "gpt-5.4"),
}


def main() -> int:
    credential = DefaultAzureCredential()
    project = AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=credential,
        allow_preview=True,
    )

    print(f"Creating hosted agent version: {AGENT_NAME}")
    print(f"  image: {IMAGE}")
    print(f"  env:   {AGENT_ENV}")

    agent = project.agents.create_version(
        agent_name=AGENT_NAME,
        definition=HostedAgentDefinition(
            container_configuration=ContainerConfiguration(image=IMAGE),
            protocol_versions=[
                ProtocolVersionRecord(protocol=AgentProtocol.RESPONSES, version="1.0.0")
            ],
            cpu="1",
            memory="2Gi",
            environment_variables=AGENT_ENV,
        ),
        description="Microsoft AI Decision Framework Advisor (Copilot SDK, hosted container)",
    )

    version = agent.version
    print(f"Created version {version}. Polling for active status...")

    deadline = time.time() + 600
    while time.time() < deadline:
        info = project.agents.get_version(agent_name=AGENT_NAME, agent_version=version)
        status = info["status"] if isinstance(info, dict) else getattr(info, "status", None)
        print(f"  status: {status}")
        status_str = str(status).lower()
        if status_str.endswith("active"):
            print("Hosted agent is ACTIVE.")
            print(f"  agent: {AGENT_NAME}  version: {version}")
            return 0
        if status_str.endswith("failed"):
            err = info.get("error") if isinstance(info, dict) else getattr(info, "error", None)
            print(f"Provisioning FAILED: {err}", file=sys.stderr)
            return 1
        time.sleep(10)

    print("Timed out waiting for active status.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
