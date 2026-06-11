"""
Microsoft AI Decision Framework — Advisor Console.

An interactive console agent built on the GitHub Copilot SDK that uses BYOK
(bring your own key) against an Azure AI Foundry endpoint, and loads the local
`microsoft-ai-decision-framework` skill so the agent behaves like a disciplined
Microsoft AI architect.

Configuration is read from environment variables (a local `.env` file is loaded
automatically if present). See `.env.example`.

Prerequisites:
  - Python 3.10+
  - Node.js 22.5+ (the Copilot SDK spawns the Copilot CLI, which uses node:sqlite)
  - A reachable Azure AI Foundry endpoint, plus either an API key
    (FOUNDRY_AUTH_MODE=key) or Microsoft Entra access via `az login`
    (FOUNDRY_AUTH_MODE=entra) for key-disabled resources.

Run:
  pip install -r requirements.txt
  python advisor_console.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

try:
    from dotenv import load_dotenv
except ImportError:  # python-dotenv is optional at runtime
    load_dotenv = None

from copilot import CopilotClient
from copilot.session import PermissionHandler, SessionEvent

from auth import COGNITIVE_SERVICES_SCOPE, get_access_token

# Name of the bundled skill folder, located one level up at ../skills/<name>.
SKILL_NAME = "microsoft-ai-decision-framework"

# How long (seconds) to wait for the agent to finish a single turn. Generous,
# because framework reasoning over the bundled references can take a while.
TURN_TIMEOUT_SECONDS = 300.0

EXIT_COMMANDS = {"/exit", "/quit", "/q"}


class ConfigError(Exception):
    """Raised when required configuration is missing or invalid."""


class AdvisorConfig:
    """Resolved configuration for the advisor console."""

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
        skill_dir: Path,
    ) -> None:
        self.auth_mode = auth_mode
        self.provider_type = provider_type
        self.endpoint = endpoint
        self.api_key = api_key
        self.token_scope = token_scope
        self.model = model
        self.wire_api = wire_api
        self.api_version = api_version
        self.skill_dir = skill_dir

    def responses_url(self) -> str:
        """Full URL of the OpenAI-compatible Responses API for this endpoint.

        Only meaningful for ``openai`` provider type (``.../openai/v1/responses``).
        """
        return f"{self.endpoint.rstrip('/')}/responses"

    def provider(self, bearer_token: str | None = None) -> dict:
        """Build the Copilot SDK BYOK provider configuration.

        Azure AI Foundry can be reached two ways (see the SDK BYOK docs):

        - ``type="azure"`` for native Azure endpoints (``*.openai.azure.com``).
          ``base_url`` is the host only and ``azure.api_version`` is sent.
        - ``type="openai"`` for the OpenAI-compatible ``/openai/v1/`` endpoint,
          using ``wire_api`` instead.

        Auth is either an API key (``auth_mode="key"``) or a Microsoft Entra
        bearer token (``auth_mode="entra"``). The bearer token is supplied by the
        caller because it is acquired asynchronously / can expire.
        """
        if self.auth_mode == "entra":
            if not bearer_token:
                raise ConfigError("Entra auth selected but no bearer token was provided.")
            credential: dict = {"bearer_token": bearer_token}
        else:
            credential = {"api_key": self.api_key}

        if self.provider_type == "azure":
            return {
                "type": "azure",
                "base_url": self.endpoint,
                "azure": {"api_version": self.api_version},
                **credential,
            }
        return {
            "type": "openai",
            "base_url": self.endpoint,
            "wire_api": self.wire_api,
            **credential,
        }


def _normalize_endpoint(raw: str, provider_type: str) -> str:
    """Normalize the Foundry endpoint for the selected provider type.

    - ``azure``: scheme + host only (e.g. ``https://my-resource.openai.azure.com``);
      any ``/openai/...`` path is stripped, because the SDK builds the path.
    - ``openai``: an OpenAI-compatible base URL ending in ``/openai/v1/``.
    """
    endpoint = raw.strip()
    if not endpoint:
        raise ConfigError("FOUNDRY_ENDPOINT must not be empty.")

    parts = urlsplit(endpoint)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ConfigError(f"FOUNDRY_ENDPOINT must be an http(s) URL, got: {raw!r}")

    if provider_type == "azure":
        # Host only; the SDK constructs the /openai/... path itself.
        return urlunsplit((parts.scheme, parts.netloc, "", "", ""))

    # openai (OpenAI-compatible): ensure the base URL ends with /openai/v1/.
    base = urlunsplit((parts.scheme, parts.netloc, "", "", "")).rstrip("/")
    if not base.endswith("/openai/v1"):
        base = f"{base}/openai/v1"
    return f"{base}/"


def load_config() -> AdvisorConfig:
    """Read and validate configuration from the environment."""
    if load_dotenv is not None:
        # Load a .env sitting next to this script, if present.
        load_dotenv(Path(__file__).resolve().parent / ".env")

    auth_mode = os.environ.get("FOUNDRY_AUTH_MODE", "key").strip().lower() or "key"
    provider_type = (
        os.environ.get("FOUNDRY_PROVIDER_TYPE", "azure").strip().lower() or "azure"
    )
    endpoint = os.environ.get("FOUNDRY_ENDPOINT", "")
    api_key = os.environ.get("FOUNDRY_API_KEY", "")
    token_scope = (
        os.environ.get("FOUNDRY_TOKEN_SCOPE", COGNITIVE_SERVICES_SCOPE).strip()
        or COGNITIVE_SERVICES_SCOPE
    )
    model = os.environ.get("ADVISOR_MODEL", "gpt-4o").strip() or "gpt-4o"
    wire_api = os.environ.get("FOUNDRY_WIRE_API", "responses").strip() or "responses"
    api_version = (
        os.environ.get("FOUNDRY_API_VERSION", "2024-10-21").strip() or "2024-10-21"
    )

    if auth_mode not in ("key", "entra"):
        raise ConfigError(
            f"FOUNDRY_AUTH_MODE must be 'key' or 'entra', got: {auth_mode!r}"
        )

    if provider_type not in ("azure", "openai"):
        raise ConfigError(
            f"FOUNDRY_PROVIDER_TYPE must be 'azure' or 'openai', got: {provider_type!r}"
        )

    # FOUNDRY_API_KEY is required only for key auth; entra uses a token.
    required = [("FOUNDRY_ENDPOINT", endpoint)]
    if auth_mode == "key":
        required.append(("FOUNDRY_API_KEY", api_key))
    missing = [name for name, value in required if not value.strip()]
    if missing:
        raise ConfigError(
            "Missing required environment variable(s): "
            + ", ".join(missing)
            + ".\nCopy .env.example to .env and fill in your values."
        )

    if wire_api not in ("responses", "completions"):
        raise ConfigError(
            f"FOUNDRY_WIRE_API must be 'responses' or 'completions', got: {wire_api!r}"
        )

    skill_dir = Path(__file__).resolve().parent.parent / "skills" / SKILL_NAME
    if not skill_dir.is_dir():
        raise ConfigError(f"Skill directory not found: {skill_dir}")

    return AdvisorConfig(
        auth_mode=auth_mode,
        provider_type=provider_type,
        endpoint=_normalize_endpoint(endpoint, provider_type),
        api_key=api_key.strip(),
        token_scope=token_scope,
        model=model,
        wire_api=wire_api,
        api_version=api_version,
        skill_dir=skill_dir,
    )


def make_event_handler() -> "callable":
    """Build a session event handler that prints assistant output and tool activity."""

    def handle_event(event: SessionEvent) -> None:
        event_type = event.type.value
        if event_type == "assistant.message":
            content = getattr(event.data, "content", "")
            if content:
                print(f"\nAdvisor: {content}\n")
        elif event_type == "tool.execution_start":
            tool_name = getattr(event.data, "tool_name", "tool")
            print(f"  → {tool_name}")
        elif event_type == "session.error":
            message = getattr(event.data, "message", str(event.data))
            print(f"\n[session error] {message}\n", file=sys.stderr)

    return handle_event


async def read_user_input(prompt: str) -> str:
    """Read a line from stdin without blocking the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: input(prompt))


