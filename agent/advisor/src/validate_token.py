"""
Validate that DefaultAzureCredential can call the Foundry model.

This standalone console acquires a Microsoft Entra access token (via the
`auth` utility / DefaultAzureCredential) and makes a direct HTTPS call to the
OpenAI-compatible Responses API on your Azure AI Foundry endpoint, proving the
token works end-to-end against the model — independent of the Copilot SDK.

It reuses the same configuration as the advisor console (`.env`). The provider
type must be ``openai`` so a ``/openai/v1/responses`` URL can be built.

Run:
  python validate_token.py
  python validate_token.py "Summarize the Microsoft AI capability model"
"""

from __future__ import annotations

import datetime as _dt
import json
import sys
import urllib.error
import urllib.request

from advisor_console import ConfigError, load_config
from auth import get_access_token


def _mask(token: str) -> str:
    """Return a non-sensitive fingerprint of a token for logging."""
    return f"len={len(token)} prefix={token[:6]}… suffix=…{token[-4:]}"


def main() -> int:
    prompt = sys.argv[1] if len(sys.argv) > 1 else "What is 2+2? Answer in one short sentence."

    try:
        config = load_config()
    except ConfigError as exc:
        print(f"Configuration error:\n{exc}", file=sys.stderr)
        return 2

    if config.provider_type != "openai":
        print(
            "validate_token.py targets the OpenAI-compatible Responses API and "
            f"requires FOUNDRY_PROVIDER_TYPE=openai (got {config.provider_type!r}).\n"
            "Set FOUNDRY_PROVIDER_TYPE=openai and a /openai/v1/ endpoint.",
            file=sys.stderr,
        )
        return 2

    # 1) Acquire the Entra token.
    print(f"Acquiring Entra token (scope: {config.token_scope}) …")
    try:
        token = get_access_token(config.token_scope)
    except Exception as exc:  # broad: surface any credential failure clearly
        print(
            f"Failed to acquire token via DefaultAzureCredential: {exc}\n"
            "Make sure you are signed in (e.g. `az login`).",
            file=sys.stderr,
        )
        return 3

    expires = _dt.datetime.fromtimestamp(token.expires_on, tz=_dt.timezone.utc)
    print(f"  Token OK: {_mask(token.token)}")
    print(f"  Expires:  {expires.isoformat()} (UTC)")

    # 2) Call the model's Responses API directly with the bearer token.
    url = config.responses_url()
    payload = json.dumps({"model": config.model, "input": prompt}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token.token}",
            "Content-Type": "application/json",
        },
    )

    print(f"\nCalling model '{config.model}' at:\n  {url}")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            status = response.status
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"\nHTTP {exc.code} {exc.reason}", file=sys.stderr)
        print(detail[:2000], file=sys.stderr)
        if exc.code in (401, 403):
            print(
                "\nThe token was rejected. Confirm your identity has a data-plane role "
                "such as 'Cognitive Services OpenAI User' on the resource.",
                file=sys.stderr,
            )
        return 4
    except urllib.error.URLError as exc:
        print(f"\nNetwork error calling {url}: {exc.reason}", file=sys.stderr)
        return 4

    print(f"\nHTTP {status} — token successfully called the model.")
    try:
        data = json.loads(body)
        text = _extract_output_text(data)
        if text:
            print(f"\nModel output:\n{text}")
        else:
            print("\nRaw response (no plain text field found):")
            print(json.dumps(data, indent=2)[:2000])
    except json.JSONDecodeError:
        print("\nRaw response:")
        print(body[:2000])

    return 0


def _extract_output_text(data: dict) -> str:
    """Best-effort extraction of assistant text from a Responses API payload."""
    # Newer Responses API exposes a convenience aggregate.
    if isinstance(data.get("output_text"), str):
        return data["output_text"]

    chunks: list[str] = []
    for item in data.get("output", []) or []:
        for content in item.get("content", []) or []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks)


if __name__ == "__main__":
    sys.exit(main())
