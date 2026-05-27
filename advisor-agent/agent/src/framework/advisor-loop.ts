/**
 * Advisor Reasoning Loop — M1 implementation.
 *
 * Uses Azure OpenAI chat completions with function/tool calling to orchestrate
 * the Microsoft AI Decision Framework phases:
 *
 *   1. Clarify missing intake fields (FR-010)
 *   2. BXT scoring (FR-009, Step 1)
 *   3. Reuse Gate — search system-inventory-v1 (FR-005, Step 1b)
 *   4. 9 Questions — Technology Groupings (FR-009, Step 2)
 *   5. Produce ReadinessBrief (FR-011, Step 3)
 *
 * FR-002 note: @github/copilot-sdk (beta.8) wraps GitHub Copilot CLI JSON-RPC —
 * it is NOT an Azure AI agent orchestration SDK. Direct @azure/openai client is
 * the correct choice for AOAI chat completions with tool calling. See decision
 * file .squad/decisions/inbox/dallas-m1-reasoning-loop.md for rationale.
 *
 * Microsoft Learn — Azure OpenAI function calling:
 * https://learn.microsoft.com/azure/ai-services/openai/how-to/function-calling
 *
 * FR-002, FR-009, FR-010, FR-011, FR-024.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { AzureOpenAI } from "openai";
import type { TokenCredential } from "@azure/identity";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions.js";
import type { IntakeFields } from "./intake.js";
import type {
  OrgContext,
  BxtScore,
  SimilarProjectMatch,
  ReuseGateDecision,
  ReadinessBrief,
} from "../data/models.js";
import type { IProjectSearch } from "../search/project-index.js";

// ---------------------------------------------------------------------------
// Data file loading
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../../../data");

function loadJson<T>(filename: string, fallback: T): T {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const ADVISOR_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchSimilarProjects",
      description:
        "Search the organisation's system inventory for existing AI projects similar to the user's idea. Returns ranked matches with scores. Call this after BXT scoring as Step 1b (Reuse Gate).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query synthesised from the user's business outcome, target users, and desired behavior. Be specific and include key domain terms.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scoreBXT",
      description:
        "Record the BXT (Business-Desirability-Feasibility) score for the user's idea after Phase 1 assessment. Scores are 0-10 each.",
      parameters: {
        type: "object",
        properties: {
          viability: { type: "number", description: "Business viability score 0-10." },
          desirability: { type: "number", description: "Human desirability score 0-10." },
          feasibility: { type: "number", description: "Technical feasibility score 0-10." },
          rationale: {
            type: "string",
            description: "2-3 sentence plain English rationale for the scores.",
          },
        },
        required: ["viability", "desirability", "feasibility", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recordReuseDecision",
      description:
        "Record the reuse gate decision: whether to link this request to an existing project or continue as a new initiative.",
      parameters: {
        type: "object",
        properties: {
          decision: {
            type: "string",
            enum: ["link-to-existing", "continue-as-new", "pending"],
            description: "The reuse decision.",
          },
          selectedProjectId: {
            type: "string",
            description: "ID of the selected existing project when decision is 'link-to-existing'.",
          },
          rationale: { type: "string", description: "Why this decision was made." },
        },
        required: ["decision", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "produceReadinessBrief",
      description:
        "Finalise and record the project readiness brief — the advisor's complete technology recommendation. Call this as the last step after the 9 questions are answered.",
      parameters: {
        type: "object",
        properties: {
          recommendedPlatform: {
            type: "object",
            description: "The recommended Microsoft AI platform.",
            properties: {
              platformKey: { type: "string", description: "Short key e.g. 'copilot-studio', 'm365-agents-sdk', 'azure-ai-foundry'." },
              displayName: { type: "string", description: "Human-readable name." },
              rationale: { type: "string", description: "Why this platform is recommended." },
              estimatedComplexity: { type: "string", enum: ["low", "medium", "high"] },
              tradeOffs: { type: "string", description: "Key trade-offs to communicate." },
              runnerUpAlternatives: {
                type: "array",
                items: { type: "string" },
                description: "1-2 runner-up alternatives with brief reason.",
              },
            },
            required: ["platformKey", "displayName", "rationale", "estimatedComplexity", "tradeOffs", "runnerUpAlternatives"],
          },
          risks: {
            type: "array",
            items: { type: "string" },
            description: "Key risks and mitigations (3-5 bullet points).",
          },
          nextActions: {
            type: "array",
            items: { type: "string" },
            description: "Immediate next steps for the team (3-5 action items).",
          },
        },
        required: ["recommendedPlatform", "risks", "nextActions"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool call result types
// ---------------------------------------------------------------------------

interface BxtToolArgs {
  viability: number;
  desirability: number;
  feasibility: number;
  rationale: string;
}

interface SearchToolArgs {
  query: string;
}

interface ReuseToolArgs {
  decision: "link-to-existing" | "continue-as-new" | "pending";
  selectedProjectId?: string;
  rationale: string;
}

interface BriefToolArgs {
  recommendedPlatform: {
    platformKey: string;
    displayName: string;
    rationale: string;
    estimatedComplexity: "low" | "medium" | "high";
    tradeOffs: string;
    runnerUpAlternatives: string[];
  };
  risks: string[];
  nextActions: string[];
}

// ---------------------------------------------------------------------------
// Loop output
// ---------------------------------------------------------------------------

export interface AdvisorLoopResult {
  assistantText: string;
  bxtScore?: BxtScore;
  searchMatches?: SimilarProjectMatch[];
  reuseDecision?: ReuseGateDecision;
  readinessBrief?: ReadinessBrief;
  orgContextVersion: string;
  /** Accumulated AOAI token usage across all loop iterations (non-streaming only). */
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ---------------------------------------------------------------------------
// SSE streaming event types emitted via the onEvent callback
// ---------------------------------------------------------------------------

