# Advisor Console (Copilot SDK + BYOK + Azure AI Foundry)

An interactive terminal agent built on the **GitHub Copilot SDK** (Python). It uses
**BYOK** (bring your own key) to talk directly to an **Azure AI Foundry** endpoint —
no GitHub Copilot subscription or token is needed for the model — and loads the local
skills under [`../skills/`](../skills) so the agent behaves like a disciplined
Microsoft AI architect. Every folder there with a `SKILL.md` is loaded:
[`microsoft-ai-decision-framework`](../skills/microsoft-ai-decision-framework) (the
decision methodology, required) and [`org-context`](../skills/org-context) (an
organization's enterprise-architecture constraints, so a business user can describe a
use case and have the architecture-heavy questions auto-answered).

It supports two auth modes: an **API key**, or **Microsoft Entra ID** via
`DefaultAzureCredential` (for resources that have key auth disabled).

## Prerequisites

- **Python 3.10+**
- **Node.js 22.5+** on your `PATH`. The Copilot SDK spawns the Copilot CLI under the
  hood, which imports the `node:sqlite` builtin (available only in Node 22.5+/24). On
  older Node the CLI crashes with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`.
- A reachable **Azure AI Foundry** deployment endpoint, plus either an API key or
  (for `FOUNDRY_AUTH_MODE=entra`) an `az login` session with a data-plane role such as
  **Cognitive Services OpenAI User** on the resource.

## Setup

```powershell
cd agent\advisor\src
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env: set endpoint + auth (key or entra)
```

## Configuration

Set via environment variables or a local `.env` file (loaded automatically).

| Variable               | Required | Default      | Description |
| ---------------------- | -------- | ------------ | ----------- |
| `FOUNDRY_AUTH_MODE`    | No       | `key`        | `key` (use `FOUNDRY_API_KEY`) or `entra` (Microsoft Entra via `DefaultAzureCredential` / `az login`). |
| `FOUNDRY_PROVIDER_TYPE`| No       | `azure`      | `azure` (native `*.openai.azure.com` endpoint) or `openai` (OpenAI-compatible `/openai/v1/` endpoint). |
| `FOUNDRY_ENDPOINT`     | Yes      | —            | Foundry endpoint. For `azure`, host only (any `/openai/...` path is stripped). For `openai`, normalized to end with `/openai/v1/`. |
| `FOUNDRY_API_KEY`      | If `key` | —            | Foundry API key. Required only when `FOUNDRY_AUTH_MODE=key`. |
| `FOUNDRY_TOKEN_SCOPE`  | No       | `https://cognitiveservices.azure.com/.default` | Entra token scope (used when `FOUNDRY_AUTH_MODE=entra`). |
| `ADVISOR_MODEL`        | No       | `gpt-4o`     | Deployment / model name in your Foundry resource. |
| `FOUNDRY_API_VERSION`  | No       | `2024-10-21` | Azure API version (used when `FOUNDRY_PROVIDER_TYPE=azure`). |
| `FOUNDRY_WIRE_API`     | No       | `responses`  | `responses` or `completions` (used when `FOUNDRY_PROVIDER_TYPE=openai`). |
| `LANGFUSE_PUBLIC_KEY`  | No       | —            | Langfuse public key. Setting this **and** `LANGFUSE_SECRET_KEY` enables OpenTelemetry tracing. |
| `LANGFUSE_SECRET_KEY`  | No       | —            | Langfuse secret key. |
| `LANGFUSE_HOST`        | No       | `http://localhost:3000` | Base URL of your Langfuse instance (`LANGFUSE_BASE_URL` is also accepted). OTLP endpoint is derived as `<host>/api/public/otel`. |
| `ADVISOR_OTEL_ENABLED` | No       | auto         | Explicit `true`/`false` override. Default: on when both Langfuse keys are present. |
| `ADVISOR_OTEL_CAPTURE_CONTENT` | No | `true`     | Whether prompt/response content is included in traces. |
| `ADVISOR_OTEL_SERVICE_NAME`    | No | `advisor-console` | Instrumentation / service name shown in Langfuse. |

> `.env` holds secrets and is ignored by git (`*.env`). Only `.env.example` is committed.

### Entra ID auth (key-disabled Foundry)

When the Foundry resource has API-key auth disabled, set `FOUNDRY_AUTH_MODE=entra`.
The app calls `DefaultAzureCredential` (which picks up `az login`, environment service
principals, managed identity, etc.), requests a token for `FOUNDRY_TOKEN_SCOPE`, and
passes it to the provider as a **bearer token**.

The Copilot SDK treats the bearer token as **static** — it is not refreshed during a
session. The console acquires a fresh token at startup; for very long sessions (tokens
last ~1 hour), restart the console to renew.

The `auth.py` module exposes the reusable helpers `get_access_token(scope)` and
`get_bearer_token(scope)`.

## Validate the token (recommended first step for Entra)

`validate_token.py` proves your identity can call the model end-to-end, independent of
the Copilot SDK. It requires `FOUNDRY_PROVIDER_TYPE=openai` (so it can build a
`.../openai/v1/responses` URL):

```powershell
az login                       # if not already signed in
python validate_token.py
python validate_token.py "Summarize the Microsoft AI capability model"
```

It prints a masked token + expiry, then POSTs to the Responses API and shows the model's
answer. A 401/403 means your identity lacks a data-plane role on the resource.

## Run

