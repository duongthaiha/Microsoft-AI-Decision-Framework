# Local Development — Running the Advisor Agent

> M0 scaffold. Full feature logic ships in M1. This runbook works **today**.

## TL;DR

Clone the repo. Run `npm install` at the workspace root. Open two terminals: one runs the backend (`agent`), one runs the web app (`web`). Both forward to localhost. Open your browser. You're done.

## Prerequisites

- **Node.js** 20.x LTS or later ([nodejs.org](https://nodejs.org))
- **npm** 10.x or later (ships with Node; verify with `npm --version`)
- **git** (to clone the repo)
- **Azure CLI** (`az` command-line tool) — *optional for now*. You'll need it only if you deploy to Azure (M1+). For pure local dev, skip it.

## First-Time Setup

### Option 1: GitHub Codespace (easiest)

If you're using GitHub Codespaces, the environment is pre-configured. You can skip to **The Two-Terminal Dev Loop** below.

### Option 2: Local clone

```bash
git clone <repo-url> advisor-agent
cd advisor-agent
```

### Install dependencies

Run this **once** at the workspace root. npm workspaces will install dependencies for both `agent/` and `web/` automatically:

```bash
npm install
```

That's it. You're ready.

## The Two-Terminal Dev Loop (M0 — Works Today)

The Advisor Agent uses two processes: a backend (Express/Node.js) and a frontend (React/Vite). They run independently.

### Terminal 1: Backend

```bash
cd advisor-agent/agent
npm run build
ADVISOR_DEMO_MODE=true ADVISOR_LOCAL_DEV=true node dist/index.js
```

**What you'll see:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Advisor Agent — M0 scaffold
  Listening on http://0.0.0.0:8080
  Demo mode  : ON
  Local dev  : ON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Environment variables explained:**

| Variable | What it does |
|----------|-------------|
| `ADVISOR_DEMO_MODE=true` | Disables Entra ID sign-in. Use test fixtures instead. *Saves you from MSAL setup locally.* |
| `ADVISOR_LOCAL_DEV=true` | Relaxes CORS headers, enables verbose logging. *Makes local browser-to-backend requests work.* |

**Note on M0 workflow:** We don't have a `npm run dev` script yet for the backend (that's M1). You must `npm run build` before each `node dist/index.js` run. This is a known papercut. Dallas owns the fix — see [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md).

### Terminal 2: Frontend

```bash
cd advisor-agent/web
npm run dev
```

**What you'll see:**
```
  VITE v5.1.0  ready in 245 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
```

That's your web app. Keep this terminal open.

## Verifying It Works

### Backend health check

In a third terminal (or your browser):

```bash
curl http://localhost:8080/health
```

**Expected output:**
```json
{"status":"ok","service":"advisor-agent","version":"0.0.1"}
```

If you see that, your backend is alive.

### Browser

Navigate to `http://localhost:5173` in your browser. You should see the Advisor intake form. You can interact with the UI — filling out the form won't error.

**Important M0 note:** Non-`/health` API calls (e.g., submitting the intake form) will return HTTP 501 `NotImplementedError` by design. We haven't wired the business logic yet. That lands in M1. See [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) for the milestone roadmap.

## Hybrid Mode (Local App → Azure Backend)

Once you've deployed the Azure stack using `azd up`, you can run the agent locally against deployed Azure resources: Cosmos DB, Azure OpenAI, Container App health checks. Your local `az login` identity becomes the credential via `DefaultAzureCredential` — no API keys needed.

### Prerequisites

1. **Azure CLI** — `az` must be installed and authenticated to the right subscription:
   ```bash
   az account show  # Verify you're logged in and on the right tenant/subscription
   ```
   This identity will be used to access:
   - Cosmos DB (`advisor-cosmos-*` instance)
   - Azure OpenAI (`advisor-aoai-*` instance)
   - Application Insights connection string (read-only)

2. **Deployed stack** — You must have run `azd up` at least once. See [docs/deployment.md](./deployment.md) for full deploy steps.

3. **Environment files** — Parker's deploy run writes `agent/.env.local` and `web/.env.local` automatically. If they don't exist, grab them from your `.azure/<environment>/.env` (e.g., `.azure/advisor-dev/.env`) and copy the relevant outputs to each `.env.local` file.

### Boot the Local Agent

```bash
# 1. Verify az login is active
az account show

# 2. Navigate to agent directory and source the env file
cd advisor-agent/agent

# 3. Build once
npm run build

# 4. Run the one-liner (sources .env.local, boots agent on port 8080)
set -a && source .env.local && set +a && node dist/index.js
```

You should see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Advisor Agent — Hybrid Mode
  Listening on http://0.0.0.0:8080
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Verify health:
```bash
curl http://localhost:8080/health
# → {"status":"ok","service":"advisor-agent","version":"0.0.1"}
```

### What Works Today in Hybrid Mode

- **Cosmos DB** — Agent can read/write via managed identity.
- **Azure OpenAI** — Calls to `gpt-4.1-mini` deployment work (pending M1 SDK wiring).
- **Application Insights** — Telemetry is logged.
- **Container App** — Can probe the deployed endpoint for health checks.

### Known Gaps (M0/M1)

- **AI Search** — Provisioning skipped (eastus2 quota exhausted). Will be available in M1 after quota refresh or region switch.
- **Web SPA deployment** — Static Web App resource exists but hasn't been deployed. Requires `VITE_ADVISOR_CLIENT_ID` and `VITE_ADVISOR_TENANT_ID` for Entra ID (M2). For now, run the web dev server locally (see below).
- **Foundry Hosted Agent** — Bicep is a stub. Full wiring deferred to M1.

### Running Web Locally Against Hybrid Agent

In a second terminal (while agent is running on 8080):

```bash
cd advisor-agent/web
VITE_ADVISOR_DEMO_MODE=true VITE_API_BASE_URL=http://localhost:8080 npm run dev
```

This starts Vite on `http://localhost:5173/` pointing to your local agent, which talks to Azure backends.

## Troubleshooting

### Port 8080 or 5173 already in use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::8080` or similar.

**Fix:** Either stop the process using the port, or override it:

```bash
# Backend on port 9000 instead of 8080
PORT=9000 ADVISOR_DEMO_MODE=true ADVISOR_LOCAL_DEV=true node dist/index.js

# Or find and kill the process
lsof -i :8080
kill -9 <PID>
```

### `npm install` fails

**Symptom:** `npm ERR!` with Node version or missing dependency errors.

**Checks:**

```bash
node --version    # Must be 20.x or later
npm --version     # Must be 10.x or later
git submodule update --init --recursive  # In case git submodules are out of sync
```

If Node is outdated, install the LTS version from [nodejs.org](https://nodejs.org).

### `/health` returns nothing or connection refused

**Symptom:** `curl http://localhost:8080/health` hangs or fails.

**Checks:**

1. Did the backend build succeed? Check Terminal 1 for errors from `npm run build`.
2. Did the `dist/` folder get created? Look for `agent/dist/index.js`.
3. Is the backend process still running in Terminal 1? (Check for the banner with "Listening on".)

If the build failed, it's likely a TypeScript error. The linter output will tell you what.

### `tsc --noEmit` complains about `rootDir` in `web/`

**Symptom:** TypeScript type-checking fails with a `rootDir` error in the web workspace.

**Known papercut:** The `web/tsconfig.json` has a conflict between Vite and TypeScript's `rootDir` setting. This is M1-owned by Lambert. **The `npm run dev` still works** — Vite dev-server bypasses strict type-checking. Linting will surface real errors; ignore the `tsc` complaint for now.

If you want to suppress it:

```bash
# This works fine
cd web && npm run dev

# This will complain (but web still runs)
tsc --noEmit
```

## What's Next

- **[docs/architecture.md](./architecture.md)** — System design, data flow, container diagrams
- **[docs/deployment.md](./deployment.md)** — How to deploy to Azure with `azd up` (M1+)
- **[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)** — Full roadmap through M0/M1/M2/M3
- **[product-spec.md](../product-spec.md)** — Complete PRD with acceptance criteria

---

**Questions?** Check `.squad/decisions/` for team decisions, or open an issue with the `[dev-loop]` label.
