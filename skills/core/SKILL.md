---
name: core
description: >
  Shared protocols for skills in this repository: user interaction,
  output discipline, common error handling, post-run reflection, and
  fictitious data policy. Loaded by other skills. Do not invoke directly.
disable-model-invocation: true
---

# Core Skill Protocols

Shared operating rules for repository skills. User-facing skills reference this file instead of duplicating common behavior.

## 1. Mode Detection

- **Dev mode:** the current repository contains `skills/core/SKILL.md`. Suggest direct file edits when a skill improvement is obvious.
- **User mode:** the skill was loaded from an installed plugin. Summarize improvement ideas and offer a GitHub issue instead of editing installed plugin files.

## 2. User Interaction

- Ask one question at a time and wait for the answer.
- Do not ask questions the repository can answer through inspection.
- Include a recommended answer when asking a design question.
- Prefer natural-language input over rigid option lists unless the choices are truly exhaustive and mutually exclusive.
- Keep confirmed decisions, assumptions, and open questions visibly separate.

## 3. Output Discipline

- Lead with the artifact or answer the user requested.
- Mark unresolved items as open questions, not silent defaults.
- Do not overwrite an existing user file without confirmation.
- Do not invent technical capabilities. If a product or platform claim matters, verify it against official documentation or flag it for verification.

## 4. Error Handling

| Error | Likely Cause | Recovery |
|-------|--------------|----------|
| Repository cannot be inspected | The session has no file access or the user is working outside a repo | Continue from user-provided context and mark repo-derived assumptions as unknown |
| Required decision is missing | The workflow reached a blocking design choice | Ask exactly one question with a recommended answer |
| Output file already exists | The default or requested path would overwrite user work | Ask before overwriting or choose a dated/feature-specific filename |
| Technical claim cannot be verified | Official docs are unavailable or product support is unclear | Phrase as an assumption or open question; do not present it as fact |

## 5. Post-Run Reflection: Continuous Improvement

After completing a multi-step workflow, silently evaluate whether the skill:

1. Triggered for the right request.
2. Avoided unnecessary questions by inspecting available context.
3. Produced the requested artifact in the expected format.
4. Preserved confirmed decisions, assumptions, and open questions.
5. Avoided unsupported technical claims.
6. Covered every mandatory section for the workflow.
7. Left the user with a clear next action only when one is needed.

If a repeatable gap appears in **dev mode**, suggest the exact `skills/<name>/SKILL.md` or `skills/<name>/references/<FILE>.md` change. In **user mode**, summarize the gap and offer to file an issue.

## 6. Fictitious Data Policy

Use fictitious organizations and people in examples, such as Contoso Ltd., Fabrikam Inc., or Northwind Traders. Do not include real customer, employee, financial, or credential data in examples or templates.