export interface SSELoopEvent {
  event: "tool.invoked" | "tool.result" | "text.delta";
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  orgCtx: OrgContext | null,
  frameworkAnchors: Record<string, unknown>
): string {
  const orgSection = orgCtx
    ? `
## Organisation Context (v${orgCtx.version})
**Entitlements:**
${orgCtx.entitlements
  .map((e) => `- ${e.displayName}: ${e.status}${e.restrictionNotes ? ` (${e.restrictionNotes})` : ""}`)
  .join("\n")}

**Custom Instructions:**
${orgCtx.customInstructions
  .map((ci) => `- [${ci.kind.toUpperCase()}] ${ci.text}`)
  .join("\n")}
`
    : "\n## Organisation Context\nNot available — apply standard Microsoft best practices.\n";

  const bxtSection = frameworkAnchors.bxt
    ? `
## BXT Scoring Guide
${JSON.stringify(frameworkAnchors.bxt, null, 2)}
`
    : "";

  const questionsSection = Array.isArray(frameworkAnchors.nineQuestions)
    ? `
## The 9 Critical Questions
${(frameworkAnchors.nineQuestions as Array<{ id: string; label: string; description: string }>)
  .map((q) => `${q.id}. **${q.label}**: ${q.description}`)
  .join("\n")}
`
    : "";

  return `You are the Microsoft AI Project Advisor — an expert AI architect and decision guide embedded inside the Microsoft AI Decision Framework.

Your role is to help business users make evidence-based decisions about which Microsoft AI technology is right for their project idea.

## Your Reasoning Process
Follow this exact sequence:

**Phase 1 — Intake & Clarification**
1. Review the provided intake fields. If businessOutcome, targetUsers, or desiredBehavior are vague or missing, ask targeted clarification questions (max 3 at once). Do NOT proceed to BXT until you have enough signal.

**Phase 1 — BXT Assessment**  
2. Once intake is clear, call the \`scoreBXT\` tool with numeric scores (0-10 each for viability, desirability, feasibility) and a plain-English rationale. A composite score below 15/30 is an early exit — tell the user to revisit the business case.

**Step 1b — Reuse Gate**
3. Call \`searchSimilarProjects\` with a synthesised query. If matches exist with score >= 0.5, present the top 3 to the user and ask whether to link to an existing project. Then call \`recordReuseDecision\`.

**Phase 2 — 9 Questions**
4. Walk through the 9 critical questions. Ask 2-3 at a time if the intake doesn't already answer them. Build your technology groupings shortlist as answers accumulate.

**Phase 3 — Readiness Brief**
5. When you have enough signal (all 9 questions answered or confidently inferred), call \`produceReadinessBrief\` with the full recommendation.

## Response Style
- Be direct and authoritative but conversational — like a senior architect mentoring a colleague.
- Use the Teaching Triad: Concept → Analogy → Product recommendation.
- Never recommend a technology just because it's popular. Ground every recommendation in the 9 questions and the org context.
- Surface unavailable/restricted products from the org context as blockers before the user gets too excited.
- Include concrete next actions, not generic advice.

## Hard Rules
- NEVER recommend products listed as \`unavailable\` in the org entitlements below.
- ALWAYS flag \`hard-constraint\` custom instructions if they affect the recommendation.
- ALWAYS call \`produceReadinessBrief\` as the final tool call before ending the conversation.
${orgSection}
${bxtSection}
${questionsSection}`;
}

