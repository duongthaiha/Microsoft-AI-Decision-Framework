/**
 * @advisor/shared — public API barrel.
 *
 * All shared contracts, types, and validators are exported from here.
 * Workspace packages (api, cli, web) import from '@advisor/shared'.
 */

// Types
export type {
  QuestionType,
  AnswerValue,
  IntakeQuestionOption,
  IntakeQuestion,
  IntakeSection,
  IntakeRespondent,
  IntakeForm,
  ValidationState,
  IntakeAnswerMap,
  IntakeSubmission,
} from './types/intake.js';

export type {
  PhaseId,
  BxtAssessmentStrength,
  BxtDimension,
  Phase1Evidence,
  CriticalQuestionId,
  EvidenceSource,
  CriticalQuestionAnswer,
  CapabilityGrouping,
  Phase2Evidence,
  Phase3Evidence,
  DecisionFrameworkEvidence,
} from './types/framework.js';

export type {
  RecommendedTechnology,
  RecommendedApproach,
  RationaleEntry,
  CustomInstructionEffect,
  TradeOffEntry,
  SimilarProjectHighlight,
  RecommendationStatus,
  RecommendationConfidence,
  RecommendationOutput,
} from './types/recommendation.js';

export type {
  SimilarProjectSignals,
  SensitivityLevel,
  ProjectStatus,
  ProjectKnowledgeDocument,
  PhaseTag,
  SimilarProjectMatch,
  NoMatchFound,
  SimilarProjectResult,
  SimilarProjectSearchQuery,
  SimilarProjectSearchResult,
} from './types/similar-projects.js';

export { isNoMatchFound } from './types/similar-projects.js';

export type {
  OrganizationContext,
  CustomInstruction,
  GuidanceAuditEntry,
  GuidanceScope,
  CustomerGuidanceDocument,
} from './types/guidance.js';

export type {
  TurnRole,
  TurnMessageType,
  ConversationTurn,
  CapturedFact,
  PhaseReadiness,
  PhaseReadinessState,
  ConversationReadinessState,
  ConversationCapture,
  AdvisorSession,
} from './types/conversation.js';

export type {
  CustomerOrganization,
  Respondent,
  ReviewStatus,
  ProjectFeedback,
  PersistenceTargets,
  ProjectCase,
} from './types/project-case.js';

export type {
  ApiErrorCode,
  ApiError,
  ApiSuccess,
  ApiFailure,
  ApiResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  SubmitIntakeRequest,
  SubmitIntakeResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetResponseResponse,
  RetrieveRecommendationResponse,
  RetrieveSimilarProjectsResponse,
  EndSessionResponse,
} from './types/api.js';

// Validators
export {
  QuestionTypeSchema,
  AnswerValueSchema,
  IntakeRespondentSchema,
  IntakeQuestionSchema,
  IntakeSectionSchema,
  IntakeFormSchema,
  ValidationStateSchema,
  IntakeSubmissionSchema,
} from './types/validators.intake.js';

export type { IntakeSubmissionInput } from './types/validators.intake.js';

export {
  ApiErrorCodeSchema,
  ApiErrorSchema,
  CreateSessionRequestSchema,
  SubmitIntakeRequestSchema,
  SendMessageRequestSchema,
} from './types/validators.api.js';

export type {
  CreateSessionRequestInput,
  SubmitIntakeRequestInput,
  SendMessageRequestInput,
} from './types/validators.api.js';

// Interfaces
export type { ICopilotSessionService, CopilotSessionConfig, CopilotTool, CopilotSessionHandle } from './interfaces/index.js';
export type { IConversationStore } from './interfaces/index.js';
export type { IGuidanceStore } from './interfaces/index.js';
export type { IProjectSearchService } from './interfaces/index.js';
export type { IFrameworkRetrievalService, FrameworkRetrievalQuery, FrameworkRetrievalResult } from './interfaces/index.js';
