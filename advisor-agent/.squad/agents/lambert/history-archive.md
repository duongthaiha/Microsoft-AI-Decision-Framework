# Lambert History Archive

**Archived:** 2026-05-27T07:25:00Z  
**From:** `.squad/agents/lambert/history.md` (16,327 bytes → trimmed)

## Archive Summary

**Covered work:**
- M0 scaffold (2026-05-26): React Router nested routes, MSAL stub strategy, shared-types coupling
- SWA Deployment (2026-05-26): GitHub Actions deploy workflow, live SPA endpoint
- M1 MSAL Sign-in (2026-05-26): MSAL v3 patterns, token caching, redirect URI gotchas
- M1 Chat Render (2026-05-26): Turns-array model, Hosted Agent Responses protocol, role gating, react-markdown choice
- M1 Admin Pages (2026-05-26): Form rendering, OrgContextVersion versioning, ESLint workaround
- M2 Wave (2026-05-27): SSE streaming with JSON fallback, org-context edit/publish UI, reviewer queue

**Key technical decisions:**
- MSAL v3 with sessionStorage caching
- react-markdown v9 for GitHub-flavoured markdown
- Turns-array model for conversation history
- RequireAdmin role gating (UX gate only; backend enforces via JWT)

All work documented in `.squad/decisions.md` and accessible via decision cross-references.
