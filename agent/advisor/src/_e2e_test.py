"""One-shot end-to-end test: business-user prompt with both skills loaded."""
import asyncio
import sys

from copilot import CopilotClient
from copilot.session import PermissionHandler

import advisor_console as a
from auth import get_access_token

PROMPT = (
    "I work in the claims team. I'm not technical. We want to cut the time our "
    "claims handlers spend reading and summarising new claims so they can help "
    "members faster. How should we build this, and what should I tell our "
    "architects? Give me your recommendation."
)


async def main() -> int:
    config = a.load_config()
    print("Skills:", [d.name for d in config.skill_dirs])
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
        elif event.type.value == "tool.execution_start":
            print("  tool:", getattr(event.data, "tool_name", "?"))

    client = CopilotClient()
    session = None
    try:
        await client.start()
        session = await client.create_session(
            on_permission_request=PermissionHandler.approve_all,
            model=config.model,
            provider=provider,
            skill_directories=[str(d) for d in config.skill_dirs],
            on_event=on_event,
        )
        await session.send_and_wait(PROMPT, timeout=280.0)
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

    answer = "\n".join(captured)
    print("\n===== ASSISTANT OUTPUT =====\n")
    print(answer)
    print("\n===== CHECKS =====")

    checks = {
        "mentions Acme": "acme" in answer.lower(),
        "references an Acme standard / org context": (
            "per acme standard" in answer.lower()
            or "acme standard" in answer.lower()
            or "org-context" in answer.lower()
        ),
        "auto-answered architecture (names a Microsoft platform)": any(
            p in answer.lower()
            for p in ["copilot studio", "microsoft 365 copilot", "azure ai", "power platform", "guidewire", "azure data platform"]
        ),
        "respects human-in-the-loop / governance": any(
            p in answer.lower()
            for p in ["human-in-the-loop", "human in the loop", "consumer duty", "review", "approval"]
        ),
        "includes Architect Review section": "architect review" in answer.lower(),
    }
    failed = 0
    for name, ok in checks.items():
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
        failed += 0 if ok else 1
    print(f"\n{len(checks) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
