# Acme — Governance, Data & Action Safety

> **Fictional org notice.** Illustrative, anonymized governance posture for a
> regulated UK insurer. Realistic but invented; confirm with Acme's Responsible AI
> review board and compliance team before building.

This reference answers the framework's trust-boundary (Q5), orchestration (Q4),
scale/cost (Q6), action-safety (Q7), proactive/reactive (Q9), and Phase 3
operationalize-and-govern questions. As a regulated insurer, Acme treats these as
**hard constraints**.

## Data classification

| Tier | Examples | Default handling |
|---|---|---|
| **Restricted** | Customer PII, financial data, claims detail, health data (some products), advice records | Encrypt; UK-region only; private networking; least-privilege; no use in non-approved services; human oversight for any customer-facing use. |
| **Confidential** | Internal underwriting rules, pricing models, business strategy | Inside Acme trust boundary; role-based access; not for external models. |
| **Internal** | General operational docs, intranet content | Microsoft 365 boundary; standard access controls. |
| **Public** | Published marketing, public rates | No special handling. |

If a use case touches **Restricted** data, the default answers tighten:
human-in-the-loop, in-boundary only, and review-board sign-off.

## Data residency & boundary

- **UK data residency is mandatory.** No customer or regulated data may leave the
  UK or Acme's trust boundary.
- Valid **trust boundaries**: the **Azure UK landing zone**, the **Microsoft 365**
  service boundary, and managed **Power Platform** environments.
- **Cross-boundary** flows (e.g., into a third-party SaaS or a non-UK region) require
  explicit architecture-board and compliance approval.

## Responsible AI governance

- A **Responsible AI review board** gates AI changes that are customer-facing,
  advice-related, or that use Restricted data.
- **Model risk management** applies to models influencing customer or financial
  outcomes: documented purpose, evaluation, monitoring, and an accountable owner.
- **Explainability & audit:** customer-facing and advice decisions must be
  explainable and logged. "The model decided" is not acceptable to the FCA/PRA.
- **Preview/GA policy:** preview technology is allowed in **sandboxed, cost-capped
  pilots**; production use requires GA or a documented board exception.

## Action-safety policy (for Q7)

Default posture is **conservative**. Map every proposed action to a tier:

| Action tier | Examples | Acme rule |
|---|---|---|
| **Read-only** | Summarize, search, answer, draft for human review | Allowed by default. The safe starting point. |
| **User-approved write** | Update a CRM note, create a draft document, log a case | Allowed **with a human approving** before commit. |
| **Customer-facing / advice / money-moving** | Send customer comms, give financial advice, alter a policy/claim, move funds | **Human-in-the-loop mandatory** (Consumer Duty). Never fully autonomous. |
| **Privileged / destructive** | Bulk data changes, schema/system mutations, irreversible operations | Disallowed for agents; engineering change-control only. |

No agent performs autonomous destructive or money-moving actions. When a use case
implies one, recommend a human-approval gate and say so explicitly.

## Orchestration governance (for Q4)

- **Default to a single agent.** It is cheaper, more observable, and easier to
  govern.
- **Multi-agent orchestration** requires **platform-team and architecture-board
  approval** — justify why a single agent cannot meet the need before recommending
  an ensemble.

## Triggers & autonomy (for Q9)

- **User-initiated** interactions are the default.
- **Scheduled or event-triggered** automation requires: defined triggers, explicit
  approval/escalation points, ownership, and observability (Azure Monitor +
  Sentinel) before production.

## Scale & cost guardrails (for Q6)

- Azure consumption is **FinOps-governed**; workloads are tagged to a cost owner.
- **Pilots** start in a sandbox subscription with a **cost cap** and a defined exit
  criterion before any departmental or enterprise rollout.
- Prefer managed/SaaS consumption (Microsoft 365 Copilot, Copilot Studio) for
  predictable per-seat cost where it fits, before custom Azure consumption.

## Operationalize & govern (Phase 3 checklist)

For any recommendation, confirm:

- **Identity:** Microsoft Entra ID (SSO, conditional access, managed identities).
- **Logging & monitoring:** Azure Monitor + **Microsoft Sentinel**; audit trails for
  customer-facing and advice actions.
- **Data boundary:** UK-region, in-boundary, private networking for Restricted data.
- **Approval:** Responsible AI review board sign-off for customer-facing / advice /
  Restricted-data use.
- **Lifecycle:** evaluation plan, owner, and rollback path before production.
