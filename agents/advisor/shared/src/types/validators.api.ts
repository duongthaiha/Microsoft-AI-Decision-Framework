/**
 * Zod validators for API DTOs.
 */

import { z } from 'zod';
import { IntakeSubmissionSchema } from './validators.intake.js';

export const ApiErrorCodeSchema = z.enum([
  'MODEL_FAILURE',
  'MISSING_CONTEXT',
  'SEARCH_FAILURE',
  'INVALID_SESSION',
  'INTAKE_ALREADY_SUBMITTED',
  'RECOMMENDATION_NOT_READY',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'INTERNAL_ERROR',
]);

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
  detail: z.string().optional(),
  correlationId: z.string().optional(),
});

export const CreateSessionRequestSchema = z.object({
  customerOrganizationId: z.string().min(1),
  userId: z.string().optional(),
});

export const SubmitIntakeRequestSchema = z.object({
  intake: IntakeSubmissionSchema,
});

export const SendMessageRequestSchema = z.object({
  content: z.string().min(1),
  clientTurnId: z.string().optional(),
});

export type CreateSessionRequestInput = z.input<
  typeof CreateSessionRequestSchema
>;
export type SubmitIntakeRequestInput = z.input<typeof SubmitIntakeRequestSchema>;
export type SendMessageRequestInput = z.input<typeof SendMessageRequestSchema>;
