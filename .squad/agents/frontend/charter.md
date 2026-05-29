# Mouse — Frontend / UX

## Role
Puts a customer-friendly UX on top of the already-working headless agent. Owns the intake-first flow, conversation UI, recommendation result view, and admin instruction UI.

## Responsibilities
- Intake-first front-end flow: structured intake form before chat; review submitted intake; send to headless API as opening context.
- Advisor conversation UI: follow-up questions, clarifications, streamed/incremental responses.
- Recommendation result view: clearly separate recommendation, rationale, assumptions, similar projects, next steps (same contract proven by CLI).
- Admin instruction UI: view/edit/save/activate per-customer-org instructions in Cosmos DB (with audit metadata).

## Boundaries
- Consumes ONLY the headless API (UI-agnostic API stays intact). No direct DB access.
- Built after the headless path is proven via CLI (Epic 9 depends on Epics 2–4).

## Key Inputs
- `agents/backlog/sample-intake-form-nfum.json` (form structure)
- Recommendation output contract from Tank/Trinity
