/**
 * Decision Framework phase types.
 *
 * Models the Three-Phase Decision Methodology from the Microsoft AI Decision
 * Framework skill. These enums and types are used throughout the advisor to
 * track readiness, evidence, and recommendation state.
 *
 * Phase 1: Business Impact Assessment (BXT)
 * Phase 2: Technology Groupings + Nine Critical Questions
 * Phase 3: Scenario-Specific Selection
 */

// ---------------------------------------------------------------------------
// Phase identifiers
// ---------------------------------------------------------------------------

export type PhaseId =
  | 'phase1.businessImpactAssessment'
  | 'phase2.technologyGroupings'
  | 'phase3.scenarioSpecificSelection';

// ---------------------------------------------------------------------------
// Phase 1 — Business Impact Assessment (BXT)
// ---------------------------------------------------------------------------

export type BxtAssessmentStrength = 'Strong' | 'Medium' | 'Weak' | 'Unknown';

export interface BxtDimension {
  assessment: BxtAssessmentStrength;
  evidence: string[];
  /** If true, more evidence is needed before moving to Phase 2 */
  gapIdentified?: boolean;
}

export interface Phase1Evidence {
  businessViability: BxtDimension;
  experienceDesirability: BxtDimension;
  technologyFeasibility: BxtDimension;
}

// ---------------------------------------------------------------------------
// Phase 2 — Technology Groupings + Nine Critical Questions
// ---------------------------------------------------------------------------

export type CriticalQuestionId =
  | 'user_interaction_pattern'
  | 'build_style_control_level'
  | 'data_strategy'
  | 'orchestration_complexity'
  | 'compliance_governance'
  | 'scale_cost'
  | 'action_safety'
  | 'team_skills'
  | 'proactive_vs_reactive';

/**
 * Where a critical question answer came from.
 * Multiple sources can contribute to a single answer.
 */
export type EvidenceSource =
  | 'intake'
  | 'conversation'
  | 'customInstructions'
  | 'organizationContext'
  | 'frameworkDocs'
  | 'projectSearch'
  | 'agentInference'
  | 'missingEvidence';

export interface CriticalQuestionAnswer {
  questionId: CriticalQuestionId;
  answer: string;
  /** Primary source of this answer */
  source: EvidenceSource;
  /** Secondary sources that contributed */
  additionalSources?: EvidenceSource[];
  /** Whether the agent asked the user directly for this answer */
  askedUser: boolean;
  /** IDs of custom instructions that provided or shaped this answer */
  customInstructionAnswersUsed?: string[];
  /** True when this question needs follow-up before recommendation */
  followUpNeeded?: boolean;
}

export type CapabilityGrouping =
  | 'grouping1.endUserCopilots'
  | 'grouping2.extensibilityIntoExistingCopilots'
  | 'grouping3.buildAiAppsAndAgents'
  | 'grouping4.aiServicesAndBuildingBlocks'
  | 'grouping5.specializedAgents';

export interface Phase2Evidence {
  preQuestionDoYouNeedAnAgent: {
    answer: string;
    source: EvidenceSource;
  };
  criticalQuestionAnswers: CriticalQuestionAnswer[];
  candidateTechnologyGroupings: CapabilityGrouping[];
}

// ---------------------------------------------------------------------------
// Phase 3 — Scenario-Specific Selection
// ---------------------------------------------------------------------------

export interface Phase3Evidence {
  selectedScenarioPattern: string;
  selectionInputsCoveredByCustomInstructions: string[];
  remainingOpenQuestions: string[];
}

// ---------------------------------------------------------------------------
// Combined decision framework evidence
// ---------------------------------------------------------------------------

export interface DecisionFrameworkEvidence {
  phase1BusinessImpactAssessment: Phase1Evidence;
  phase2TechnologyGroupings: Phase2Evidence;
  phase3ScenarioSpecificSelection: Phase3Evidence;
}
