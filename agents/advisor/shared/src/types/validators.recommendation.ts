/**
 * Zod validators for the RecommendationOutput contract + a defensive parser
 * for LLM-produced JSON.
 *
 * The Copilot SDK returns free text. We instruct the model to emit a single
 * JSON object conforming to RecommendationOutput, but model output is an
 * unreliable boundary: it may be wrapped in markdown fences, contain leading
 * prose, or drift from the schema. `extractAndParseRecommendation` normalizes
 * and shape-validates that output. DOMAIN validation (e.g. instruction IDs must
 * match actually-loaded instructions, similar-project IDs must come from real
 * search results) is the caller's responsibility, because it depends on
 * request context the schema cannot see.
 */

import { z } from 'zod';
import type { RecommendationOutput } from './recommendation.js';

const EvidenceSourceSchema = z.enum([
  'intake',
  'conversation',
  'customInstructions',
  'organizationContext',
  'frameworkDocs',
  'projectSearch',
  'agentInference',
  'missingEvidence',
]);

const RecommendedTechnologySchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
});

export const RecommendationOutputSchema = z.object({
  generatedAt: z.string().min(1),
  status: z.enum([
    'awaitingEvidence',
    'recommendationReady',
    'humanReviewRequired',
    'insufficientEvidence',
  ]),
  confidence: z.enum(['Low', 'Medium', 'Medium-High', 'High']),
  recommendedApproach: z.object({
    summary: z.string().min(1),
    primaryTechnologies: z.array(RecommendedTechnologySchema).min(1),
    supportingTechnologies: z.array(RecommendedTechnologySchema),
  }),
  rationale: z
    .array(
      z.object({
        reason: z.string().min(1),
        evidence: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  customInstructionInfluence: z.array(
    z.object({
      instructionId: z.string().min(1),
      effect: z.string().min(1),
    }),
  ),
  tradeOffs: z.array(
    z.object({
      tradeOff: z.string().min(1),
      acceptedForPoc: z.boolean(),
    }),
  ),
  assumptions: z.array(z.string().min(1)),
  followUpQuestions: z.array(z.string().min(1)),
  similarProjectHighlights: z.array(
    z.object({
      projectId: z.string().min(1),
      title: z.string().min(1),
      whyItMatters: z.string().min(1),
    }),
  ),
  decisionEvidenceSources: z.array(EvidenceSourceSchema).min(1),
});

/**
 * Strip markdown code fences and extract the first balanced JSON object from a
 * free-text model response. Returns the raw JSON string, or null if none found.
 */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  // Remove ```json ... ``` or ``` ... ``` fences if present.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch?.[1] ?? text;

  const start = candidate.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return candidate.slice(start, i + 1);
      }
    }
  }
  return null;
}

export interface RecommendationParseResult {
  ok: boolean;
  value?: RecommendationOutput;
  error?: string;
}

/**
 * Defensively extract + shape-validate a RecommendationOutput from a free-text
 * model response. Does NOT apply domain constraints — see the agent for those.
 */
export function extractAndParseRecommendation(
  text: string,
): RecommendationParseResult {
  const json = extractJsonObject(text);
  if (json === null) {
    return { ok: false, error: 'No JSON object found in model response.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${String(err)}` };
  }

  const result = RecommendationOutputSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `Schema validation failed: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    };
  }

  return { ok: true, value: result.data as RecommendationOutput };
}
