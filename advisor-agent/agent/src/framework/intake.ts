/**
 * Intake filter — validates the minimum required fields before the advisor
 * begins framework reasoning.
 *
 * The intake filter is the first gate in the Storybook Flow:
 *   "Stop Shiny Object Syndrome before it starts." (docs/decision-framework.md)
 *
 * Minimum required fields come from the 3 Intake Questions in the framework:
 *   1. What is the desired outcome?
 *   2. Who is the target user?
 *   3. What is the simplest tech that could work?
 *
 * FR-001 — polished intake form for business-user submissions.
 * FR-010 — ask clarification questions when required fields are missing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimum required intake fields.  Maps to the Request document fields that
 * must be populated before the advisor can start Phase 1 BXT reasoning.
 */
export interface IntakeFields {
  /** High-level description of the desired business outcome. */
  businessOutcome: string;
  /** Who will use or benefit from the AI capability. */
  targetUsers: string;
  /** The specific behavior or interaction the user envisions. */
  desiredBehavior: string;
  /** Optional at intake, required before readiness brief generation. */
  dataSources?: string;
  /** Optional at intake — actions the AI should be able to take. */
  actions?: string;
  /** Optional constraints — regulatory, budget, timeline, skills. */
  constraints?: string;
}

export interface IntakeValidationResult {
  ok: boolean;
  /** Field names that are missing or empty. */
  missing: string[];
}

// ---------------------------------------------------------------------------
// Stub
// ---------------------------------------------------------------------------

/**
 * Validates that the minimum intake fields are present and non-empty.
 *
 * M1 will extend this to include schema validation, max-length enforcement,
 * and possibly prompt-based extraction from free-text input when structured
 * fields are absent (FR-010).
 */
export function validateIntake(input: Partial<IntakeFields>): IntakeValidationResult {
  // M1: replace this stub with full field validation + length checks.
  const requiredKeys: (keyof IntakeFields)[] = [
    "businessOutcome",
    "targetUsers",
    "desiredBehavior",
  ];

  const missing = requiredKeys.filter(
    (k) => !input[k] || (input[k] as string).trim() === ""
  );

  return { ok: missing.length === 0, missing };
}
