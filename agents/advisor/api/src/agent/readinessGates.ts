import type { AdvisorSession } from '@advisor/shared';
import type { ConversationReadinessState } from '@advisor/shared';

export interface ReadinessAssessment {
  state: ConversationReadinessState;
  phase1Ready: boolean;
  phase2Ready: boolean;
  phase3Ready: boolean;
  missingEvidence: string[];
}

export function evaluateReadiness(session: AdvisorSession): ReadinessAssessment {
  const turns = session.conversationCapture.turns;
  const answers = turns.filter((t) => t.role === 'user' && t.messageType === 'answer');
  const hasIntake = turns.some((t) => t.role === 'system' && t.messageType === 'summary');
  const agentTurns = turns.filter((t) => t.role === 'agent');
  const phase1Turns = agentTurns.filter((t) => t.phase === 'phase1.businessImpactAssessment');
  const phase2Turns = agentTurns.filter((t) => t.phase === 'phase2.technologyGroupings');
  const phase3Turns = agentTurns.filter((t) => t.phase === 'phase3.scenarioSpecificSelection');

  const hasIntakeSubmission = hasIntake || Object.keys(session.conversationCapture).length > 0;
  const phase1Ready = phase1Turns.length > 0 && answers.some((a) => a.phase === 'phase1.businessImpactAssessment');
  const phase2Ready = phase2Turns.length > 0 && (answers.some((a) => a.phase === 'phase2.technologyGroupings') || phase2Turns.some((t) => (t.customInstructionAnswersUsed?.length ?? 0) > 0));
  const phase3Ready = phase3Turns.length > 0 || (phase2Ready && turns.some((t) => t.messageType === 'summary'));

  const missingEvidence: string[] = [];
  if (!hasIntakeSubmission) missingEvidence.push('Intake form not yet submitted');
  if (!phase1Ready) missingEvidence.push('Phase 1 BXT assessment incomplete');
  if (!phase2Ready) missingEvidence.push('Phase 2 nine critical questions not fully answered');

  let state: ConversationReadinessState;
  if (!hasIntakeSubmission) {
    state = 'awaitingIntake';
  } else if (!phase1Ready) {
    state = 'phase1InProgress';
  } else if (!phase2Ready) {
    state = 'phase2InProgress';
  } else if (!phase3Ready) {
    state = 'phase3InProgress';
  } else if (turns.some((t) => t.messageType === 'recommendation')) {
    state = 'recommendationDelivered';
  } else {
    state = 'readyForRecommendation';
  }

  return { state, phase1Ready, phase2Ready, phase3Ready, missingEvidence };
}
