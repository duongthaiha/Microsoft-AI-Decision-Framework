---
name: microsoft-ai-decision-framework
description: Guide Microsoft AI technology selection with the Microsoft AI Decision Framework. Use this skill whenever the user asks how to choose between Microsoft 365 Copilot, Copilot Studio, Microsoft Foundry, Agent Service, M365 Agents SDK, Agent Framework, Azure AI services, or whether they need an agent at all - even if they only mention "build an AI app", "create an agent", "which Copilot", "Foundry vs Copilot Studio", governance, architecture, or Microsoft AI roadmap.
---

# Microsoft AI Decision Framework

Use this skill to make a Copilot SDK agent behave like a disciplined Microsoft AI architect, not a product picker.

The mental model: **the framework is a flight plan, not a shopping cart.** Start with the destination, check the weather, then choose the aircraft. In the bundled framework language: **Outcomes -> Behaviors -> Platforms**.

## When to Use

Use this skill when the user asks for any of these outcomes:

1. Choose a Microsoft AI technology, platform, agent type, or implementation pattern.
2. Compare Microsoft 365 Copilot, Copilot Studio, Foundry, Agent Service, M365 Agents SDK, Agent Framework, Azure OpenAI, AI Search, or specialized copilots.
3. Decide whether a request needs an agent, a workflow, RAG, an embedded app, an end-user copilot, or no AI at all.
4. Turn business requirements into a technology recommendation, architecture shortlist, decision memo, or implementation direction.
5. Assess governance, complexity, skills, cost, scale, action safety, or production readiness for Microsoft AI adoption.

Do **not** use this skill for generic Copilot SDK programming questions unless the task also involves Microsoft AI technology selection or framework-guided architecture.

## Prerequisites

- No MCP server is required.
- The bundled constitution applies: use the Teaching Triad, avoid product supremacy, and say what a technology cannot do.
- Product capabilities, lifecycle status, pricing, limits, and availability must be verified against official Microsoft documentation before making current technical claims.
- Treat this skill as the navigator. Treat the bundled references as the map.

## Copilot SDK Loading Pattern

Load this skill from a Copilot SDK app by pointing `skillDirectories` at the skill folder:

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
const session = await client.createSession({
  model: "gpt-5.5",
  skillDirectories: [".agents/skills/microsoft-ai-decision-framework"],
});

