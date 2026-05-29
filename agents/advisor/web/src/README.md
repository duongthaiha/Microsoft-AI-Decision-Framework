# Web workspace placeholder

Mouse (Frontend) owns this workspace.

The front end sits on top of the already-working headless API (`@advisor/api`).
UI must consume only the API — no direct Cosmos DB or AI Search calls from
the browser.

## Planned structure (Mouse to implement)

- `src/` — React or Next.js application
- Intake-first flow: structured form → review → agent conversation
- Advisor conversation view with streamed responses
- Recommendation result view (separated: recommendation / rationale / similar projects / next steps)
- Admin instruction UI (view, edit, activate per-org custom instructions)

All data shapes are already defined in `@advisor/shared`.
