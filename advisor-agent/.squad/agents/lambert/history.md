# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### M0 — Web App Scaffold (2026-05-26)

**Routing decisions**
React Router v6 with nested routes under `/admin/*`. `AdminLayout` renders a left-nav + `<Outlet>` so every admin page gets the nav for free. The index redirect at `/admin` → `/admin/org-context` avoids a blank admin landing page without duplicating content. Auth gates (`RequireAuth`, `RequireAdmin`) are layout components, not route wrappers, so they render their own feedback UI rather than silently redirecting.

**MSAL stub strategy**
`msal-config.ts` reads `VITE_ADVISOR_TENANT_ID` / `VITE_ADVISOR_CLIENT_ID` from env. If `VITE_ADVISOR_DEMO_MODE=true`, it stubs the config with a placeholder authority and exports `isDemoMode = true`. `RequireAuth` and `RequireAdmin` both check `isDemoMode` before inspecting token claims. This keeps the MSAL dependency fully present (not tree-shaken) so M1 auth wiring is a config change, not an architectural change. Real credentials are never in source.

**Shared-types coupling decision**
Dallas's `agent/src/data/models.ts` did not exist at scaffold time. Per the spec and IMPLEMENTATION_PLAN Data Model Summary, the full interface set was duplicated in `web/src/types/index.ts` with a TODO comment to unify via a shared package in M1. This is safer than a relative cross-workspace import that would break bundling and create circular workspace dependencies. The shapes match the IMPLEMENTATION_PLAN §Data Model Summary exactly — any divergence from Dallas's final file must be reconciled in M1.

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.

---

## SWA Deployment Infrastructure (2026-05-26)

### GitHub Actions SPA deploy workflow

Parker deployed `.github/workflows/deploy-web.yml` at 868bd67. SPA deploys are now automated on push to `feat-ai-decision-agent` or `main`.

**Deployment flow:**
- `ubuntu-latest` GitHub Actions runner (x86-64, bypasses ARM codespace blocker)
- Builds Vite inside `advisor-agent/web/`
- Deploys to Azure Static Web Apps via `Azure/static-web-apps-deploy@v1`
- Environment variables (build-time) sourced from GitHub variables: `VITE_API_BASE_URL`, `VITE_ADVISOR_CLIENT_ID`, `VITE_ADVISOR_TENANT_ID`, `VITE_AZURE_REDIRECT_URI`
- Deployment token (`AZURE_STATIC_WEB_APPS_API_TOKEN`) via GitHub secret

**SPA Live Endpoint:**
`https://polite-mushroom-0a09fa803.7.azurestaticapps.net`

**First run:** 26479487737 (1m08s, ✅ success)

**Implications for Lambert:**
- No local SWA CLI deploy needed (x86-only binary problem solved)
- Redirect URI for Entra is now `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` (matches app registration)
- Any push to `feat-ai-decision-agent` or `main` touching `advisor-agent/web/**` triggers auto-deploy
- PR preview environments auto-generated (free tier max 10)
- `VITE_API_BASE_URL` points to swedencentral Container App: `https://advisor-agent-app.wittysea-86254dbc.swedencentral.azurecontainerapps.io`

---

## M1 — MSAL Sign-in Wired (2026-05-26T22:52:00Z)

### MSAL v3 patterns

- **`@azure/msal-browser` 3.x** changed the `PublicClientApplication` constructor to `async`-first: `initialize()` must be called before use in pure JS, but `MsalProvider` handles this automatically when you pass the instance at construction time. No manual `await msalInstance.initialize()` needed when using `@azure/msal-react`.
- **`acquireTokenSilent`** requires an explicit `account` parameter in v3 (unlike v2 where it could be inferred). Always pass `accounts[0]` or the active account.
- **`InteractionRequiredAuthError`** is exported from `@azure/msal-browser` (not `@azure/msal-react`). Import it from the browser package. Use it as the fallback guard before `acquireTokenPopup`.

### Token caching

- `cacheLocation: 'sessionStorage'` is the safe default for internal tools. `localStorage` survives tab close and can be read by other tabs — unacceptable for Bearer tokens on admin endpoints.
- `storeAuthStateInCookie: false` prevents 3rd-party cookie issues in sandboxed envs (Codespaces, iframes).
- Apply `sessionStorage` to **both** real and demo configs for consistency — demo mode stubs the config but the browser still allocates the cache location.

### Redirect URI gotchas

- `window.location.origin` silently breaks when the app is served from a sub-path or when the Entra app registration has a specific URI registered. Always use the explicit `VITE_AZURE_REDIRECT_URI` env var so the value is deterministic in CI.
- Both `http://localhost:5173` and `https://polite-mushroom-0a09fa803.7.azurestaticapps.net` must be registered as redirect URIs in the Entra app — the SPA flow uses hash/PKCE and the Entra portal entry must be type "Single-page application" (not "Web").
- If you see `AADSTS50011` (redirect URI mismatch), the most common cause is `window.location.origin` resolving to a port or path not registered in the app registration.

