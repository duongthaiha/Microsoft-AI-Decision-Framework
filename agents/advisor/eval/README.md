# AI Framework Advisor — Recommendation Evaluation Cases

**Epic 7 — Primary POC success measure.**

This directory contains representative customer use cases that prove the advisor recommends the right Microsoft AI technology stack with sound rationale. Each case drives the mock agent through Phase 1→2→3 and scores the output.

---

## How to run

From `agents/advisor/`:

```bash
# Run all tests including eval cases
npm install
npm test

# Run eval cases only (verbose output with scores)
npm run test --workspace=eval
```

---

## Eval cases

| ID | Name | Org | Custom Instructions | Similar Match |
|---|---|---|---|---|
| `nfum-insurance-claims-guidance` | NFU Mutual Claims Guidance | `org-nfum` | 3 (NFU Mutual) | Yes |
| `custom-instruction-pre-answer` | Custom Instruction Gate | `org-nfum` | 3 (NFU Mutual) | Yes |
| `no-similar-match` | No Similar Project Match | `org-unknown` | 0 | No (forced) |
| `healthcare-minimal-pro-code` | Healthcare Pro-Code | `org-unknown` | 0 | Yes |

---

## Scoring rubric (100 points per case)

| Dimension | Points | Criteria |
|---|---|---|
| **Phase 1: Recommendation status** | 25 | `status === 'recommendationReady'` |
| **Phase 2: Evidence grounding** | 25 | `decisionEvidenceSources` includes `intake` + at least one additional source |
| **Phase 3: Primary technologies** | 25 | All expected primary technologies appear in `recommendedApproach.primaryTechnologies` |
| **Rationale quality** | 25 | All expected theme keywords appear in rationale text + evidence |
| **PASS threshold** | **≥ 75** | |

---

## Supplementary assertions (beyond score)

Each case also asserts:
- `customInstructionInfluence.length` matches expected instruction count (no hallucination)
- `similarProjectHighlights.length` matches expectation (populated or empty)
- For `no-similar-match`: `projectSearch` absent from `decisionEvidenceSources`
- For custom-instruction case: `frameworkDocs` present in evidence (instructions don't override facts)

---

## Advisory findings

The `healthcare-minimal-pro-code` case includes an advisory note flagged for Tank:

> **KNOWN GAP:** The mock agent ignores Q8 (`team_skills`) from Phase 2. A pro-code engineering team gets the same Copilot Studio recommendation as a maker team. The agent should vary its primary technology recommendation based on the team skills intake answer.
>
> **Severity:** Medium — the recommendation is not wrong, but it misses an opportunity for a more precise framework selection. Recommend addressing in Wave 3 when the nine-question evidence is fully wired into the recommendation builder.

---

## Architecture

```
eval/
├── package.json          # Workspace — vitest runner
├── tsconfig.json         # Extends ../tsconfig.base.json
├── vitest.config.ts      # Resolves @advisor/shared from source
├── evalFactory.ts        # buildEvalDeps(), runEvalFlow(), NoMatchProjectSearch
├── runner.test.ts        # Main vitest file — runs all cases, scores output
├── cases/
│   ├── nfum.ts           # NFU Mutual insurance use case
│   ├── custom-instruction.ts  # Custom instruction pre-answer scenario
│   ├── no-similar-match.ts   # No similar project match (honest path)
│   └── healthcare-minimal.ts # Healthcare pro-code (advisory gap flagged)
└── README.md             # This file
```

The eval runner imports directly from `../api/src/` so no pre-build is needed. Vitest resolves TypeScript source files and handles `.js` extension stripping automatically.

---

## Adding a new eval case

1. Create `cases/my-case.ts` following the `EvalCase` interface exported from `runner.test.ts`.
2. Import and add to the `ALL_CASES` array in `runner.test.ts`.
3. Run `npm test` from `agents/advisor/` to confirm it passes.

**Minimum required fields:**
- `id`, `name`, `description`
- `orgId` (must exist in `InMemoryGuidanceStore` or be `'org-unknown'` for no-instructions)
- `intake`: `IntakeSubmission`
- `phase1Answer`, `phase2Answer`: scripted user answers
- `expected.phase3PrimaryTechnologies`: at least one expected technology name
- `expected.rationaleThemes`: at least two keywords to verify rationale quality
