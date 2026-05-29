/**
 * Zod validators for intake form contracts.
 * Validates runtime data (API payloads, JSON files) against the TypeScript types.
 */

import { z } from 'zod';

export const QuestionTypeSchema = z.enum([
  'shortText',
  'longText',
  'multiText',
  'singleSelect',
  'multiSelect',
]);

export const AnswerValueSchema = z.union([z.string(), z.array(z.string())]);

export const IntakeRespondentSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  organisation: z.string().optional(),
  country: z.string().optional(),
  areaOfExpertise: z.string().optional(),
});

export const IntakeQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: QuestionTypeSchema,
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  helperText: z.string().optional(),
});

export const IntakeSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(IntakeQuestionSchema).min(1),
});

export const IntakeFormSchema = z.object({
  formTitle: z.string().min(1),
  audience: z.string().optional(),
  exampleRespondent: IntakeRespondentSchema.optional(),
  sections: z.array(IntakeSectionSchema).min(1),
});

export const ValidationStateSchema = z.enum(['valid', 'invalid', 'partial']);

export const IntakeSubmissionSchema = z.object({
  submittedAt: z.string().datetime({ offset: true }),
  formTitle: z.string().min(1),
  respondent: IntakeRespondentSchema.optional(),
  answers: z.record(z.string(), AnswerValueSchema),
  validationState: ValidationStateSchema.optional(),
  invalidQuestionIds: z.array(z.string()).optional(),
});

export type IntakeSubmissionInput = z.input<typeof IntakeSubmissionSchema>;
