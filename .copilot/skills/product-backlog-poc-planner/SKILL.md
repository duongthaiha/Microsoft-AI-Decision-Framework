---
name: "product-backlog-poc-planner"
description: "Turn early product ideas into POC-ready engineering backlogs. Use this skill whenever the user mentions product backlog, POC backlog, MVP planning, idea to requirements, engineering stories, Azure POC, Bicep, azd deployment, private endpoint, or private database networking - even if they do not name this skill."
domain: "product-planning, azure-architecture, backlog"
confidence: "medium"
source: "manual"
license: MIT
---

# Product Backlog POC Planner

Use this skill to turn a fuzzy idea into a backlog an engineering team can actually build.

The mental model: **the backlog is the boarding pass, not the vacation brochure.** It must tell the team what to build, why it matters, what constraints shape the route, and what proof will count as arrival.

## When to Use

Use this skill when the user asks for any of these outcomes:

- Convert an idea into product requirements, user stories, epics, or a POC backlog.
- Prepare an engineering team to build a prototype, pilot, MVP, or proof of concept.
- Clarify requirements before architecture or implementation starts.
- Include Azure delivery requirements such as Bicep, Azure Developer CLI (`azd`), private endpoints, private database networking, managed identity, and Key Vault.

## Prerequisites

- No MCP server is required.
- If the output makes Azure-specific claims, verify the relevant service behavior against official Microsoft documentation before finalizing.
- If the target database or hosting service is unknown, do not assume one. Ask or mark it as an architecture decision.

## Workflow

### 1. Frame the Idea Before the Architecture

Start with the Decision Framework sequence:

1. **Outcome** - What business or user result should change?
2. **Behavior** - What will the user or agent do differently?
3. **Platform** - What technology is needed only after the first two are clear?

If the user only gives a technology request, pull them back to the problem. Do not let "we need an agent" become the requirement.

### 2. Ask the Smallest Useful Clarifying Set

If requirements are incomplete, ask 3-5 high-leverage questions before creating the backlog. Prioritize:

1. Target users and workflow.
2. Success criteria for the POC.
3. Data sources and sensitivity.
4. Required actions or integrations.
5. Deployment, security, networking, and compliance constraints.

Use the [Intake Question Bank](references/INTAKE_QUESTION_BANK.md) when the idea is especially vague.

### 3. Capture Non-Negotiable Engineering Guardrails

Unless the user explicitly changes these constraints, include them as backlog requirements:

- Infrastructure is authored in **Bicep**.
- Deployment is supported through **Azure Developer CLI (`azd`)** with `azure.yaml` and an `infra/` folder.
- Database access is private by design: private endpoint, private DNS, app-to-database private connectivity, and public network access disabled where the selected database service supports it.
- Secrets belong in Key Vault or managed platform configuration; do not put secrets in backlog examples, source code, or `azd` environment files.

Use [Azure POC Guardrails](references/AZURE_POC_GUARDRAILS.md) and [Private Networking Checklist](references/PRIVATE_NETWORKING_CHECKLIST.md) for detailed acceptance criteria.

### 4. Produce a Buildable Backlog

Structure the backlog as:

1. Product discovery and scope.
2. User experience and workflow.
3. Application/API implementation.
4. Data and integration.
5. Azure infrastructure and deployment.
6. Private networking and security.
7. Observability and validation.
8. POC demo by deploy to Azure and verify success criteria.
9. Documentation of architecture decisions, workflow diagrams, and operational runbooks.


Use the [Backlog Output Template](references/BACKLOG_OUTPUT_TEMPLATE.md). Every story should have clear acceptance criteria and a visible owner type: Product, Engineering, Architecture, Security, Data, or DevOps.

### 5. Separate Decisions from Work

If a requirement is unresolved, create a decision item instead of hiding the ambiguity inside a story. Examples:

- "Select database service for POC workload."
- "Confirm whether private connectivity must support local developer machines, CI runners, or only deployed Azure services."
- "Confirm whether public ingress is allowed for the app tier or only private access is allowed end-to-end."

### 6. Keep the POC Honest

POC does not mean toy. It means **thin slice with production-shaped bones**. Keep scope small, but include the security and deployment skeleton early so the team does not build a demo that cannot survive enterprise policy.

## Output Format

Default output:

1. **Assumptions** - Explicit assumptions used to create the backlog.
2. **Clarifying Questions** - Only if blockers remain.
3. **POC Goal** - One paragraph.
4. **Backlog** - Epics and stories with acceptance criteria.
5. **Architecture Decisions** - Open choices and recommended default.
6. **Azure Guardrails** - Bicep, `azd`, private endpoint, identity, secrets, and observability requirements.
7. **Definition of Done** - What proves the POC is complete.

If the user asks for a shorter answer, provide only the backlog table plus the open questions.

## Error Handling

| Situation | Likely Cause | Recovery |
|---|---|---|
| User provides only a product idea | Missing outcome, users, and success criteria | Ask the smallest useful clarifying set before writing stories |
| User demands stories immediately | Planning pressure | Produce a backlog with an **Assumptions** section and mark unresolved items as decision stories |
| Azure service is unspecified | Database or host not selected | Add an architecture decision and keep private networking acceptance criteria service-neutral |
| Public database access appears in the idea | Enterprise policy conflict | Add private endpoint, private DNS, app connectivity, and public access disablement stories |
| Requirements are too broad for a POC | Scope creep | Define a thin end-to-end slice and move nonessential work to "Deferred after POC" |

## References

| Reference | Use When |
|---|---|
| [Intake Question Bank](references/INTAKE_QUESTION_BANK.md) | Requirements are vague or the idea needs discovery |
| [Backlog Output Template](references/BACKLOG_OUTPUT_TEMPLATE.md) | Producing epics, stories, acceptance criteria, and DoD |
| [Azure POC Guardrails](references/AZURE_POC_GUARDRAILS.md) | Adding Bicep, `azd`, identity, deployment, and validation requirements |
| [Private Networking Checklist](references/PRIVATE_NETWORKING_CHECKLIST.md) | Adding private endpoint and database public access constraints |

## Post-Run Reflection

After completing a backlog, silently check whether the skill missed any repeatable pattern:

1. Did the user have to ask for a missing section?
2. Did an Azure networking or deployment constraint arrive late?
3. Were acceptance criteria too vague for engineering execution?
4. Did a new reusable question or checklist item emerge?

If yes, suggest a targeted update to this skill or one of its references.
