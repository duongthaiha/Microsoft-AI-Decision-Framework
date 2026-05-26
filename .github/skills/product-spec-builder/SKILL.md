---
name: product-spec-builder
description: >
  Build a Markdown product specification or PRD for a feature a dev team can implement.
  Use this skill whenever the user asks to build a product feature, create a product spec,
  write a PRD, prepare a dev handoff, define requirements, scope an Azure feature, or turn
  an idea into implementation-ready documentation, even if they do not name the skill.
  Always cover Bicep IaC, AZD deployability, managed identity where possible, documentation,
  and networking posture.
---

# Product Specification Builder

Turn a fuzzy product idea into a clear Markdown specification that an engineering team can build from. Act like a product architect with a clipboard: inspect the current project, ask one sharp question at a time, recommend an answer, and capture the decisions in a handoff-ready spec.

## Prerequisites

### Required

- A product idea, feature request, or problem statement from the user.
- File read access if the spec should reflect an existing codebase.

### Optional

- File write access if the user wants the final Markdown saved into the repository.
- Web access for verifying product/platform capabilities against official documentation when technical specifics matter.

No MCP server is required.

## Workflow

### Step 1: Inspect Before Interviewing

If a repository is available, inspect it before asking questions. Look for:

- Existing product or domain docs: `README.md`, `docs/`, `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, design docs.
- Delivery conventions: issue templates, PR templates, `AGENTS.md`, `.github/copilot-instructions.md`.
- Azure deployment posture: `azure.yaml`, `.azure/`, `infra/`, `*.bicep`, `main.parameters.json`, deployment scripts.
- App stack and tests: package manifests, project files, test folders, CI workflows.
- Security or networking signals: private endpoint docs, VNet references, firewall rules, managed identity usage, Key Vault usage.

Do not ask the user for facts the repository already answers. If the repo and the user's statement conflict, surface the conflict and ask which source should win.

### Step 2: Frame the Feature

Restate the feature in four parts:

1. **Outcome:** what business or user result this feature should create.
2. **User:** who benefits and who operates it.
3. **Behavior:** what the feature does in the happy path.
4. **Boundary:** what the feature must not do.

If any part is missing, ask for the next most blocking answer only.

### Step 3: Interview One Decision at a Time

Ask one question at a time and wait for feedback before continuing. For each question:

- State why it matters.
- Provide your recommended answer.
- Keep the question concrete and answerable.
- Prefer natural-language answers over rigid pickers unless the choices are truly exhaustive.

Use this decision order unless the user's context makes a later decision more urgent:

1. Target user and desired outcome.
2. Core user journey and success criteria.
3. Data sources, actions, integrations, and system boundaries.
4. Security, compliance, and identity requirements.
5. Azure hosting and deployment expectations.
6. Networking posture.
7. Observability, support, and documentation requirements.

### Step 4: Run the Networking Gate

The product specification must always document networking. If the repository does not already define the posture, ask:

> What networking posture should this feature use? Recommended default: private by default for enterprise or sensitive data; hybrid if a public UI or API must call private data/services; public only for low-risk or demo workloads. Should I document public, private, or hybrid networking?

Capture the answer in the final spec with:

- Ingress model.
- Egress model.
- Private endpoint or VNet integration expectations.
- DNS/firewall implications when relevant.
- Local development impact.
- Any unresolved networking decision as an open question.

### Step 5: Apply Azure Delivery Defaults

Unless the user explicitly excludes Azure, every spec must include these defaults:

- **Infrastructure as code:** Bicep is the required IaC format. Document expected modules/templates, parameters, and environment overlays.
- **AZD deployability:** the solution should be deployable through Azure Developer CLI. Require `azure.yaml`, repeatable environment setup, and documented `azd` commands unless the repository already uses another approved deployment path.
- **Managed identity first:** use system-assigned or user-assigned managed identity where the target service supports Microsoft Entra authentication. If a secret is unavoidable, document the exception, storage location, rotation approach, and owner.
- **Documentation:** include implementation docs, setup instructions, operational notes, and any runbook the dev team needs.
- **Observability:** define logs, metrics, traces, alerts, and ownership for support.

Do not claim a specific Azure service supports managed identity, private endpoints, AZD, or another capability unless you have verified it against official documentation or clearly mark it as an assumption to verify.

### Step 6: Write the Product Specification

Use [Product Spec Template](references/PRODUCT_SPEC_TEMPLATE.md) for the final artifact.

Default output behavior:

1. If the user gives a path, write the Markdown there.
2. If no path is given and `docs/` exists, propose `docs/product-spec.md`.
3. If no path is given and `docs/` does not exist, propose `PRODUCT_SPEC.md`.
4. If file-write tools are unavailable, return the complete Markdown in the chat.

Before overwriting an existing file, ask for confirmation or choose a new feature-specific filename.

### Step 7: Review for Dev-Team Handoff Quality

Before finalizing, check that the spec:

- Has testable acceptance criteria.
- Separates confirmed decisions, assumptions, and open questions.
- Includes Bicep, AZD, managed identity, documentation, and networking sections.
- Names the target users, operators, systems, and data boundaries.
- States non-goals so the dev team knows what not to build.
- Avoids unsupported platform claims.

## Output Format

Final response after writing or producing the spec:

```markdown
Created: <path or "inline Markdown">

Key decisions captured:
- <decision 1>
- <decision 2>

Open questions:
- <question or "None">
```

Keep the response short. The product specification is the deliverable.

## Error Handling

| Error | Likely Cause | Recovery |
|-------|--------------|----------|
| User asks for code, not a spec | The request is implementation, not product definition | Ask whether to produce the spec first or proceed with implementation |
| Feature is too vague | Missing user, outcome, or behavior | Ask the next blocking question with a recommended answer |
| Networking posture is unknown | The repo and user prompt do not define public/private/hybrid | Run the Networking Gate before finalizing |
| Existing file would be overwritten | Default or requested output path already exists | Ask before overwrite or create a feature-specific filename |
| Azure capability is uncertain | Service support for MI, private endpoints, or AZD is unclear | Mark as "to verify" and cite official docs if verification is performed |
| Repo conventions conflict with defaults | Existing project uses a different approved pattern | Surface the conflict and ask whether the product spec should preserve or change the convention |

For common interaction and reflection rules, follow [core](../core/SKILL.md).

## References

| Reference | When to load |
|-----------|--------------|
| [Product Spec Template](references/PRODUCT_SPEC_TEMPLATE.md) | Load when drafting the final Markdown product specification |

## Post-Run Reflection

After completing a multi-step workflow, follow the [core section 5 Post-Run Reflection](../core/SKILL.md#5-post-run-reflection-continuous-improvement) protocol.
