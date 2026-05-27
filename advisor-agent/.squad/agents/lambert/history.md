# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Active Learnings (M2+)

### 2026-05-27 — M2 Wave Shipped: Streaming + Admin UI

**Key features landed:**
1. SSE streaming with JSON fallback for `/v1/responses`
2. Org-context edit/publish UI with version history
3. Reviewer queue with stub action buttons

**Chat streaming patterns:**
- Render streaming text with `react-markdown` using the `children` prop (accepts growing strings)
- CSS blinking cursor (no library) signals active streaming
- Tool calls are collapsible chips with `🔧` icon and sticky expansion state
- On `response.done`, attach chips to the completed Turn for persistence

**Org-context versioning:**
- Load version list once on mount, mutate optimistically after save/publish
- "Save as new draft" prepends new version (newest-first) and selects it
- "Publish" re-fetches full list (only one version can be published)
- `isDirty` uses `JSON.stringify` comparison on reconstructed object

**Build status:** `npm run build` ✅ (593 kB), `npm run lint` ✅ (0 warnings)  
**Decision:** `.squad/decisions.md` → `lambert-m2-streaming-admin-reviewer`

---

## 2026-05-27 — JWT Middleware Update (Cross-agent note)

**From Dallas:** JWT middleware now accepts **both v1 and v2 Entra token issuers**. If your work touches auth headers, request validation, or token passing, be aware that tokens arriving from the backend may have either issuer format. The middleware's dual-issuer validation is defensive (audience + issuer check) and carries no security trade-off. Do not re-introduce strict v2-only validation in future work. See decision `dallas-v2-token-fix`.

---

## 2026-05-27 — M2 Admin Backend Wave (Cross-agent coordination note)

**From Dallas:** M2 admin-backend-write API is now in active development. API contract (POST /admin/org-context/versions, version publish, GET /admin/org-context/versions) will land in `.squad/decisions/inbox/` shortly. M2.1 will add granular admin routes (entitlements, custom-instructions edit). Your M2 org-context UI is ready to integrate; do not implement EntitlementsPage / CustomInstructionsPage write actions until Dallas publishes the backend API contract.

---

## Historical Learnings Archive

See `.squad/agents/lambert/history-archive.md` for M0/M1 learnings and earlier context.

---

## 2026-05-27 — Composer Gating Bug Fix (session/new)

### Bug
Ha reported: on `/session/new`, "the text box is not editable and there is a message 'Advisor chat will appear here once the session is started'" + "no text box to chat with the agent."

### Root cause
Two separate issues:
1. **No chat composer existed in the right panel.** The only input mechanism was the structured intake form on the left. After that form collapsed (post-submission), there was zero way to send follow-up messages.
2. **`sessionId: id` passed "new" string to the backend** when the route was `/session/new` — incorrect; should be `undefined`.

### Fix
- Added a **freeform chat composer** (textarea + Send button) pinned to the bottom of the right panel. It is always rendered — no conditional gating behind `session.started` or `messages.length > 0`.
- Changed `.session-chat` CSS from `overflow-y: auto` to `display: flex; flex-direction: column` so the composer sticks to the bottom.
- Added `.chat-messages-scroll` wrapper (`flex: 1; overflow-y: auto`) for the turn list.
- Fixed `sessionId: id && id !== 'new' ? id : undefined` in both `handleSubmit` (intake form) and `handleChatSend` (freeform composer).
- Placeholder note updated to "…or type a message below to start chatting" — secondary hint, not a replacement for the composer.

### Pattern: "new session" empty state
**The rule:** The composer (textarea + send button) must ALWAYS render, regardless of whether a session ID exists or whether there are any turns. The empty-state placeholder is a secondary hint shown ABOVE the composer, not a gate that prevents interaction. Any conditional rendering of the composer should be limited to `submitting` state only (to prevent double-send).