```powershell
python advisor_console.py
```
Then chat with the advisor. Commands:

- `/exit`, `/quit`, `/q` — leave the session
- `Ctrl+C` / `Ctrl+D` — also exits cleanly

Example:

```
You: Which Microsoft AI platform should we use for a governed claims assistant?
Advisor: ...
```

## Foundry Hosted Agent Deployment

This advisor can run as a **Foundry hosted agent** — a container that Azure AI
Foundry Agent Service pulls and runs, exposing the Foundry Responses protocol
while running this same Copilot SDK advisor inside. Full guide:

**`../foundry/README.md`**

In brief:

1. Build a single-arch image: `docker buildx build --platform linux/amd64 --provenance=false --sbom=false -t <acr>.azurecr.io/advisor-hosted:<tag> -f ../Dockerfile --push ..`
2. Grant the Foundry **project** identity `AcrPull` on the ACR.
3. Create the hosted agent version: `python ../foundry/deploy_hosted_agent.py`
4. Invoke: `python ../foundry/invoke_hosted_agent.py "<question>"`

The container entrypoint is `foundry_hosted_agent.py`; skills are baked into the image.

## Debugging in VS Code

`.vscode/launch.json` (at the repo root) includes ready-made configurations
(requires the Python / `debugpy` extension):

- **Advisor Console** — debug the interactive REPL (runs in the integrated terminal so
  stdin works).
- **Validate Foundry Token** — debug `validate_token.py`.
- **Validate Foundry Token (custom prompt)** — prompts for the message to send.

Each loads `agent/advisor/src/.env` via `envFile` and sets the working directory to
`agent/advisor/src` so the skill path and `.env` resolve. Pick a configuration in the
Run and Debug panel and press F5.

## Observability (optional): OpenTelemetry → Langfuse

The console can export **OpenTelemetry** traces (turns, tool calls, and LLM usage emitted by
the Copilot CLI) to a [Langfuse](https://langfuse.com/) instance. This is **off by default**
and fully optional — without Langfuse keys, nothing changes.

**Enable it** by setting both Langfuse keys (telemetry auto-enables when they are present):

```powershell
# in .env (next to advisor_console.py)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=http://localhost:3000   # default; your local Langfuse base URL
```

How it works:

- The SDK's `TelemetryConfig` (`SubprocessConfig(telemetry=...)`) points the Copilot CLI at the
  Langfuse OTLP endpoint, derived as `<LANGFUSE_HOST>/api/public/otel` (the exporter appends
  `/v1/traces`).
- Langfuse requires HTTP **Basic Auth**, which the SDK's `TelemetryConfig` does not expose. The
  console therefore sets the standard `OTEL_EXPORTER_OTLP_HEADERS` env var
  (`Authorization=Basic base64(public:secret)`) — the CLI subprocess inherits it. It also pins
  `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, since Langfuse only accepts OTLP over HTTP (no gRPC).
- On startup the console prints a `Telemetry: OpenTelemetry → <endpoint>` line when enabled.

> **Privacy:** `ADVISOR_OTEL_CAPTURE_CONTENT` defaults to `true`, so prompt/response content is
> sent to Langfuse. Set it to `false` for shared or remote Langfuse instances where message
> content should not leave the machine.

To explicitly disable telemetry even when keys are present, set `ADVISOR_OTEL_ENABLED=false`.

## How it works

- `CopilotClient()` starts the Copilot CLI subprocess.
- `create_session(...)` is configured with:
  - `provider=...` — the BYOK Azure AI Foundry configuration. With `FOUNDRY_PROVIDER_TYPE=azure`
    (default): `{ "type": "azure", "base_url": <host>, "azure": { "api_version": <ver> }, ... }`.
    With `openai`: `{ "type": "openai", "base_url": <.../openai/v1/>, "wire_api": <wire_api>, ... }`.
    Auth is either `api_key` (`FOUNDRY_AUTH_MODE=key`) or `bearer_token`
    (`FOUNDRY_AUTH_MODE=entra`, acquired via `DefaultAzureCredential`).
  - `skill_directories=[...]` to load every skill folder under `../skills` that has a
    `SKILL.md` (the framework skill is required and listed first; `org-context` and any
    future skills are auto-discovered — no code change needed to add one).
  - `on_permission_request=PermissionHandler.approve_all` so the agent can run its tools.
- Each turn uses `session.send_and_wait(...)`, which blocks until the session goes idle;
  an `on_event` handler streams assistant messages and tool activity to the console.

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` | Node.js too old | Install Node.js 22.5+ (24 recommended). |
| `Configuration error: Missing required environment variable(s)` | `.env` not filled in | Set `FOUNDRY_ENDPOINT` (and `FOUNDRY_API_KEY` for key mode). |
| `Failed to acquire an Entra token` | Not signed in | Run `az login` (or configure another `DefaultAzureCredential` source). |
| `HTTP 401/403` from the model | Identity lacks data-plane access | Grant your identity **Cognitive Services OpenAI User** on the resource. |
| `Required skill not found` / `Skills directory not found` | Run from the wrong place / skill moved | Keep `advisor_console.py` in `agent/advisor/src` alongside `../skills/` (which must contain `microsoft-ai-decision-framework`). |
| Timeouts | Slow/unreachable endpoint | Verify endpoint, model, and network access to Foundry. |
| Authentication errors (key mode) | Wrong key or endpoint | Confirm the key and that the endpoint resolves correctly. |
