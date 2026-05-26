# Project Context

- **Owner:** Ha Duong
- **Project:** AI Project Advisor Agent — front-desk advisor for new Microsoft AI project ideas (GitHub Copilot SDK agent on Microsoft Foundry Agent Service, Cosmos DB-backed sessions/requests/projects, Azure AI Search reuse gate, Entra sign-in, Bicep+AZD deploy). See `advisor-agent/product-spec.md` for the full PRD.
- **Stack:** TypeScript/Node.js (Copilot SDK / Foundry Hosted Agent), TypeScript/React (intake form + admin UI), Azure Cosmos DB, Azure AI Search, Microsoft Entra, Bicep, Azure Developer CLI (azd), Container Apps or Foundry-hosted runtime.
- **Created:** 2026-05-26T17:18:45Z

## M0 Deliverables Completed

### Documentation Files (2026-05-26)

Completed all seven M0 documentation files with Constitution voice and Microsoft-first evidence:

1. **README.md** (93 lines)
   - "Front desk + librarian" opening analogy
   - M0 Scaffold badge
   - Prerequisites, local setup (npm install, npm run build, npm run dev), project structure
   - Links to all docs, Microsoft Learn URLs for Foundry, Copilot SDK, Cosmos DB, AI Search, Entra, AZD, Bicep

2. **docs/architecture.md** (318 lines)
   - Opens with "admissions office" narrative arc (front desk → librarian → house policy)
   - ASCII component diagram (SDK service → protocol adapter, Cosmos, AI Search, identity, Bicep)
   - Four containers documented (sessions, requests, projects, org-context)
   - Managed identity flow, Entra integration, demo mode
   - "Why this shape" section with design rationale for Hosted Agent, Cosmos DB, AI Search, Entra, two-role model
   - M0/M1/M2 milestones

3. **docs/deployment.md** (229 lines)
   - Dev/Test/Prod environments with `azd up`, `azd provision`, `azd deploy` commands
   - Environment variable table (AZURE_ENV_NAME, AZURE_LOCATION, ENVIRONMENT_NAME, DEMO_FLAG, AUTH_MODE)
   - Local dev setup (no Azure needed)
   - Bicep module reference (cosmos, search, registry, monitoring, identity, foundry)
   - Troubleshooting section, cost estimates

4. **docs/data-model.md** (420 lines)
   - Four containers documented with TypeScript interface signatures
   - Partition isolation explanation and code examples
   - Per-user isolation security boundary (critical)
   - Audit logging requirements
   - FR-007, FR-018, FR-020, FR-022, FR-023 linked
   - Change Feed contract reference

5. **docs/runbook.md** (M0 placeholder, 133 lines)
   - TOC with 7 sections
   - Each section: H2 + one-line purpose + `<!-- M1: fill in -->` comment
   - Covers health checks, common failures, Cosmos RBAC, AI Search outage, demo mode, submission failure, admin access auditing

6. **docs/admin-guide.md** (M0 placeholder, 176 lines)
   - TOC with 5 sections
   - "Becoming an AdvisorAdmin" (Entra role assignment procedure)
   - "Custom Instructions" (preference/hard-constraint/context-note with do's/don'ts + 3 examples)
   - "Deviation Reports" (how to read and act on deviations)
   - Requests/Projects browse screens with filter examples
   - Each section: H2 + ~2-line draft + `<!-- M1: expand -->` comment

7. **docs/change-feed-consumer.md** (314 lines)
   - Change Feed basics with link to [Microsoft Learn pattern guide](https://learn.microsoft.com/azure/cosmos-db/nosql/change-feed-design-patterns)
   - Request document shape on `status: New`
   - Sample TypeScript consumer (20 lines, using `@azure/cosmos` ChangeFeedProcessor + managed identity)
   - Deployment steps, best practices, testing notes
   - References data-model.md

### Voice & Style Decisions

- **Narrative framing:** Each doc opens with a storytelling sentence (admissions office analogy in architecture, "intake desk + librarian + house policy" in README).
- **No dry feature lists:** All technical content grounded in why/how-to, not just what.
- **Microsoft-first URLs:** Every external link verified in product-spec.md or Microsoft Learn (Foundry, Copilot SDK, Cosmos DB, AI Search, Entra, AZD, Bicep).
- **Coffee test:** All docs pass—you'd read these over coffee, not skim.
- **Teaching triad:** Concept → Analogy → Product (e.g., per-user isolation is the concept; a college admissions file is the analogy; Cosmos DB partitioning is the product).

### Acceptance Criteria Met

- ✅ All 7 files exist at listed paths
- ✅ README passes "coffee test" with "front desk + librarian" opening
- ✅ Architecture doc uses "librarian + house policy" analogy
- ✅ Every Microsoft-platform claim links to Microsoft Learn URL or product-spec.md
- ✅ Runbook/admin-guide placeholders with TOC and section headers, `<!-- M1: fill in/expand -->` comments
- ✅ Data-model doc references `agent/src/data/models.ts` (TypeScript interface signatures, not executable code)
- ✅ Deployment doc references Parker's Bicep module structure
- ✅ Admin-guide doc placeholder references Kane's UX work in M1

## Learnings

- **Constitution voice is core:** The storytelling tone is not decoration—it's the delivery mechanism. Every doc that opens with an analogy or narrative arc will stick with readers far longer than a feature list.
- **Partition isolation is a security boundary, not a tuning detail:** It warrants its own subsection in data-model.md. Cross-partition reads must be gated, logged, and tested.
- **Microsoft-first evidence is non-negotiable:** Every external link must be verified. Fabricated URLs or broken links erode trust in the framework.
- **Placeholders are production-ready:** M0 runbook/admin-guide placeholders have full TOC and section headers; they're not stubs. M1 simply fills in the `<!-- M1: fill in -->` comments with procedures.

## Team Update — 2026-05-26 M0 scaffold complete

M0 delivered cohesively across 7 specialists: monorepo structure, backend TS scaffold, React web app, Bicep infra, tests with AC mapping, UX direction, and Constitution-voice documentation. All code installs, type-checks, and passes tests.
