/**
 * Phase 2 — Technology Groupings.
 *
 * Takes the intake, BXT score, and Organisation Context and produces a
 * shortlist of Microsoft AI technology groupings to carry forward into
 * Phase 3 (Scenario-Specific Selection), plus a list of groupings gated out
 * with reasons.
 *
 * The 9 critical questions that drive this phase (spec §4, line 152):
 *   Q1  User interaction pattern?          (Conversational / Autonomous / API)
 *   Q2  Build style & control level?       (Low-code / Pro-code)
 *   Q3  Data strategy?                     (Grounding vs Memory vs Analytics)
 *   Q4  Orchestration complexity?
 *   Q5  Compliance & governance?           (Trust boundary)
 *   Q6  Scale and cost?
 *   Q7  Action safety?
 *   Q8  Team skills?
 *   Q9  Proactive vs. Reactive?
 *
 * Hard filters (applied first):
 *   - Any product with entitlement `unavailable` in the Organisation Context
 *     is excluded before scoring.  This is non-negotiable (FR-026).
 *
 * Soft re-rank (applied after hard filters):
 *   - Custom instructions with kind `preference` or `context-note` adjust the
 *     ranking of shortlisted groupings.
 *   - `hard-constraint` instructions that cannot be met cause a grouping to be
 *     gated out with an explicit reason.
 *
 * FR-009 — apply the Microsoft AI Decision Framework.
 * FR-024 — load active Organisation Context into Phase 2 reasoning.
 * FR-026 — never recommend an `unavailable` product as the primary choice.
 */

import { NotImplementedError } from "../errors.js";
import type { Request, OrgContext } from "../data/models.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatedOutGrouping {
  product: string;
  reason: string;
}

export interface Phase2Result {
  /** Technology groupings that passed all hard filters and are carried to Phase 3. */
  shortlist: string[];
  /** Groupings excluded by entitlement unavailability or hard-constraint instructions. */
  gatedOut: GatedOutGrouping[];
}

// ---------------------------------------------------------------------------
// Stub
// ---------------------------------------------------------------------------

/**
 * Runs Phase 2 Technology Groupings analysis.
 *
 * M1 will implement this as a Copilot SDK tool call / structured reasoning step
 * that evaluates each technology grouping against the 9 framework questions,
 * applies hard entitlement filters, and soft-ranks using custom instructions.
 *
 * The distinction between `unavailable` (hard filter, always gated out) and
 * custom instructions (soft re-rank unless kind === 'hard-constraint') is a
 * critical design invariant that the M1 implementation must preserve (FR-026).
 */
export async function runPhase2(
  _request: Request,
  _orgCtx: OrgContext | null
): Promise<Phase2Result> {
  // M1: evaluate all 9 framework questions using the SDK session/tool pattern.
  // Step 1: gate out any product with entitlement status 'unavailable' (hard filter, FR-026).
  // Step 2: evaluate remaining groupings against Q1-Q9.
  // Step 3: apply custom instructions — 'hard-constraint' violations gate out additional
  //         groupings; 'preference' and 'context-note' adjust ordering in shortlist.
  // Returns shortlist (ordered) + gatedOut (with reasons for the readiness brief).
  throw new NotImplementedError("runPhase2");
}
