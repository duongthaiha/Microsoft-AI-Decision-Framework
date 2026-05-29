# Advisor Framework: Orchestration Log

## Wave 1-3 (Prior Work)

_Scribe logged Waves 1-3 orchestration. Reference prior logs for foundation details._

---

## Wave 4: Security Hardening, React SPA, Admin Guidance

_Date: 2026-05-29_  
_Sprint Focus: Transform POC from skeleton to user-ready application_

### Ghost (Security / Networking)

**Deliverables:**
- Security architecture documentation: `agents/advisor/docs/security/` (rbac-and-secrets.md, auth-flow.md, dev-access-patterns.md)
- Resolved all four Dozer open security items (SEC-01 through SEC-04)
- Applied Bicep fix: Search RBAC scoped from resource-group to specific searchService resource
- Mapped remaining production gaps (non-blocking) to backlog with risk and remediation guidance

**Test Coverage:** Security decisions validated against Azure Bicep build (exit 0)

**Known Limitations:** Auth currently uses static X-Api-Key for internal demos; Entra External ID deferred to next phase

---

### Mouse (Frontend / UX)

**Deliverables:**
- React SPA built with TypeScript + Vite (zero external CSS framework)
- Four-screen UI: intake wizard, conversation view, recommendation view, admin guidance editor
- New API endpoints: `/sessions/:id/feedback`, `/admin/guidance/*` (list, save, update, activate)
- Extended `IGuidanceStore` interface to support admin guidance operations in both in-memory and Cosmos adapters
- Vite dev server proxy configuration (ports 5173 frontend, 3000 API)
- Form data from embedded JSON (`intake-form.json`), not API-fetched

**Workspace Structure:**
```
agents/advisor/web/
├── src/pages/         # four-screen routing
├── src/components/    # form, chat, recommendation, admin UI
├── src/api/           # session + guidance API clients
├── src/hooks/         # shared state (useSession, useGuidance)
├── src/data/          # intake-form.json
└── src/styles/        # minimal custom CSS
```

**Backward Compatibility:** All existing API endpoints and tests remain unchanged; admin routes are additive

---

### Scribe (Orchestration / Logs)

**Deliverables:**
- Wave 1-3 orchestration log entries summarized
- Agent history rollup and health check setup
- Staged .squad/ metadata files for Wave 1-4 consolidation

---

## Wave 5: Epic 8 Handoff Documentation

_Date: 2026-05-29_  
_Sprint Focus: Document POC completion, hand off to production team_

### Trinity (Lead / Architect)

**Deliverables:**

**Handoff Documentation** (under `agents/advisor/docs/handoff/`):
- `demo-script.md` — Step-by-step demo walkthrough with timings, expected outputs, and fallback paths for no-match and pro-code Q8 branching
- `architecture-handoff.md` — POC reality vs. production target model; component roles; data flow; known limitations (D1, G1) called out explicitly
- `next-phase-backlog.md` — 12+ items prioritized by business value and risk; includes auth, APIM, automated secrets rotation, NSG hardening
- `known-limitations.md` — D1 (in-memory search scoring floor ~0.516) and G1 (Q8 branching not implemented in mock agent) documented as limitations, not bugs

**Definition of Done Verification:**
- ✓ 6 workspaces build clean (shared/data/api/cli/web/eval)
- ✓ 53 API tests passing
- ✓ 20 eval tests passing
- ✓ 32 CLI regression assertions passing
- ✓ All source and infrastructure stable (Wave 5 docs-only, no code changes)
- ✓ No Azure deployment run (offline environment)

**POC Handoff Model:**
- Wave 5 separates POC reality (what is implemented) from production target (what will be)
- Prevents demo claims from becoming production promises
- D1 and G1 limitations are honest artifacts of the POC scope, not hidden bugs
- Production team has clear prioritized backlog for next phase

---

## Final Verified State (End of Wave 5)

**All 6 Workspaces:** ✓ Build clean  
**API:** 53 tests pass  
**Eval:** 20 tests pass  
**CLI:** 32 regression assertions pass  

**Code Freeze:** Wave 5 produced documentation only. Source code and infrastructure changes ended in Wave 4.

**Security Posture:** Four Dozer items resolved; remaining gaps mapped to production backlog with risk levels and remediation paths.

**Frontend:** React SPA with four screens, admin guidance editor, feedback ingestion. Ready for Entra External ID auth wiring in next phase.

**Architecture:** POC is self-contained, testable, and documented for handoff. Production team has clear constraints, known limitations, and prioritized work queue.

---

_Log Maintained By: Scribe_  
_Last Updated: 2026-05-29_
