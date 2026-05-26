# Admin Backend User Guide

> M0: Placeholder for admin operations. Detailed workflows expand during M1.

## Table of Contents

1. [Becoming an AdvisorAdmin](#becoming-an-advisoradmin)
2. [Writing Effective Custom Instructions](#writing-effective-custom-instructions)
3. [Reviewing Deviation Reports](#reviewing-deviation-reports)
4. [Using the Requests Browse Screen](#using-the-requests-browse-screen)
5. [Using the Projects Browse Screen](#using-the-projects-browse-screen)

---

## Becoming an AdvisorAdmin

**Prerequisite:** You must hold the `AdvisorAdmin` Entra app role to access the admin backend.

**Process:** Contact your Entra tenant administrator and request membership in the `AdvisorAdmin` app role for this application.

<!-- M1: expand -->

**Verification:** After role assignment (allow 5–10 minutes for propagation), sign in at `/admin` and verify you can see the admin menu.

---

## Writing Effective Custom Instructions

Custom instructions bias the advisor's Phase 2 and Phase 3 recommendations. They encode organizational constraints, licensing decisions, and preferred platforms.

### Types of Instructions

| Type | Example | Effect |
|------|---------|--------|
| **Preference** | "Prefer Copilot Studio for low-code workflows" | Soft-weight Copilot Studio higher during Phase 3 |
| **Hard constraint** | "Do not propose Microsoft Foundry (not licensed)" | Filter Foundry from Phase 2 candidates |
| **Context note** | "All production workloads must stay in EU regions" | Inform Phase 3 scoring; surface region constraints in rationale |

### Do's and Don'ts

**Do:**
- Be specific: "Prefer X when Y" is clearer than just "Prefer X."
- Ground decisions: "Prefer Copilot Studio because we have 20 trained low-code developers."
- Version your changes: Add a change summary so you can audit decisions later.

<!-- M1: expand -->

**Don't:**
- Invent products: "Do not propose XYZ AI Copilot" if it doesn't exist in the Microsoft portfolio.
- Contradict the framework: "Always use Copilot Studio" ignores the outcomes → behaviors → platforms flow.
- Oversimplify: "Everything should use Foundry" ignores governance, skill, and licensing constraints.

### Example Instructions

**1. License-based constraint**
```
Type: Hard constraint
Applies to: Phase 2
Text: "Microsoft Foundry is not available. Filter from all recommendations."
```

**2. Skill-based preference**
```
Type: Preference
Applies to: Phase 3
Text: "Prefer Copilot Studio and low-code solutions. We have limited Python/Node engineering."
```

**3. Region-based constraint**
```
Type: Context note
Applies to: Phase 3
Text: "All production data must remain in US regions. EU regions OK for POCs."
```

<!-- M1: expand -->

---

## Reviewing Deviation Reports

If an advisor recommendation deviates from a custom instruction, the readiness brief shows the reason.

**How to read a deviation:**
- **Instruction:** The specific custom instruction that was not followed
- **Outcome:** "not-followed" / "partially-followed" / "followed"
- **Reason:** Why the deviation was necessary (e.g., "Hard blocker: Product unavailable", "Trade-off: Scale requires multi-region", "Capability gap: No low-code option for ML pipeline")

<!-- M1: expand -->

**Action:** Decide whether to:
1. **Accept the deviation** — the framework rationale outweighs the instruction.
2. **Update the instruction** — clarify or adjust the constraint.
3. **Escalate** — discuss with the stakeholder who set the original instruction.

---

## Using the Requests Browse Screen

**Purpose:** See all submitted Requests across all users, filter and sort, and drill into any Request to inspect its readiness brief.

**Filters:**
- **Status:** New, ReadyForConfirmation, Draft
- **Owner:** Entra user name (if resolvable) or user ID
- **Submitted date range:** Filter by date
- **Linked Project:** Show only Requests linked to a specific Project
- **Org Context version:** Show Requests generated under a specific version

<!-- M1: expand -->

**Actions:**
- **Open Request:** View the full readiness brief, framework answers, Step 1b match decision, and custom instruction alignment. Read-only. Audit-logged with your admin ID and the user's ID.

**Important:** Admin screens do **not** show raw conversation turns. You see only the final readiness brief and framework answers that the user confirmed.

---

## Using the Projects Browse Screen

**Purpose:** Inspect existing Projects and see which Requests are linked to each Project.

**Columns:**
- Project ID, name, owner, status, technologies, last-updated
- Count of linked Requests

<!-- M1: expand -->

**Actions:**
- **Open Project:** View the project summary, technology stack, linked Requests (with their status and owners).

**Note:** Project ingestion and updates happen out of band (outside the advisor for MVP). You cannot edit Projects from this screen.

---

## Next Steps

- **M1:** Expand all sections with detailed step-by-step workflows, screenshots, and API examples.
- **M2:** Add export capabilities (CSV/JSON) for audit and reporting.

See [docs/runbook.md](./runbook.md) for operational procedures and [docs/data-model.md](./data-model.md) for the schema your actions update.