// ---------------------------------------------------------------------------
// Main loop function
// ---------------------------------------------------------------------------

export interface AdvisorLoopDeps {
  aoaiClient: AzureOpenAI;
  deployment: string;
  projectSearch: IProjectSearch | null;
  orgCtx: OrgContext | null;
  /** Optional SSE callback — when present, model calls use streaming and emit text.delta events. */
  onEvent?: (event: SSELoopEvent) => void;
}

export async function runAdvisorLoop(
  intake: IntakeFields,
  conversationHistory: ChatCompletionMessageParam[],
  deps: AdvisorLoopDeps
): Promise<AdvisorLoopResult> {
  const frameworkAnchors = loadJson("framework-anchors.json", {});

  const systemPrompt = buildSystemPrompt(deps.orgCtx, frameworkAnchors);

  // Build initial user message from intake fields
  const intakeMessage = formatIntakeMessage(intake);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: intakeMessage },
  ];

  const result: AdvisorLoopResult = {
    assistantText: "",
    orgContextVersion: deps.orgCtx?.version ?? "none",
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  // Agentic loop — max 8 iterations to prevent runaway tool calls
  for (let i = 0; i < 8; i++) {
    const { content, tool_calls, usage } = await callModelIteration(
      deps.aoaiClient,
      deps.deployment,
      messages,
      deps.onEvent
    );

    // Accumulate token usage across iterations (non-streaming only; streaming returns undefined)
    if (usage && result.tokenUsage) {
      result.tokenUsage.promptTokens += usage.prompt_tokens ?? 0;
      result.tokenUsage.completionTokens += usage.completion_tokens ?? 0;
      result.tokenUsage.totalTokens += usage.total_tokens ?? 0;
    }

    const assistantToolCalls = tool_calls && tool_calls.length > 0 ? tool_calls : undefined;
    messages.push({
      role: "assistant",
      content: content ?? null,
      tool_calls: assistantToolCalls,
    });

    // If no tool calls, this is the final text response
    if (!assistantToolCalls || assistantToolCalls.length === 0) {
      result.assistantText = content ?? "";
      break;
    }

    // Process each tool call
    for (const toolCall of assistantToolCalls) {
      deps.onEvent?.({ event: "tool.invoked", data: { toolName: toolCall.function.name, args: toolCall.function.arguments } });
      const toolResult = await dispatchTool(toolCall.function.name, toolCall.function.arguments, deps, result);
      deps.onEvent?.({ event: "tool.result", data: { toolName: toolCall.function.name, resultSummary: JSON.stringify(toolResult).slice(0, 200) } });
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Model call helper — handles streaming and non-streaming transparently
// ---------------------------------------------------------------------------

/**
 * One iteration of the model call.
 * When onEvent is provided, uses `stream: true` and emits text.delta events for
 * content chunks.  Tool call deltas are accumulated silently then emitted as
 * tool.invoked/tool.result via the main loop.
 */
async function callModelIteration(
  client: AzureOpenAI,
  deployment: string,
  messages: ChatCompletionMessageParam[],
  onEvent?: (event: SSELoopEvent) => void
): Promise<{ content: string | null; tool_calls?: ChatCompletionMessageToolCall[]; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const baseParams = {
    model: deployment,
    messages,
    tools: ADVISOR_TOOLS,
    tool_choice: "auto" as const,
    temperature: 0.3,
    max_tokens: 2000,
  };

  if (onEvent) {
    // Streaming path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await (client.chat.completions.create as (p: any) => Promise<AsyncIterable<any>>)({
      ...baseParams,
      stream: true,
    });

    let accContent = "";
    const toolCallsMap = new Map<number, { id: string; type: "function"; function: { name: string; arguments: string } }>();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content) {
        accContent += delta.content;
        onEvent({ event: "text.delta", data: { text: delta.content } });
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx: number = tc.index ?? 0;
          if (!toolCallsMap.has(idx)) {
            toolCallsMap.set(idx, { id: "", type: "function", function: { name: "", arguments: "" } });
          }
          const acc = toolCallsMap.get(idx)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.function.name += tc.function.name;
          if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
        }
      }
    }

    const tool_calls =
      toolCallsMap.size > 0
        ? [...toolCallsMap.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, tc]) => tc as ChatCompletionMessageToolCall)
        : undefined;

    return { content: accContent || null, tool_calls };
  } else {
    // Non-streaming path — response.usage is available here
    const response = await client.chat.completions.create(baseParams);
    const choice = response.choices[0];
    if (!choice) return { content: null };
    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls,
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

async function dispatchTool(
  name: string,
  argsJson: string,
  deps: AdvisorLoopDeps,
  result: AdvisorLoopResult
): Promise<unknown> {
  const args = JSON.parse(argsJson);

  switch (name) {
    case "scoreBXT": {
      const a = args as BxtToolArgs;
      result.bxtScore = {
        viability: a.viability,
        desirability: a.desirability,
        feasibility: a.feasibility,
        summary: a.rationale,
      };
      return { ok: true, composite: a.viability + a.desirability + a.feasibility };
    }

    case "searchSimilarProjects": {
      const a = args as SearchToolArgs;
      if (!deps.projectSearch) {
        result.searchMatches = [];
        return { matches: [], message: "Search index not configured." };
      }
      try {
        const matches = await deps.projectSearch.findSimilar(a.query, 5);
        result.searchMatches = matches;
        return { matches: matches.map((m) => ({ id: m.projectId, name: m.name, score: m.score, summary: m.summary })) };
      } catch (err) {
        console.error("[advisor-loop] searchSimilarProjects error:", err);
        result.searchMatches = [];
        return { matches: [], message: "Search temporarily unavailable." };
      }
    }

    case "recordReuseDecision": {
      const a = args as ReuseToolArgs;
      result.reuseDecision = {
        decision: a.decision,
        rationale: a.rationale,
        selectedProjectId: a.selectedProjectId,
        matchesPresented: result.searchMatches ?? [],
      };
      return { ok: true };
    }

    case "produceReadinessBrief": {
      const a = args as BriefToolArgs;
      result.readinessBrief = {
        recommendedPlatform: a.recommendedPlatform,
        bxtScore: result.bxtScore ?? { viability: 0, desirability: 0, feasibility: 0, summary: "Not scored" },
        alignmentNotes: [],
        risks: a.risks,
        nextActions: a.nextActions,
        orgContextVersion: result.orgContextVersion,
        generatedAt: new Date().toISOString(),
      };
      return { ok: true };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Intake formatter
// ---------------------------------------------------------------------------

function formatIntakeMessage(intake: IntakeFields): string {
  const lines = [
    "Here is my project idea for the Microsoft AI Decision Framework advisor:",
    "",
    `**Business Outcome:** ${intake.businessOutcome || "(not provided)"}`,
    `**Target Users:** ${intake.targetUsers || "(not provided)"}`,
    `**Desired Behavior:** ${intake.desiredBehavior || "(not provided)"}`,
  ];

  if (intake.dataSources) lines.push(`**Data Sources:** ${intake.dataSources}`);
  if (intake.actions) lines.push(`**Actions Required:** ${intake.actions}`);
  if (intake.constraints) lines.push(`**Constraints:** ${intake.constraints}`);

  lines.push("", "Please guide me through the framework and produce a readiness brief.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// AOAI client factory
// ---------------------------------------------------------------------------

export function createAoaiClient(credential: TokenCredential): AzureOpenAI {
  const endpoint = process.env.AOAI_ENDPOINT;
  if (!endpoint) throw new Error("AOAI_ENDPOINT env var is required");

  return new AzureOpenAI({
    endpoint,
    apiVersion: "2024-12-01-preview",
    azureADTokenProvider: async () => {
      const token = await credential.getToken("https://cognitiveservices.azure.com/.default");
      if (!token) throw new Error("Failed to acquire AOAI token from managed identity");
      return token.token;
    },
  });
}
