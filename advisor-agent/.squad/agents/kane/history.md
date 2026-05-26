# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** Python (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## Learnings

### M0 UX Direction (2026-05-26)

**Principle locked in:** The advisor is a conversation, not a wizard. The form starts the conversation; the chat continues it. This shapes intake design: fields are optional on first visit, the advisor asks clarification questions in chat, and users can edit the intake at any time without losing context.

**Constraints discovered:**
- Intake form must not block submission with required fields (conversation-first model)
- Admin surfaces must be read-only by design (no inline edits to prevent race conditions with active sessions)
- Org Context publish model requires versioning: recommendations carry the version they were generated with
- Dark theme + system sans-serif font is the M0 baseline; no custom fonts or decorative gradients
- WCAG 2.1 AA accessibility must be in place at M0 (keyboard nav, visible focus, form labels, color contrast ≥4.5:1)
- Brief presentation must lead with recommendation (Constitution voice: outcomes → behaviors → platforms)

**Reference:** `docs/ux-direction.md`

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.
