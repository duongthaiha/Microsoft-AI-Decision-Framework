"""Evaluation target: run the advisor agent and return its recommendation text.

The Azure AI Evaluation ``evaluate(target=...)`` API calls this with each row's
``query`` and expects a dict of outputs (here ``{"response": <text>}``). We reuse
the production console wiring (``advisor_console``) so the agent under test is
exactly the one users run: the Copilot SDK with both skills and the deterministic
system message.

Because the Copilot SDK is async and ``evaluate`` calls the target synchronously
(potentially from worker threads), each call runs the agent in its own event loop.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Reuse the console module that lives in ../src.
_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import advisor_console as console  # noqa: E402
from auth import get_access_token  # noqa: E402

TURN_TIMEOUT_SECONDS = float(os.environ.get("ADVISOR_EVAL_TIMEOUT", "300"))


async def _run_once(query: str) -> str:
    from copilot import CopilotClient
    from copilot.session import PermissionHandler

    config = console.load_config()

    bearer = None
    if config.auth_mode == "entra":
        bearer = get_access_token(config.token_scope).token
    provider = config.provider(bearer_token=bearer)

    captured: list[str] = []

    def on_event(event):
        if event.type.value == "assistant.message":
            content = getattr(event.data, "content", "")
            if content:
                captured.append(content)

    client = CopilotClient()
    session = None
    try:
        await client.start()
        session = await client.create_session(
            on_permission_request=PermissionHandler.approve_all,
            model=config.model,
            provider=provider,
            skill_directories=[str(d) for d in config.skill_dirs],
            system_message=console.make_system_message(config.skill_dirs),
            on_event=on_event,
        )
        await session.send_and_wait(query, timeout=TURN_TIMEOUT_SECONDS)
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

    return "\n".join(captured).strip()


class AdvisorTarget:
    """Callable target for ``evaluate(target=AdvisorTarget())``."""

    def __call__(self, *, query: str, **_: object) -> dict:
        response = asyncio.run(_run_once(query))
        return {"response": response}


# A module-level callable also works as a target.
def advisor_target(*, query: str, **_: object) -> dict:
    return AdvisorTarget()(query=query)


if __name__ == "__main__":
    # Manual smoke test of the target on a single query.
    q = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "We want to help claims handlers summarise new claims faster."
    )
    out = AdvisorTarget()(query=q)
    print(out["response"])
