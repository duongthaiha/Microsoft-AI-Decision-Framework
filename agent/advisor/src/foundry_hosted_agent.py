"""
Microsoft AI Decision Framework — Foundry Hosted Agent entrypoint.

This is the container entrypoint for a **Foundry hosted agent** (a containerized
agent that Foundry Agent Service pulls and runs). It speaks the Foundry
**Responses** protocol via ``azure-ai-agentserver-responses`` and, for every
request, runs the *same* GitHub Copilot SDK advisor that powers the local console
(``advisor_console.py``) — the Copilot logic is preserved, not replaced.

Request flow:
  client -> Foundry gateway -> POST /responses (this container, port 8088)
    -> Copilot SDK session (BYOK against the Foundry model) -> advisor answer

Authentication:
  The hosted platform provisions a dedicated Entra agent identity with the
  ``Foundry User`` role on the project. ``DefaultAzureCredential`` picks that up
  automatically, so we run in ``FOUNDRY_AUTH_MODE=entra`` and acquire a fresh
  data-plane token per request (the credential caches and refreshes it).

Configuration (set as agent version ``environment_variables``):
  - FOUNDRY_ENDPOINT        Azure OpenAI / Foundry host for the Copilot SDK BYOK
                            provider (e.g. https://<resource>.openai.azure.com)
  - FOUNDRY_AUTH_MODE       'entra' (default here) or 'key'
  - FOUNDRY_PROVIDER_TYPE   'azure' (default) or 'openai'
  - ADVISOR_MODEL           model/deployment name (e.g. gpt-5.4)
  - FOUNDRY_API_KEY         only when FOUNDRY_AUTH_MODE=key

The platform also injects FOUNDRY_PROJECT_ENDPOINT, FOUNDRY_AGENT_NAME, etc.
Containers serve on port 8088; the protocol library exposes ``/responses`` and
the ``/readiness`` health endpoint automatically.
"""

from __future__ import annotations

import asyncio
import logging
import os

# The Foundry hosted platform reserves all FOUNDRY_* and AGENT_* environment
# variable names. We therefore receive the advisor's configuration under
# ADVISOR_* names and map it onto the FOUNDRY_* names that advisor_console's
# load_config() expects — before any config is read.
_ENV_ALIASES = {
    "ADVISOR_FOUNDRY_ENDPOINT": "FOUNDRY_ENDPOINT",
    "ADVISOR_AUTH_MODE": "FOUNDRY_AUTH_MODE",
    "ADVISOR_PROVIDER_TYPE": "FOUNDRY_PROVIDER_TYPE",
    "ADVISOR_WIRE_API": "FOUNDRY_WIRE_API",
    "ADVISOR_API_VERSION": "FOUNDRY_API_VERSION",
    "ADVISOR_API_KEY": "FOUNDRY_API_KEY",
    "ADVISOR_TOKEN_SCOPE": "FOUNDRY_TOKEN_SCOPE",
}
for _src, _dst in _ENV_ALIASES.items():
    if os.environ.get(_src) and not os.environ.get(_dst):
        os.environ[_dst] = os.environ[_src]

from azure.ai.agentserver.responses import (
    CreateResponse,
    ResponseContext,
    ResponsesAgentServerHost,
    TextResponse,
)

# Reuse the console's configuration, skill discovery, and system message so the
# hosted agent behaves identically to the local REPL.
from advisor_console import load_config, make_system_message
from auth import get_access_token

from copilot import CopilotClient
from copilot.session import PermissionHandler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("foundry_hosted_agent")

# Load configuration and build the deterministic system message once at startup.
_config = load_config()
_system_message = make_system_message(_config.skill_dirs)

# In the hosted platform, model inference must go through the *project* endpoint
# (the agent identity has the Foundry User role on the project, not on the bare
# account). The platform injects FOUNDRY_PROJECT_ENDPOINT
# (https://<resource>.services.ai.azure.com/api/projects/<project>); the
# OpenAI-compatible model API lives at <project_endpoint>/openai/v1/. The console's
# endpoint normalizer strips the /api/projects path, so we set the provider
# base_url directly here when the platform endpoint is present.
_project_endpoint = os.environ.get("FOUNDRY_PROJECT_ENDPOINT", "").strip()
if _project_endpoint:
    _config.provider_type = "openai"
    _config.wire_api = "responses"
    _config.endpoint = _project_endpoint.rstrip("/") + "/openai/v1/"
    logger.info("Using project inference endpoint: %s", _config.endpoint)

# A single Copilot client (which spawns the Copilot CLI) is shared across
# requests; a fresh session is created per request so each turn uses a current
# Entra token and an isolated conversation.
_client: CopilotClient | None = None
_client_lock = asyncio.Lock()

app = ResponsesAgentServerHost()


async def _get_client() -> CopilotClient:
    """Start (once) and return the shared Copilot client."""
    global _client
    async with _client_lock:
        if _client is None:
            logger.info("Starting Copilot client (spawns Copilot CLI)...")
            client = CopilotClient(None)
            await client.start()
            _client = client
            logger.info("Copilot client ready.")
        return _client


async def _run_advisor(user_input: str) -> str:
    """Run one advisor turn through a fresh Copilot SDK session."""
    client = await _get_client()

    bearer_token = None
    if _config.auth_mode == "entra":
        bearer_token = get_access_token(_config.token_scope).token

    provider = _config.provider(bearer_token=bearer_token)

    session = await client.create_session(
        on_permission_request=PermissionHandler.approve_all,
        model=_config.model,
        provider=provider,
        skill_directories=[str(d) for d in _config.skill_dirs],
        system_message=_system_message,
    )
    try:
        response = await session.send_and_wait(user_input, timeout=300.0)
        data = getattr(response, "data", None)
        return getattr(data, "content", "") or ""
    finally:
        session.disconnect()


@app.response_handler
async def handle(
    request: CreateResponse,
    context: ResponseContext,
    cancellation_signal: asyncio.Event,
):
    """Foundry Responses protocol handler: one advisor answer per request."""

    async def produce():
        user_input = (await context.get_input_text()) or ""
        if not user_input.strip():
            yield "Ask me which Microsoft AI technology fits your scenario."
            return
        try:
            yield await _run_advisor(user_input)
        except Exception as exc:  # surface errors to the caller instead of hanging
            logger.exception("Advisor turn failed")
            yield f"[advisor error] {exc}"

    return TextResponse(context, request, text=produce())


if __name__ == "__main__":
    app.run()
