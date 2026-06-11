---
name: org-context
description: Load Acme's enterprise-architecture context (existing systems, approved platforms, data and trust boundaries, governance, team skills, and cost guardrails) whenever you make a Microsoft AI technology recommendation for Acme. Use this skill alongside microsoft-ai-decision-framework so a non-technical business user only has to describe the business outcome - this skill auto-answers the architecture-heavy questions (data grounding, trust boundary, action safety, orchestration, team skills, integration) from Acme's standing standards instead of asking the user.
---

# Acme Organizational Context

This skill is the **local map**. The `microsoft-ai-decision-framework` skill is the
**navigator**. The navigator knows *how* to choose; this skill knows *where Acme
already stands* — its systems, standards, boundaries, and constraints.

The mental model: **the business user brings the destination; Acme's architecture
is the terrain.** A business user can say "I want to cut claims triage time." They
cannot say "use a private endpoint into the UK South landing zone with
human-in-the-loop on customer-facing actions." That second sentence is Acme's
terrain, and it lives here.

> **Fictional org notice.** "Acme" is an anonymized, illustrative organization. Its
> profile is realistic but invented for decision-framework demonstrations. Verify
> any real claim against Acme's actual architecture board before building.

## When to Use

Use this skill **together with** `microsoft-ai-decision-framework` whenever the
request is about building or choosing AI for **Acme**. Trigger it when:

1. A business user (non-technical) submits a use case and expects a recommendation.
2. The framework reaches an architecture-heavy question the user cannot answer.
3. A recommendation must respect Acme's existing systems, approved platforms,
   regulatory posture, or internal constraints.

If the request is generic (not for Acme), ignore this skill and let the framework
ask its normal questions.

## Who Acme Is (one-paragraph orientation)

Acme is a **UK, member-owned insurer and financial-services provider** — general
insurance with deep rural/agricultural and SME-commercial roots, plus personal
lines and regulated financial advice. It is **FCA- and PRA-regulated** (Solvency
II, Consumer Duty, UK GDPR). It runs a **Microsoft-aligned estate** on Azure, with
**Guidewire** as the core insurance platform. Full detail lives in the references.

| Reference | Use it for |
|---|---|
| [ORG_PROFILE.md](references/ORG_PROFILE.md) | Who Acme is: sector, scale, customers, regulators, strategy, risk appetite, AI posture. |
| [SYSTEMS_INVENTORY.md](references/SYSTEMS_INVENTORY.md) | The existing estate: approved platforms, systems to integrate, identity, networking, build-style split. |
| [GOVERNANCE_DATA.md](references/GOVERNANCE_DATA.md) | Data classification, residency, Responsible AI governance, action-safety policy, cost guardrails, approvals. |

## Business-User Intake Mode

When a non-technical business user submits a use case, run the framework's
**Gate → BXT → Nine Questions → Phase 3** as normal, but change *who answers*:

1. **The user answers business-level questions only.** What outcome should change?
   For whom? How valuable is it? Where do people do this work today? These are the
   Gate's Outcome/UX questions and the BXT *Viability* and *Desirability* lenses.
2. **You answer the architecture-heavy questions from this skill — do not ask the
   user.** Pull the standing answer from the references (see the mapping table
   below). These are framework BXT *Feasibility*, and Nine-Question items Q2, Q3,
   Q4, Q5, Q7, Q8, plus Phase 3 *Integration* and *Operationalize & govern*.
3. **Label every org-derived answer.** Prefix it so the user and a reviewing
   architect can see its source: *"Per Acme standard: ..."*. Never present an
   org-derived assumption as something the user said.
4. **Flag genuine gaps, do not invent.** If this skill does not cover a needed
   constraint, mark it explicitly as an open item for architect review rather than
   guessing. State the assumption you are proceeding with and why.