### Popup vs redirect

- Popup (`loginPopup`) preserves SPA router state and avoids URL fragment collisions on redirect. Preferred for development and internal tools.
- Redirect (`loginRedirect`) is better for accessibility (screen readers) and for environments that block popups. Switch in `RequireAuth.tsx` is a one-liner.
- `logoutPopup` is preferred over `logoutRedirect` for the same reasons — it avoids blanking the page.

### SWA deploy

- The SWA GitHub Actions deploy workflow (`deploy-web.yml`) triggers on any push to `feat-ai-decision-agent` touching `advisor-agent/web/**`. No manual deploy step needed.
- Build-time env vars (`VITE_*`) are passed from GitHub Actions variables, not from `.env.local`. Always verify GitHub variable values match `.env.local` for local parity.

---

## M1 — Chat Render, Session List, Admin Wiring (2026-05-26)

### Chat UX patterns

**Turns-array model** over a single `ChatState` discriminated union: maintains full history across multiple submissions, makes re-submit ("Edit intake → re-analyse") natural without resetting the view. State is `turns: { role, text, timestamp }[]` + a separate `submitting: boolean` + `errorMsg: string | null`. Error turns are pushed as assistant turns with italic text so the conversation history is never wiped on failure.

**User turn format:** Build a concise markdown summary from the intake fields on submit. Bold project name on the first line, then `**Field:** value` pairs for non-empty fields. This gives the user immediate feedback that their submission was received and creates a readable record.

**Collapse/expand pattern:** After the first successful submit, collapse the intake panel and show an "Edit intake" toggle. `intakeCollapsed` state drives `session-intake--collapsed` class; the form is hidden via CSS (`display: none`) not unmounted, so form values persist. The toggle aria-expanded attribute signals state to screen readers.

**Auto-scroll:** `useRef<HTMLDivElement>` + `chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })` in a `useEffect([turns, submitting])`. This fires whenever turns or the submitting flag changes, keeping the latest content in view.

**Thinking state:** Animated three-dot bounce with CSS `@keyframes thinking-bounce` on a `<div>` that renders during `submitting`. No library needed — three `<span>` children with staggered `animation-delay` values.

### Hosted Agent Responses protocol — client handling

The response shape is:
```json
{
  "id": "resp_...",
  "object": "response",
  "created_at": <unix>,
  "status": "completed",
  "output": [
    { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "..." }] }
  ],
  "session": { "id": "...", "title": "..." }
}
```

Client extraction pattern (defensive, no throws):
```ts
const text = response?.output?.[0]?.content?.[0]?.text;
if (typeof text === 'string' && text.length > 0) return text;
return fallbackString;
```

Use optional chaining throughout. Type the response with `AdvisorResponse` interface that mirrors the expected shape — but wrap all extraction in a try/catch so a shape divergence produces a graceful fallback message, not a white screen.

Add `AdvisorResponse` and its sub-interfaces (`ResponseOutputItem`, `ResponseOutputContent`) to `web/src/types/index.ts` so the POST call is fully typed end-to-end.

### MSAL admin role gating

`RequireAdmin` uses `idTokenClaims.roles` (MSAL populates from the Entra app manifest `appRoles` claim). The check is `roles.includes('AdvisorAdmin')`. This is **not** a security check (happens client-side) — it is a UX gate only. Backend must enforce the role via JWT claim validation. `isDemoMode` bypasses the gate entirely for local development.

Admin layout (`AdminLayout.tsx`) wraps `RequireAdmin` around the `<Outlet>`, so all three admin pages inherit the gate automatically — no per-page boilerplate needed.

### react-markdown choice

`react-markdown` v9 (ESM, remark-based) is the correct choice for M1:
- Renders GitHub-flavoured markdown (headings, lists, bold, code blocks, blockquotes)
- Pure ESM — tree-shaken well by Vite
- Streaming-compatible for M2 (accept incremental `text` prop updates)
- No runtime config needed for basic use
- Version 9+ dropped CJS; pin to `^9.x` and set `"moduleResolution": "bundler"` in tsconfig if needed

### Type reconciliation discipline

Always re-read `agent/src/data/models.ts` before finalising SPA types. Key divergences found in M1:
- `Session.sessionId` (separate from `id`) — Cosmos DB pattern of mirroring the doc id
- `ReuseDecision` became `ReuseGateDecision` wrapping `ReuseDecisionKind`
- `ReadinessBrief.recommendedPlatform` became a `RecommendedPlatform` object (not a string)
- `Project.lessonsLearned` changed from `string[]` to `string?`
- `OrgContext.version` is `string` not `number`
- `SimilarProjectMatch.similarity` → `.score`; added `.technologies[]`

