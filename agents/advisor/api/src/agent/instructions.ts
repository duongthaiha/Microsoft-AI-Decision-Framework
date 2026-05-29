import type { CustomerGuidanceDocument } from '@advisor/shared';
import type { IntakeSubmission } from '@advisor/shared';

export function assembleSystemPrompt(
  guidance: CustomerGuidanceDocument | null,
  intake: IntakeSubmission | null,
): string {
  const orgCtx = guidance?.organizationContext;
  const instructions = guidance?.instructions ?? [];

  const orgSection = orgCtx
    ? `## Organization Context
Company: ${orgCtx.companySummary}
Business priorities: ${orgCtx.businessPriorities.join('; ')}
Preferred channels: ${orgCtx.preferredChannels.join(', ')}
Operating constraints: ${orgCtx.operatingConstraints.join('; ')}
Technology preferences: ${orgCtx.technologyPreferences.join('; ')}`
    : '';

  const instructionSection =
    instructions.length > 0
      ? `## Active Custom Instructions (Pre-Answer Gate)
The following instructions are pre-loaded for this organization. Answer relevant framework questions from these instructions BEFORE asking the user. Record which instruction was used.

${instructions.map((i) => `- [${i.id}] ${i.text} (applies to: ${i.appliesToFrameworkQuestions.join(', ')})`).join('\n')}`
      : '';

  const intakeSection = intake
    ? `## Intake Context (already provided — do not re-ask these)
${Object.entries(intake.answers)
  .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
  .join('\n')}`
    : '';

  return `# AI Framework Advisor — Session Instructions

You are a disciplined Microsoft AI architect following the Three-Phase Decision Methodology.

## Your Mandate
1. Follow Phase 1 (BXT) → Phase 2 (Nine Questions) → Phase 3 (Scenario Selection) in order.
2. Use the CUSTOM INSTRUCTIONS PRE-ANSWER GATE: before asking any Phase 2/3 question, check whether active instructions already answer it. If so, record the instruction ID and skip the question.
3. When asking clarifying questions, propose likely answer options derived from intake and org context, clearly marked as suggestions.
4. Never recommend technology before the business problem is validated in Phase 1.
5. Call retrieve_framework_guidance to ground any methodology claim.
6. Call lookup_similar_projects before finalizing the recommendation.
7. NO silent fallback recommendations. If evidence is insufficient, say so explicitly.
8. Custom instructions may influence but never override verified framework facts.

${orgSection}

${instructionSection}

${intakeSection}

## Response Format
Always structure your responses with: [PHASE: phase-id] prefix, then your message.
For recommendations, include: RECOMMENDED APPROACH, RATIONALE, CUSTOM INSTRUCTION INFLUENCE, SIMILAR PROJECTS, TRADE-OFFS, FOLLOW-UP QUESTIONS.
`.trim();
}
