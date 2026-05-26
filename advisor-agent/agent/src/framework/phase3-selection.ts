/**
 * Phase 3 — Scenario-Specific Selection.
 *
 * Takes the Phase 2 shortlist and scores each grouping against the Request's
 * scenario constraints:
 *   - Time to market
 *   - Complexity budget
 *   - Financial budget
 *   - Team skills
 *   - Governance / compliance posture
 *   - Deployment posture (cloud / on-prem / hybrid)
 *   - Organisation's installed systems (from OrgContext.systemInventory)
 *   - Organisation's custom decision instructions (soft preferences and hard constraints)
 *
 * The output is a full ReadinessBrief: recommended platform, runner-up alternatives,
 * rationale, trade-offs, estimated complexity, and per-instruction alignment notes.
 *
 * If the best-effort recommendation cannot follow a custom instruction (e.g. Copilot
 * Studio cannot meet a hard requirement so a pro-code Foundry path is recommended
 * instead), the rationale MUST call out which instruction was not followed and why
 * (FR-025, FR-026).
 *
 * FR-011 — produce a project readiness brief.
 * FR-024 — load active Organisation Context into Phase 3 reasoning.
 * FR-025 — surface alignment between recommendation and custom instructions.
 */

import { NotImplementedError } from "../errors.js";
import type { Request, OrgContext, ReadinessBrief } from "../data/models.js";

// ---------------------------------------------------------------------------
// Stub
// ---------------------------------------------------------------------------

/**
 * Runs Phase 3 Scenario-Specific Selection and produces the full ReadinessBrief.
 *
 * M1 will implement this as a Copilot SDK tool call / structured reasoning step
 * that scores the shortlist, selects the simplest platform that will work, and
 * generates per-instruction alignment notes for every active custom instruction.
 *
 * Key M1 design note: AlignmentNote is required for EVERY custom instruction in
 * the active OrgContext version — even those that were followed.  The brief reader
 * should be able to see the complete alignment picture at a glance (FR-025).
 */
export async function runPhase3(
  _request: Request,
  _shortlist: string[],
  _orgCtx: OrgContext | null
): Promise<ReadinessBrief> {
  // M1: score shortlisted groupings against scenario constraints + org context.
  // Select simplest viable platform as recommendedPlatform.
  // Generate AlignmentNote for every customInstruction in the active OrgContext.
  // Where a custom instruction cannot be followed, record outcome:'not-followed'
  // and frameworkAnchor linking the deviation to a specific Q1-Q9 reasoning step (FR-025).
  // Include gatedOut groupings (from Phase 2) in risks / rationale as appropriate.
  throw new NotImplementedError("runPhase3");
}
