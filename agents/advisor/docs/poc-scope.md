# POC Scope

**AI Framework Advisor Agent — Wave 1 Foundation**
_Last updated: 2026-05-29_

---

## What This POC Proves

The POC proves a single, falsifiable thesis: **a customer-facing advisor agent, following the Microsoft AI Decision Framework's Three-Phase Decision Methodology, can produce a grounded, explainable framework recommendation from a structured intake form — and that recommendation is good enough to be useful to a real customer.**

### Customer-facing demo scenario

A customer representative (e.g., Sarah Williams, Claims Operations Manager, NFU Mutual) completes a structured intake form describing their AI use case. The agent:

1. Receives the submitted intake as structured conversation context.
2. Loads active per-organization custom instructions from Cosmos DB.
3. Moves the customer through Phase 1 (BXT), Phase 2 (9 Critical Questions), and Phase 3 (Scenario Selection) — skipping questions already answered by intake or custom instructions.
4. Proposes answer options for missing evidence rather than firing blank open questions.
5. Checks Azure AI Search–backed similar projects before final recommendation.
6. Returns a structured recommendation: primary technologies, rationale, trade-offs, assumptions, custom-instruction influence, similar-project highlights, and follow-up questions.

### Recommendation quality bar

A recommendation **passes** the POC bar if:

- It identifies the correct Microsoft AI capability grouping(s) for the use case.
- The primary technology selection is defensible against the Three-Phase evidence.
- Trade-offs and assumptions are explicit (not buried in prose).
- Custom-instruction influence is stated ("Instruction X ruled out Y because…").
- Similar project highlights are present OR an honest "no match found" is returned.
- No claim is made that isn't traceable to intake, conversation, custom instructions, framework docs, or project search.

### Rationale quality bar

Rationale **passes** if:

- Each rationale entry cites specific evidence (intake answer ID, custom instruction ID, or framework phase).
- Uncertainty is flagged explicitly when evidence is missing.
- The recommendation does not hallucinate capabilities or avoid trade-offs.

---

## Non-Goals — Explicitly Out of POC Scope

The following are **not** part of this POC. If scope creep appears, reference this list.

| Non-goal | Why excluded |
|---|---|
| Production auth (SSO, MFA, refresh tokens) | Entra External ID is the chosen provider; implementation is a post-POC hardening item |
| Multi-tenant data isolation at scale | POC uses org-scoped partition keys; production sharding is a separate decision |
| Real-time streaming responses | Polling is sufficient for CLI and initial UI validation |
| Document ingestion pipeline | Seed data is loaded manually; production ingestion is a Switch/DevOps item |
| Audit logging at production grade | Correlation IDs and structured logs are in scope; SIEM integration is not |
| Claims-system write-back | The NFU Mutual use case explicitly excludes this for the POC |
| Mobile-optimized UI | Teams and web portal are primary channels; mobile is post-POC |
| SLA / uptime guarantees | POC is demo-grade; production reliability is post-POC |
| Cost optimization and scaling | Sizing for production load is post-POC |
| Custom model fine-tuning | Standard Azure OpenAI / Foundry endpoints are used; fine-tuning is post-POC |
| Feedback-driven prompt tuning loop | Manual prompt iteration is acceptable for POC; automated tuning is post-POC |
| Admin UI for production onboarding | Admin can edit Cosmos DB documents directly for the POC |

---

## Definition of Done (POC Exit Criteria)

The POC exits when:

1. CLI harness can submit `agents\backlog\sample-intake-form-nfum.json`, move through all three phases, and print a valid `RecommendationOutput` JSON.
2. The NFU Mutual regression scenario (Phase 1 + Phase 2 + Phase 3 + custom-instruction pre-answering + similar-project lookup) passes from the CLI.
3. A customer can submit an intake form through the web UI and receive a recommendation.
4. Cosmos DB stores conversation history with retention metadata.
5. Azure AI Search returns at least one similar-project match OR an honest "no match found".
6. Infrastructure provisions and deploys with `azd up`.
7. Public ingress is limited to the app/API tier; Cosmos DB and AI Search are private.
8. Open production decisions are documented, not hidden.
