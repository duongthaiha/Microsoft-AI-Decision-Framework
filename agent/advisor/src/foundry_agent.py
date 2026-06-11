"""
Microsoft AI Decision Framework — Foundry Code-First Hosted Agent.

A code-first agent deployed to Azure AI Foundry that reuses the advisor console's
logic, configuration, and skills. Runs the same Copilot SDK-based advisor in
Foundry's agent service environment.

Configuration is read from environment variables (supports local `.env` if running
standalone for testing). When deployed to Foundry, these are provided by the
agent deployment config.

Prerequisites:
  - Python 3.10+
  - Node.js 22.5+ (Copilot SDK requires node:sqlite)
  - Azure AI Foundry endpoint with BYOK enabled
  - Entra ID or API key authentication

Environment variables:
  - FOUNDRY_ENDPOINT: Azure AI Foundry base URL (e.g., https://foundry-region.services.ai.azure.com)
  - FOUNDRY_AUTH_MODE: 'key' or 'entra'
  - FOUNDRY_PROVIDER_TYPE: 'azure' or 'openai' (default: azure)
  - FOUNDRY_API_KEY: API key (required if FOUNDRY_AUTH_MODE=key)
  - AZURE_CLIENT_ID: User-assigned managed identity client ID (Foundry sets this)
  - ADVISOR_MODEL: Model name (default: gpt-4o)
  - ADVISOR_ORGANIZATION_CONTEXT: Optional path to org-context skill (loaded in addition to default)
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

from copilot import CopilotClient
from copilot.session import PermissionHandler, SessionEvent

from auth import COGNITIVE_SERVICES_SCOPE, get_access_token

# Required bundled skill folder.
SKILL_NAME = "microsoft-ai-decision-framework"

# Foundry agent telemetry.
logger = logging.getLogger("foundry_agent")


class AdvisorConfig:
    """Resolved configuration for the foundry agent."""

    def __init__(
        self,
        *,
        auth_mode: str,
        provider_type: str,
        endpoint: str,
        api_key: str,
        token_scope: str,
        model: str,
        wire_api: str,
        api_version: str,
        skill_dirs: list[Path],
    ):
        self.auth_mode = auth_mode
        self.provider_type = provider_type
        self.endpoint = endpoint
        self.api_key = api_key
        self.token_scope = token_scope
        self.model = model
        self.wire_api = wire_api
        self.api_version = api_version
        self.skill_dirs = skill_dirs

    def _normalize_endpoint(self) -> str:
        """
        Normalize Foundry endpoint for the selected provider type.

        For azure provider: base_url is the HOST ONLY (no /openai/v1 suffix).
        For openai provider: base_url ends with /openai/v1/.
        """
        endpoint = self.endpoint.strip()
        parsed = urlsplit(endpoint)

        if self.provider_type == "azure":
            # base_url: https://host
            return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))

        elif self.provider_type == "openai":
            # base_url: https://host/openai/v1
            base = urlunsplit((parsed.scheme, parsed.netloc, "", "", "")).rstrip("/")
            if not base.endswith("/openai/v1"):
                base = f"{base}/openai/v1"
            return f"{base}/"

        raise ConfigError(f"Unknown provider type: {self.provider_type}")

    def provider(self, bearer_token: str | None = None) -> dict:
        """Build the Copilot SDK BYOK provider configuration.

        Azure AI Foundry can be reached two ways:
        - type="azure" for native Azure endpoints (*.openai.azure.com)
        - type="openai" for OpenAI-compatible /openai/v1/ endpoints
        """
        base_url = self._normalize_endpoint()

        if self.auth_mode == "entra":
            if not bearer_token:
                raise ConfigError("Entra auth selected but no bearer token provided")
            credential = {"bearer_token": bearer_token}
        else:
            if not self.api_key:
                raise ConfigError("Key auth selected but FOUNDRY_API_KEY not set")
            credential = {"api_key": self.api_key}

        if self.provider_type == "azure":
            return {
                "type": "azure",
                "base_url": base_url,
                "azure": {"api_version": self.api_version},
                **credential,
            }
        return {
            "type": "openai",
            "base_url": base_url,
            "wire_api": self.wire_api,
            **credential,
        }

    @staticmethod
    def from_env() -> AdvisorConfig:
        """Load configuration from environment variables."""
        if load_dotenv:
            load_dotenv()

        auth_mode = os.getenv("FOUNDRY_AUTH_MODE", "entra").lower()
        provider_type = os.getenv("FOUNDRY_PROVIDER_TYPE", "azure").lower()
        endpoint = os.getenv("FOUNDRY_ENDPOINT", "")
        api_key = os.getenv("FOUNDRY_API_KEY", "")
        model = os.getenv("ADVISOR_MODEL", "gpt-4o")

        if not endpoint:
            raise ConfigError("FOUNDRY_ENDPOINT environment variable not set")
        if auth_mode not in ("key", "entra"):
            raise ConfigError(
                f"FOUNDRY_AUTH_MODE must be 'key' or 'entra', got '{auth_mode}'"
            )
        if provider_type not in ("azure", "openai"):
            raise ConfigError(
                f"FOUNDRY_PROVIDER_TYPE must be 'azure' or 'openai', got '{provider_type}'"
            )

        # Determine wire_api and api_version based on provider type
        wire_api = "responses" if provider_type == "openai" else None
        api_version = "2024-08-01-preview"

        # Load skill directories
        skill_dirs: list[Path] = []
        skills_dir = Path(__file__).parent.parent / "skills"

        # Load the bundled Microsoft AI Decision Framework skill
        bundled_skill = skills_dir / SKILL_NAME
        if bundled_skill.exists() and (bundled_skill / "SKILL.md").exists():
            skill_dirs.append(bundled_skill)
            logger.info(f"Loaded skill: {SKILL_NAME}")

        # Load any additional org-context skill (optional)
        org_context_path = os.getenv("ADVISOR_ORGANIZATION_CONTEXT")
        if org_context_path:
            org_skill = Path(org_context_path)
            if org_skill.exists() and (org_skill / "SKILL.md").exists():
                skill_dirs.append(org_skill)
                logger.info(f"Loaded org-context skill: {org_skill.name}")

        if not skill_dirs:
            logger.warning("No skills found; advisor will run with default prompting")

        return AdvisorConfig(
            auth_mode=auth_mode,
            provider_type=provider_type,
            endpoint=endpoint,
            api_key=api_key,
            token_scope=COGNITIVE_SERVICES_SCOPE,
            model=model,
            wire_api=wire_api,
            api_version=api_version,
            skill_dirs=skill_dirs,
        )


class ConfigError(Exception):
    """Raised when required configuration is missing or invalid."""


class AdvisorAgent:
    """Foundry-hosted advisor agent using Copilot SDK."""

    def __init__(self, config: AdvisorConfig):
        self.config = config
        self.client: CopilotClient | None = None
        self.session = None
        self.bearer_token: str | None = None

    async def initialize(self) -> None:
        """Initialize Copilot client and session."""
        # Acquire bearer token if using Entra auth
        if self.config.auth_mode == "entra":
            try:
                token = get_access_token(self.config.token_scope)
                self.bearer_token = token
            except Exception as e:
                raise ConfigError(f"Failed to acquire Entra token: {e}") from e

        self.client = CopilotClient(None)
        await self.client.start()
        logger.info("Copilot client started")

        provider = self.config.provider(bearer_token=self.bearer_token)
        self.session = await self.client.create_session(
            model=self.config.model,
            provider=provider,
            skill_directories=[str(d) for d in self.config.skill_dirs],
            on_permission_request=PermissionHandler.approve_all,
        )
        logger.info(f"Session created with model: {self.config.model}")

    async def shutdown(self) -> None:
        """Clean up session and client."""
        if self.session:
            self.session.disconnect()
            logger.info("Session disconnected")
        if self.client:
            await self.client.stop()
            logger.info("Copilot client stopped")

    async def process_message(self, user_message: str, timeout_seconds: float = 300.0) -> str:
        """
        Send a user message to the advisor and get a response.

        Args:
            user_message: The user's input prompt
            timeout_seconds: Maximum time to wait for response

        Returns:
            The advisor's response text
        """
        if not self.session:
            raise RuntimeError("Agent not initialized; call initialize() first")

        logger.info(f"Processing message: {user_message[:100]}")
        response = await self.session.send_and_wait(
            user_message, timeout=timeout_seconds
        )

        result = response.data.content if response.data else ""
        logger.info(f"Response length: {len(result)} chars")
        return result


async def main():
    """Entry point for Foundry agent runtime."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    try:
        config = AdvisorConfig.from_env()
        agent = AdvisorAgent(config)

        await agent.initialize()
        logger.info("Advisor agent initialized and ready")

        try:
            # Main agent loop for Foundry (placeholder for Foundry integration)
            # In production, Foundry's orchestration layer calls process_message()
            # For now, we demonstrate with a simple test
            if len(sys.argv) > 1:
                user_input = " ".join(sys.argv[1:])
                response = await agent.process_message(user_input)
                print(f"\nAdvisor: {response}")
        finally:
            await agent.shutdown()

    except ConfigError as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
