# Acme — Organization Profile

> **Fictional org notice.** "Acme" is an anonymized, illustrative organization used
> for decision-framework demonstrations. The profile is realistic but invented.
> Validate any real decision against Acme's actual architecture board.

## Snapshot

Acme is the protagonist of every recommendation made with this skill. Picture a
**century-old, member-owned UK insurer** that grew up insuring farms and rural
businesses and has since become a full-line insurer and financial-services
provider — but never lost its "local agent who knows your name" culture. That
tension (personal service at national scale) shapes every technology choice.

| Attribute | Detail |
|---|---|
| Sector | General insurance + financial services (life, pensions, investments) |
| Ownership | **Member-owned** (policyholders are members; no external shareholders) |
| Heritage | Rural / agricultural and SME-commercial insurance |
| Lines of business | Farm & rural, commercial/SME, personal lines (home, motor), regulated financial advice |
| Scale | ~5,000 employees |
| Distribution | ~280 local agency offices across the UK + Channel Islands |
| Geography | United Kingdom (data and operations stay in the UK) |
| Service model | Face-to-face local agents + growing digital self-service |

## Customers

- **Farming and rural businesses** — the founding base; high-value, bespoke,
  relationship-led cover.
- **SME commercial** — trade-specific liability, property, commercial motor.
- **Personal lines** — home, motor, and related personal cover for members.
- **Advice clients** — regulated financial advice (pensions, investments) through
  Acme's adviser network.

Customers expect a **personal, trusted** experience. Anything customer-facing must
preserve that trust — which is why customer-facing AI is held to a high
human-oversight bar (see GOVERNANCE_DATA).

## Regulatory environment

Acme operates under heavy UK financial-services regulation. Treat these as
hard constraints, not preferences:

- **FCA** (Financial Conduct Authority) — conduct, fair treatment of customers.
- **PRA** (Prudential Regulation Authority) — prudential soundness.
- **Solvency II** — capital, risk, and data-governance obligations.
- **Consumer Duty** — must deliver good outcomes for retail customers; strongly
  constrains automated customer-facing decisions and advice.
- **UK GDPR / Data Protection Act 2018** — personal-data handling, lawful basis,
  data-subject rights.
- **Financial Ombudsman Service** — external complaint adjudication.

Implication for AI: customer-facing and advice-related automation needs
explainability, auditability, and human accountability. "The model decided" is not
a defensible answer to a regulator.

## Strategic priorities

1. **Digital without losing the personal touch** — self-service and automation that
   *augments* agents, not replaces the relationship.
2. **Microsoft-aligned modernization** — consolidate on Azure and Microsoft 365 to
   reduce sprawl (see SYSTEMS_INVENTORY).
3. **Data-driven decisions** — a Data Centre of Excellence on the Azure Data
   Platform underpins analytics and AI.
4. **Responsible, governed AI** — adoption gated by a Responsible AI review board.

## Risk appetite

- **Low** for anything touching customer money, advice, or personal data without
  human oversight.
- **Moderate** for internal-productivity and employee-facing AI.
- **Cautious-but-willing** on preview technology: pilots are welcome in sandboxed,
  cost-capped environments; production requires GA or an explicit board exception.

## AI posture (default stance)

- **Augment employees first** (agents, claims handlers, advisers) before automating
  customer-facing decisions.
- **Buy/adopt managed before building custom** — Microsoft 365 Copilot and Copilot
  Studio before bespoke Azure apps.
- **Human-in-the-loop** for any customer-facing, advice, or money-moving action.
- **Keep data in the UK** and inside Acme's trust boundary.

## Team & skills (ownership map)

| Group | Skills | Typically owns |
|---|---|---|
| Business-unit makers | Power Platform, Copilot Studio, low-code | Departmental productivity agents, simple automations |
| Central platform team | Azure engineering, full-stack, IaC, DevOps | Pro-code Azure solutions, shared platform, integrations |
| Data Centre of Excellence | Data engineering, ML/AI, analytics | Azure Data Platform, models, grounding/data products |
| Information security | Identity, SOC, Sentinel | Entra ID, security monitoring, compliance gates |

Match each recommendation to the team that will realistically own it: a maker-built
Copilot Studio agent and a pro-code Azure orchestration imply very different owners,
costs, and timelines.