async def run() -> int:
    try:
        config = load_config()
    except ConfigError as exc:
        print(f"Configuration error:\n{exc}", file=sys.stderr)
        return 2

    # Acquire a Microsoft Entra bearer token when using entra auth.
    bearer_token = None
    if config.auth_mode == "entra":
        try:
            token = get_access_token(config.token_scope)
        except Exception as exc:
            print(
                f"Failed to acquire an Entra token via DefaultAzureCredential: {exc}\n"
                "Make sure you are signed in (e.g. `az login`) and have access to the "
                "resource.",
                file=sys.stderr,
            )
            return 3
        bearer_token = token.token

    provider = config.provider(bearer_token=bearer_token)

    print("Microsoft AI Decision Framework — Advisor Console")
    print(f"  Auth:     {config.auth_mode}")
    print(f"  Provider: {config.provider_type}")
    print(f"  Model:    {config.model}")
    print(f"  Endpoint: {config.endpoint}")
    print(f"  Skill:    {config.skill_dir.name}")
    if config.auth_mode == "entra":
        print("  Note:     Entra token is static for this session; restart if it expires.")
    print("Type your question. Use /exit (or /quit) to leave.\n")

    client = CopilotClient()
    session = None
    try:
        await client.start()
        session = await client.create_session(
            on_permission_request=PermissionHandler.approve_all,
            model=config.model,
            provider=provider,
            skill_directories=[str(config.skill_dir)],
            on_event=make_event_handler(),
        )

        while True:
            try:
                user_input = (await read_user_input("You: ")).strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break

            if not user_input:
                continue
            if user_input.lower() in EXIT_COMMANDS:
                break

            try:
                await session.send_and_wait(user_input, timeout=TURN_TIMEOUT_SECONDS)
            except TimeoutError:
                print(
                    f"\n[timed out after {TURN_TIMEOUT_SECONDS:.0f}s waiting for a response]\n",
                    file=sys.stderr,
                )
            except Exception as exc:  # surface runtime/provider errors, keep the REPL alive
                print(f"\n[error] {exc}\n", file=sys.stderr)
    finally:
        if session is not None:
            try:
                await session.disconnect()
            except Exception:
                pass
        try:
            await client.stop()
        except Exception:
            pass

    print("Goodbye.")
    return 0


def main() -> None:
    try:
        exit_code = asyncio.run(run())
    except KeyboardInterrupt:
        exit_code = 130
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