const response = await session.sendAndWait({
  prompt: "Which Microsoft AI platform should we use for a governed claims assistant?",
});
```

For another CLI or repository, copy the entire `microsoft-ai-decision-framework` folder, including `SKILL.md` and `references/`. Do not copy only `SKILL.md`; the skill is intentionally portable because the decision-making references are bundled locally.

If the app already loads the SDK skill, include both directories:

```typescript
skillDirectories: [
  ".agents/skills/copilot-sdk",
  ".agents/skills/microsoft-ai-decision-framework",
]
```

## Workflow

### 1. Stop Shiny Object Syndrome First

If the prompt begins with a product request, pull it back to the problem. Do not accept "we need an agent" as a requirement.

Capture:

1. **Outcome** - What business or user result should change?
2. **User experience** - Where does the work happen: Microsoft 365, Teams, custom app, workflow, API, or background process?
3. **Smallest useful technology** - Can an existing Microsoft 365 Copilot, built-in agent, connector, search surface, automation, or deterministic app solve it?

If these are missing and the user expects a final answer, proceed with explicit assumptions rather than inventing requirements.

### 2. Decide Whether an Agent Is Needed

Use the "agent checkpoint" before architecture:

| Signal | Interpretation |
|---|---|
| Static Q&A, deterministic CRUD, report generation, or simple routing | Usually not an agent. Prefer search, workflow, app logic, or RAG. |
| Conversational guidance with grounded knowledge | Consider Microsoft 365 Copilot extensibility, Copilot Studio, or Foundry depending on channel and control. |
| Multi-step planning, tool use, memory, or action selection | Agent pattern may fit, but gate actions and evaluate risk. |
| Autonomous background execution | Require explicit triggers, approval boundaries, observability, and ownership. |

### 3. Apply the Capability Model

Map the request across the framework's five capability groupings:

1. **End-user copilots** - use when Microsoft-managed experiences already meet the need.
2. **Extensibility into existing copilots** - use when the user wants to enrich Microsoft 365 Copilot with knowledge, actions, or declarative behavior.
3. **Build AI apps and agents** - use when the organization needs a custom experience or orchestration layer.
4. **AI services and building blocks** - use when the solution needs models, search, document intelligence, data, integration, or infrastructure primitives.
5. **Specialized agents** - use when the workload belongs to a domain copilot such as developer, security, business app, or data experiences.

The order matters: do not recommend a custom build before checking whether a managed or extensibility path solves the problem.

### 4. Run the Decision Framework

Use the framework sequence:

1. **Intake Filter** - outcome, UX, simplest tech.
2. **BXT lens** - business viability, user desirability, technical feasibility.
3. **Nine questions** - interaction pattern, build style, data strategy, orchestration complexity, governance, scale/cost, action safety, team skills, proactive vs. reactive behavior.
4. **Technology selection** - choose based on urgency, skills, cost, and control.

Use [Framework Routing](references/FRAMEWORK_ROUTING.md) to decide which canonical document to consult.

### 5. Evaluate Production Shape

Before recommending, score the trade space:

| Dimension | Ask |
|---|---|
| Complexity | Is this a furnished condo, a remodel, or a skyscraper? |
| Skills | Makers, full-stack developers, Azure engineers, data/AI specialists, or a mixed team? |
| Time | Days, weeks, or months? |
| Budget | License-led, managed SaaS, Azure consumption, or custom operations? |
| Governance | Microsoft 365 boundary, Power Platform governance, Azure landing zone, or cross-boundary controls? |
| Action safety | Read-only, user-approved actions, privileged actions, or autonomous changes? |
| Scale | Pilot, departmental, enterprise, high-volume API, or regulated production workload? |

### 6. Recommend as a Cast, Not a Contest

Frame technologies as roles:

- **Front door** - where users interact.
- **Orchestrator** - who plans, routes, and manages state.
- **Engine** - which model or agent service reasons.
- **Grounding layer** - where knowledge comes from.
- **Action layer** - which tools mutate systems.
- **Governance layer** - where identity, policy, logging, and lifecycle live.

Avoid "X is better than Y." Prefer "X plays this role when the constraints look like this; Y plays a different role."

## Output Format

Default output for a recommendation:

1. **Decision** - one sentence naming the recommended path.
2. **Why this fits** - outcome, UX, data, skills, governance, and time-to-value.
3. **Architecture cast** - front door, orchestrator, engine, grounding, actions, governance.
4. **What not to use** - at least one tempting but wrong-fit option and why.
5. **Risks and guardrails** - preview/GA status, action safety, compliance, cost, evaluation needs.
6. **Next validation step** - the smallest proof needed before build commitment.

For fuzzy requests, output:

1. **Assumptions**
2. **Clarifying questions**
3. **Provisional shortlist**
4. **What would change the decision**

## Error Handling

| Situation | Likely Cause | Recovery |
|---|---|---|
| User asks "Which product should I use?" with no scenario | Product-first framing | Ask for outcome and UX, or proceed with explicit assumptions if autopilot is required |
| User says "we need an agent" | Premature architecture | Run the agent checkpoint and show non-agent alternatives |
| User asks for a capability a product may not support | Shoeboxing risk | Verify against official docs; state the limitation instead of forcing the fit |
| Status is unclear | Preview/GA ambiguity | Mark status as "needs validation" and point to official Microsoft docs before production recommendation |
| Governance details are missing | Enterprise risk hidden late | Call out identity, data boundary, logging, approval, and admin ownership assumptions |
| Multiple products seem plausible | Role confusion | Split by cast roles rather than choosing a single winner |

## References

| Reference | Use When |
|---|---|
| [Framework Routing](references/FRAMEWORK_ROUTING.md) | Choosing which bundled reference to consult |
| [Constitution](references/CONSTITUTION.md) | Checking voice, anti-shoeboxing, status transparency, and order of operations |
| [Capability Model](references/CAPABILITY_MODEL.md) | Explaining capability groupings and mental models |
| [Decision Framework](references/DECISION_FRAMEWORK.md) | Running the intake filter, BXT, and nine critical questions |
| [Evaluation Criteria](references/EVALUATION_CRITERIA.md) | Assessing complexity, skills, governance, cost, and scale |
| [Scenarios](references/SCENARIOS.md) | Grounding recommendations in real use cases |
| [Implementation Patterns](references/IMPLEMENTATION_PATTERNS.md) | Translating a choice into an architecture pattern |
| [Technologies Reference](references/TECHNOLOGIES.md) | Validating product capabilities, boundaries, and status |
| [Feature Comparison](references/FEATURE_COMPARISON.md) | Comparing shortlisted platforms after framework assessment |
| [Quick Reference](references/QUICK_REFERENCE.md) | Final lookup validation, not first-pass selection |
| [Resources](references/RESOURCES.md) | Finding official Microsoft source links |

## Post-Run Reflection

After completing a recommendation, silently check whether the skill missed a repeatable pattern:

1. Did the answer start with technology before outcome?
2. Did it hide a product limitation or preview status?
3. Did it skip the "do we need an agent?" checkpoint?
4. Did the recommendation name products without explaining their roles in the cast?
5. Did the user need a clearer decision memo template?

If yes, suggest a targeted update to this skill or its references.
