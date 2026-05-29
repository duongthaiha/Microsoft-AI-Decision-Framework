import type { AdvisorSession } from '@advisor/shared';
import type { ConversationReadinessState } from '@advisor/shared';
export interface ReadinessAssessment {
    state: ConversationReadinessState;
    phase1Ready: boolean;
    phase2Ready: boolean;
    phase3Ready: boolean;
    missingEvidence: string[];
}
export declare function evaluateReadiness(session: AdvisorSession): ReadinessAssessment;
//# sourceMappingURL=readinessGates.d.ts.map