/**
 * Intake form contracts — derived from sample-intake-form-nfum.json.
 *
 * The intake form is the boarding pass: a structured UX step that captures
 * enough initial context to make the first agent turn useful. It is NOT an
 * agent interaction; the submitted answers become the opening structured
 * context for the Copilot SDK session.
 */

// ---------------------------------------------------------------------------
// Question answer types
// ---------------------------------------------------------------------------

export type QuestionType =
  | 'shortText'
  | 'longText'
  | 'multiText'
  | 'singleSelect'
  | 'multiSelect';

export type AnswerValue = string | string[];

// ---------------------------------------------------------------------------
// Form template (the form definition, not a submission)
// ---------------------------------------------------------------------------

export interface IntakeQuestionOption {
  /** Display label shown to the respondent */
  label: string;
  /** Optional machine-readable value (defaults to label if omitted) */
  value?: string;
}

export interface IntakeQuestion {
  id: string;
  label: string;
  type: QuestionType;
  /** Options for singleSelect and multiSelect questions */
  options?: string[];
  required?: boolean;
  helperText?: string;
}

export interface IntakeSection {
  id: string;
  title: string;
  questions: IntakeQuestion[];
}

export interface IntakeRespondent {
  name?: string;
  role?: string;
  organisation?: string;
  country?: string;
  areaOfExpertise?: string;
}

/** The form template definition — what the front end renders */
export interface IntakeForm {
  formTitle: string;
  audience?: string;
  exampleRespondent?: IntakeRespondent;
  sections: IntakeSection[];
}

// ---------------------------------------------------------------------------
// Submitted intake (a completed form submission)
// ---------------------------------------------------------------------------

export type ValidationState = 'valid' | 'invalid' | 'partial';

/** A flat map of questionId → answer captured from the respondent */
export type IntakeAnswerMap = Record<string, AnswerValue>;

export interface IntakeSubmission {
  /** UTC ISO-8601 timestamp when the form was submitted */
  submittedAt: string;
  formTitle: string;
  /** The respondent who completed the form */
  respondent?: IntakeRespondent;
  /** Flat map of question ID → answer value */
  answers: IntakeAnswerMap;
  /** Client-side validation state at the time of submission */
  validationState?: ValidationState;
  /** IDs of any questions that failed validation */
  invalidQuestionIds?: string[];
}
