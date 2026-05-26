/**
 * Phase 1 — Business Impact Assessment (BXT).
 *
 * BXT evaluates the proposed idea across three dimensions:
 *   - Business Viability: does it serve a real business need?
 *   - Human Desirability: do the target users actually want it?
 *   - Technical Feasibility: can the technology deliver it?
 *
 * BXT is Step 1 of the Microsoft AI Decision Framework Storybook Flow.
 * A low BXT score is an early exit signal before any technology comparison.
 *
 * see spec §4 decision-framework.md — "Step 1: Business Impact Assessment"
 * see product-spec.md §7 BxtScore
 * FR-009 — apply the Microsoft AI Decision Framework.
 */

import { NotImplementedError } from "../errors.js";
import type { BxtScore } from "../data/models.js";
import type { IntakeFields } from "./intake.js";
import type { OrgContext } from "../data/models.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { BxtScore };

export interface BxtInput {
  intake: IntakeFields;
  /** Active Organisation Context — may influence BXT scoring when entitlements
   * or custom instructions signal a hard blocker before technology groupings. */
  orgCtx: OrgContext | null;
}

// ---------------------------------------------------------------------------
// Stub
// ---------------------------------------------------------------------------

/**
 * Runs Phase 1 BXT scoring against the intake and org context.
 *
 * M1 will implement this as a Copilot SDK tool call / agent turn that uses the
 * framework BXT rubric to produce numeric scores and a summary.  The SDK session
 * will be provided via the adapter layer (responses.ts).
 */
export async function runBxtPhase(_input: BxtInput): Promise<BxtScore> {
  // M1: invoke Copilot SDK tool to score viability (0-10), desirability (0-10),
  // feasibility (0-10) and produce a plain-language summary.
  // The org context is included so hard 'unavailable' entitlements can surface
  // early as feasibility blockers even before Phase 2 groupings.
  throw new NotImplementedError("runBxtPhase");
}
