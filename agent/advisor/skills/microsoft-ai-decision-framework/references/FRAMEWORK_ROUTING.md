# Framework Routing

Use this reference to route a Microsoft AI decision task to the right bundled document. The skill is portable: these references travel with the skill folder, so do not depend on the original repository path at runtime.

## The Fast Route

| User Need | Start Here | Why |
|---|---|---|
| "I do not know what kind of AI capability this is" | [CAPABILITY_MODEL.md](CAPABILITY_MODEL.md) | Defines the five capability groupings and the mental models behind them. |
| "Which Microsoft AI technology should we use?" | [DECISION_FRAMEWORK.md](DECISION_FRAMEWORK.md) | Forces the outcome -> UX -> technology sequence before selection. |
| "How hard or risky is this?" | [EVALUATION_CRITERIA.md](EVALUATION_CRITERIA.md) | Measures complexity, skills, governance, cost, action safety, and scale. |
| "Show me real examples" | [SCENARIOS.md](SCENARIOS.md) | Grounds abstract choices in business situations. |
| "What would the architecture look like?" | [IMPLEMENTATION_PATTERNS.md](IMPLEMENTATION_PATTERNS.md) | Converts a decision into delivery patterns. |
| "What can this product actually do?" | [TECHNOLOGIES.md](TECHNOLOGIES.md) | Validates product capabilities, boundaries, and status. |
| "Compare the shortlist" | [FEATURE_COMPARISON.md](FEATURE_COMPARISON.md) | Compares technologies after the decision work is done. |
| "Give me the quick table" | [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | Final lookup validation; never use as the first step. |
| "Where did this source come from?" | [RESOURCES.md](RESOURCES.md) | Lists official Microsoft documentation and related sources. |
| "How should this sound?" | [CONSTITUTION.md](CONSTITUTION.md) | Preserves the framework voice, guardrails, and anti-shoeboxing mandate. |

## Canonical Decision Sequence

1. **Outcome** - Identify the business result and the user who benefits.
2. **Behavior** - Decide how the assistant behaves: assistive, embedded, conversational, autonomous, API-first, or workflow-driven.
3. **Platform** - Select the simplest Microsoft technology that supports the behavior.
4. **Trade-off** - Evaluate complexity, skills, cost, governance, scale, and action safety.
5. **Validation** - Verify product claims and lifecycle status against official Microsoft documentation.

## Recommendation Guardrails

- Check managed Microsoft 365 experiences before recommending custom builds.
- Do not equate "agent" with "AI app"; many good solutions are search, workflow, or deterministic software with AI-assisted edges.
- Use Microsoft technologies as roles in a cast: front door, orchestrator, engine, grounding layer, action layer, governance layer.
- If a product is preview, experimental, deprecated, or lifecycle-bound, say so wherever it influences the recommendation.
- If a technology cannot satisfy a requirement, say that clearly. Do not shoebox.

## Decision Memo Skeleton

```markdown
## Decision

Use [recommended path] because [outcome + UX + constraints].

## Why This Fits

- Outcome:
- User experience:
- Data and grounding:
- Orchestration:
- Governance:
- Team skills:
- Time and budget:

## Architecture Cast

| Role | Choice | Reason |
|---|---|---|
| Front door | | |
| Orchestrator | | |
| Engine | | |
| Grounding layer | | |
| Action layer | | |
| Governance layer | | |

## What Not To Use

[Tempting option] is not the lead choice because [limitation or mismatch].

## Risks and Guardrails

- Status:
- Action safety:
- Data boundary:
- Cost/scale:
- Evaluation:

## Next Validation Step

[Smallest proof before build commitment.]
```