5. **Translate, do not interrogate.** If you must ask the user something
   architecture-adjacent, translate it into business language (e.g., ask "should a
   person check the answer before a customer sees it?" instead of "read-only,
   user-approved, or autonomous action safety?").

## EA Question → Acme Standing Answer

Use this table to auto-answer the architecture-heavy framework questions. Confirm
specifics against the cited reference before relying on them.

| Framework question | Acme standing answer | Source |
|---|---|---|
| **Gate – simplest tech** | Prefer Microsoft-managed first: Microsoft 365 Copilot and Copilot Studio before custom Azure builds. | SYSTEMS_INVENTORY |
| **BXT – Feasibility** | Customer/claims/financial data is governed under UK GDPR & Solvency II; primary data is reachable via the Azure Data Platform and Guidewire. Skills exist (see Q8). | GOVERNANCE_DATA, SYSTEMS_INVENTORY |
| **Q2 – Build style / control** | Low-code **Power Platform / Copilot Studio** for business-unit makers; **pro-code Azure** for the central platform team. Match to the owning team. | SYSTEMS_INVENTORY |
| **Q3 – Data grounding** | Unstructured: Microsoft 365 / SharePoint via Graph (and Microsoft 365 Copilot). Structured: **Guidewire** + **Azure Data Platform**. Custom grounding: **Azure AI Search**. | SYSTEMS_INVENTORY |
| **Q4 – Orchestration (The Coin)** | Default to a **single agent**. Multi-agent orchestration requires platform-team and architecture-board approval. | GOVERNANCE_DATA |
| **Q5 – Compliance & trust boundary** | Stay inside the **Azure UK landing zone**, the **Microsoft 365** boundary, or a managed **Power Platform** environment. Cross-boundary or non-UK egress requires review. | GOVERNANCE_DATA, SYSTEMS_INVENTORY |
| **Q6 – Scale & cost** | Consumption is FinOps-governed; pilots start in a sandbox subscription with a cost cap before departmental rollout. | GOVERNANCE_DATA |
| **Q7 – Action safety** | **Read-only by default.** Any customer-facing, financial-advice, or policy/claims-mutating action requires **human-in-the-loop** approval (Consumer Duty). No autonomous destructive actions. | GOVERNANCE_DATA |
| **Q8 – Team skills & ownership** | Business-unit **makers** (Power Platform), **Azure full-stack engineers** (platform team), and **data/AI specialists** (Data Centre of Excellence). | ORG_PROFILE, SYSTEMS_INVENTORY |
| **Q9 – Proactive vs. reactive** | User-initiated by default; scheduled/triggered automation needs defined triggers, approval points, and observability. | GOVERNANCE_DATA |
| **Phase 3 – Integration** | Must coexist with **Dynamics 365**, **Guidewire**, and **Microsoft 365**; identity is **Microsoft Entra ID** (SSO, conditional access). | SYSTEMS_INVENTORY |
| **Phase 3 – Operationalize & govern** | Identity via Entra ID; logging/monitoring via Azure Monitor + **Microsoft Sentinel**; AI changes pass the Responsible AI review board. | GOVERNANCE_DATA |

## Output Additions

Keep the framework's Phase 3 decision memo, and **append an "Architect Review"
section**:

```markdown
## Architect Review (Acme)

**Org-derived assumptions used**
- [Per Acme standard: ... — source reference]

**Open items / gaps for architect confirmation**
- [Constraint this skill did not cover, and the assumption taken in the meantime]

**Standards honored**
- Data boundary:
- Action safety / human-in-the-loop:
- Approved platform fit:
- Integration points touched:
```

## Error Handling

| Situation | Recovery |
|---|---|
| User asked an architecture question they cannot answer | Auto-answer from the mapping table; label it "Per Acme standard"; do not push it back to the user. |
| Needed constraint not in this skill | Flag as an open item in Architect Review; state the assumption taken; continue. |
| Recommendation would cross Acme's trust boundary or egress UK data | Call it out as a blocker in Risks; propose an in-boundary alternative. |
| Action would mutate customer/financial data without approval | Require human-in-the-loop; never recommend autonomous mutation. |
| User asks for a non-approved platform | Note Acme's approved-platform preference and offer the nearest sanctioned option before any exception path. |

## Post-Run Reflection

After a recommendation, silently check:

1. Did I ask the user an architecture question this skill already answers?
2. Did I leave an org-derived assumption unlabeled?
3. Did I invent a constraint instead of flagging a gap?
4. Did the recommendation respect Acme's data boundary, action-safety, and approved
   platforms?
5. Did I append the Architect Review section?

If any answer is wrong, correct the output (and suggest a targeted update to this
skill's references if a standing answer is missing).
