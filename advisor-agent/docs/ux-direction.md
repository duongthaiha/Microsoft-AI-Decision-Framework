# UX Direction: AI Project Advisor Agent

## Opening Principle

The advisor is a conversation, not a wizard. Think of it like calling a trusted architect to vet your idea before you build: you don't fill out a thirty-page form first. You say "here's what we're trying to do," and the architect asks follow-up questions to sharpen the picture.

## Intake Form Field Groups

**Identity:** Project name, owner (auto-filled from Entra), session title.

**Outcome:** Business outcome, target users, desired user behavior, success metric.

**Data:** Existing data sources, current tools in use, data constraints.

**Action Shape:** What actions the solution must enable, urgency (days/weeks/months), decision timeline.

**Constraints:** Governance boundaries (data residency, regulatory), internal skills inventory, build style preference (low-code/pro-code).

## Page Hierarchy

```
/ Home
  ├── Session list (user's drafts and submitted requests)
  └── "Start new session" button

/session/:id
  ├── Left: Intake form (collapsible, partial answers OK, auto-saved)
  └── Right: Advisor chat (turns, clarifications, readiness brief preview)

/brief/:id
  └── Readiness brief (recommendation, rationale, similar projects, org alignment, risks, next actions)

/admin/*
  ├── Org Context (System Inventory | Entitlements | Custom Instructions, read-only browse)
  ├── Requests (table, filterable by status/owner/project, read-only, no inline edit)
  └── Projects (table, drill-in to linked requests, read-only)
```

## Key UX Principle

The advisor is a conversation, not a wizard. The form starts the conversation; the chat continues it. This shapes everything: fields are optional on first visit (partial intake is fine), the advisor asks clarification questions in chat, and the user can edit the intake at any time without losing context. No blocking, no mandatory fields, no "go back and fix section 2" friction.

## Readiness Brief: Constitution Voice

Each section leads with a story sentence, then substance:

1. **Recommendation** — "We recommend Microsoft Foundry with the Agent Service runtime." Rationale, complexity (1–5 scale), timeline.
2. **Why This Fits** — Scoring table: Phase 2 questions vs. selected platform, confidence per question.
3. **Similar Projects** — Link to existing projects on the shelf; show outcomes, tech stack, current owner, status.
4. **Org Alignment** — One row per custom instruction: followed / partially-followed / not-followed, reason.
5. **Risks & Next Actions** — Blockers the team owns (skills, licensing, governance), handoff checklist.

## Admin Surfaces: Read-Only Design

**Org Context** (three tabs):
- System Inventory: Microsoft + non-Microsoft systems, categories, authorities.
- Entitlements: Per-product status (available / restricted / unavailable), regions, notes.
- Custom Instructions: ID, text, kind (preference / hard constraint), scope (phase-2 / phase-3 / both).

**Requests & Projects:** Browse tables, not chat. Filters for status, owner, tech. Drill-in to detail view. No edit affordances. Audit-log every read.

## Accessibility: WCAG 2.1 AA

Keyboard navigation everywhere; focus visible (outline, not color alone). Form `<label>` + `<input>` binding. Error messages linked to inputs via `aria-describedby`. Color contrast ≥ 4.5:1 for body text; no information by color alone.

## Color & Typography

Dark theme (repo convention). Body font: system sans-serif stack (no custom fonts in M0). Use semantic colors: success (green), warning (amber), danger (red). No decorative gradients.

## Deferred to M1

Icon set, illustration library, brief layout polish, micro-interactions, animation, notification toast placement, mobile breakpoint tuning, data export/reporting UX.