The SPA type file mirrors the agent types 1:1 — no SPA-only abstractions. When agent types change, update SPA types in the same commit if possible, or flag the delta explicitly in the decision file.

---

## 2026-05-27 — M1 Chat Render Shipped

**Team update:** Chat UI with markdown rendering and session list wiring landed. See decision #265 `lambert-m1-chat-render-and-session-list`. SPA builds successfully; API integration tests pending Dallas deployment. E2E Playwright tests deferred to M2.

---

## M2 — SSE Streaming, Admin Edit/Publish, Reviewer Queue (2026-05-27)

### Hand-rolled SSE with fetch + Authorization header

`EventSource` (browser native) cannot send custom headers — no `Authorization: Bearer` support. For protected routes this is a hard blocker. The solution: hand-roll SSE consumption using `fetch` with `Accept: text/event-stream` and the normal `Authorization` header from `getAccessToken()`. Pattern:

```ts
const response = await fetch(url, { method: 'POST', headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` }, signal });
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const chunks = buffer.split('\n\n');
  buffer = chunks.pop() ?? '';
  for (const chunk of chunks) {
    // parse event: + data: lines
  }
}
```

Key details:
- Split on `\n\n` (SSE event boundary); keep remainder in `buffer` for partial events
- Skip lines starting with `: ` (SSE comments / keepalive)
- `decoder.decode(value, { stream: true })` handles multi-byte characters split across chunks
- Call `reader.cancel()` in the `finally` block to release the underlying stream
- `getAccessToken()` is not exported — `streamResponses` lives in `client.ts` alongside all other API helpers to reuse the internal function

### AbortController for SSE cleanup

Every call to `streamResponses` receives a signal from an `AbortController` stored in a `useRef`. On component unmount or before a new submission:
```ts
abortRef.current?.abort();
const controller = new AbortController();
abortRef.current = controller;
```
The `useEffect` cleanup: `return () => { abortRef.current?.abort(); }`. This prevents state updates on unmounted components and avoids `AbortError` propagation (check `signal.aborted` before setting state in the catch block).

### Graceful SSE → JSON fallback

Check `response.headers.get('content-type')` before entering the stream loop:
```ts
if (!ct.includes('text/event-stream')) {
  const data = await response.json();
  yield { type: '__json_fallback__', data };
  return;
}
```
The caller handles `__json_fallback__` on the same code path as `turn.completed` / `response.done`. This makes frontend deploy order safe: ship the streaming UI before Dallas's backend upgrade with zero regression.

### react-markdown mid-stream

`react-markdown` rerenders cleanly on each `text.delta` append. No special handling needed — just pass the growing `streamingText` string as the `children` prop. A CSS blinking cursor (`::after` span with `animation: cursor-blink`) signals active streaming. The cursor disappears when `streamingText` is finalised and added to the `turns` array.

### Tool call chips

Tool calls are collapsible — show `🔧 calling searchSimilarProjects…` while in-flight, auto-collapse with a ✓ suffix on `tool.result`. State shape: `{ toolName, args, resultSummary, done, collapsed }[]`. On `response.done` the chips are attached to the completed `Turn` so they persist in the conversation history.

### OrgContextVersion versioning pattern

The version list is loaded once on mount, then mutated optimistically after save/publish. "Save as new draft" prepends the new version to the list (newest-first) and selects it. "Publish" re-fetches the full list to ensure published flags are correctly updated (only one version can be published at a time). `isDirty` comparison uses `JSON.stringify` on the reconstructed `OrgContext` to detect any change, including deep nested changes.

### ESLint no-unused-vars with TypeScript parser

When using `eslint:recommended` + `@typescript-eslint/parser` (without the `@typescript-eslint` ESLint plugin), the base `no-unused-vars` rule incorrectly flags TypeScript interface method parameter names. Workaround: use `React.Dispatch<T>` instead of `(param: T) => void` for void callback types — `Dispatch` is a type alias with no named parameters so ESLint doesn't flag it. Full fix requires adding `@typescript-eslint/eslint-plugin` and replacing `no-unused-vars` with `@typescript-eslint/no-unused-vars` — defer to M2.1 cleanup ticket.

---

## 2026-05-27 — M2 Wave Shipped

**Team update:** Three frontend features landed in one wave: SSE streaming with JSON fallback, org-context edit/publish UI, reviewer queue with stub action buttons. `npm run build` ✓ (593 kB), `npm run lint` ✓ (0 warnings). See decision `lambert-m2-streaming-admin-reviewer`.

